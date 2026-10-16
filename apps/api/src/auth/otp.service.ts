import { Injectable } from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { AppError, notFound } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { EmailSender, SmsSender } from '../notify/notifier';

interface Channel {
  on: boolean;
  len: number;
  ttl: number;
  tries: number;
  resend: number;
  sender: string;
  tpl: string;
}

export type OtpChannel = 'sms' | 'email';

const hashCode = (uid: string, code: string) => createHash('sha256').update(`${uid}:${code}`).digest('hex');

/** One-time codes by SMS / email — length, lifetime, tries, resend interval and template come from settings (`otp`). */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsSender,
    private readonly email: EmailSender,
  ) {}

  private async settings(channel: OtpChannel): Promise<Channel> {
    const row = await this.prisma.setting.findFirst({ where: { key: 'otp', isDeleted: false } });
    const cfg = (row?.value as Record<OtpChannel, Channel> | undefined)?.[channel];
    if (!cfg) throw new AppError('INTERNAL_ERROR', 'OTP პარამეტრები არ არის');
    return cfg;
  }

  async send(channel: OtpChannel, target: string, purpose: string) {
    const cfg = await this.settings(channel);
    if (!cfg.on) throw new AppError('VALIDATION_ERROR', channel === 'sms' ? 'SMS კოდი გამორთულია — გამოიყენე ელ.ფოსტა' : 'ელ.ფოსტის კოდი გამორთულია — გამოიყენე მობილური');
    const last = await this.prisma.otpChallenge.findFirst({ where: { target, purpose, isDeleted: false }, orderBy: { createdOn: 'desc' } });
    if (last && Date.now() - last.createdOn.getTime() < cfg.resend * 1000) {
      const wait = Math.ceil((cfg.resend * 1000 - (Date.now() - last.createdOn.getTime())) / 1000);
      throw new AppError('RATE_LIMITED', `ახალი კოდის გაგზავნა შესაძლებელია ${wait} წამში`);
    }
    const code = String(randomInt(0, 10 ** cfg.len)).padStart(cfg.len, '0');
    const row = await this.prisma.otpChallenge.create({
      data: { channel, target, purpose, codeHash: 'pending', expiresOn: new Date(Date.now() + cfg.ttl * 1000) },
    });
    await this.prisma.otpChallenge.update({ where: { id: row.id }, data: { codeHash: hashCode(row.uid, code) } });
    const text = cfg.tpl.replace('{code}', code);
    if (channel === 'sms') await this.sms.send(target, text);
    else await this.email.send(target, 'loans.ge — ერთჯერადი კოდი', text);
    return { id: row.id, uid: row.uid };
  }

  /** Checks the code; on success the challenge is consumed and returned. */
  async verify(id: bigint, uid: string, code: string) {
    const ch = await this.prisma.otpChallenge.findFirst({ where: { id, uid, isDeleted: false } });
    if (!ch || ch.consumedOn) throw notFound('კოდი');
    const cfg = await this.settings(ch.channel as OtpChannel);
    if (ch.expiresOn < new Date()) throw new AppError('VALIDATION_ERROR', 'კოდის ვადა გავიდა — მოითხოვე ახალი', [{ field: 'Otp', message: 'ვადა გავიდა' }]);
    if (ch.attempts >= cfg.tries) throw new AppError('RATE_LIMITED', 'მცდელობები ამოიწურა — მოითხოვე ახალი კოდი');
    const a = Buffer.from(hashCode(ch.uid, code));
    const b = Buffer.from(ch.codeHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
      const left = cfg.tries - ch.attempts - 1;
      throw new AppError('VALIDATION_ERROR', left > 0 ? `კოდი არასწორია — დარჩა ${left} მცდელობა` : 'კოდი არასწორია — მცდელობები ამოიწურა', [{ field: 'Otp', message: 'არასწორია' }]);
    }
    await this.prisma.otpChallenge.update({ where: { id: ch.id }, data: { consumedOn: new Date(), attempts: { increment: 1 } } });
    return ch;
  }
}
