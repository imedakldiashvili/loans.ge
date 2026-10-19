import { Body, Controller, Get, Injectable, Post, Put, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { z } from 'zod';
import { parse } from '../core/crud';
import { AppError, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';
import { AuthService, parseLogin } from './auth.service';
import { AuthedRequest, sessionCookie, userAuth } from './auth.types';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

// The site PIN for customers: sign in with e-mail / mobile + a 4–6 digit PIN instead of a one-time code.
//   set / change:  POST /client/pin/sendOtp (a code to the account's e-mail, or mobile) → PUT /client/pin/set { Pin, Otp }
//   right after signing in with a code (that session, under 10 min old) the PIN is set / reset without another code
//   ("forgot the PIN" = sign in with a code, then a new PIN); a session opened with the PIN itself always needs the code
//   remove:        PUT /client/pin/remove            status: GET /client/pin/status
//   sign in:       POST /public/auth/pinLogin { Login, Pin } (sets the session cookie)
// Only a scrypt hash is kept. 5 wrong PINs in a row lock it for 15 minutes; the answer never tells
// whether the account exists or has a PIN.

const scrypt = promisify(scryptCb) as (pin: string, salt: Buffer, len: number) => Promise<Buffer>;
const KEY_LEN = 32;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

/** A new PIN: exactly \`len\` digits (admin → settings → PIN), not all the same, not in a row. */
const pinField = (len: number) =>
  z
    .string()
    .regex(new RegExp(`^\\d{${len}}$`), `${len} ციფრი`)
    .refine((p) => !/^(\d)\1+$/.test(p), 'ერთნაირი ციფრები არ გამოდგება')
    .refine((p) => !'0123456789'.includes(p) && !'9876543210'.includes(p), 'ციფრები ზედიზედ არ გამოდგება');
const setBody = (len: number) =>
  z.object({ pin: pinField(len), otp: z.object({ id: z.coerce.bigint(), uid: z.string().uuid(), code: z.string().trim().regex(/^\d{4,6}$/) }).nullable().default(null) });
const DEFAULT_LENGTH = 4;
const FRESH_MS = 10 * 60_000;
const loginBody = z.object({ login: z.string().trim().min(3), pin: z.string().trim() });

const hashPin = async (pin: string) => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('base64')}$${(await scrypt(pin, salt, KEY_LEN)).toString('base64')}`;
};
const checkPin = async (pin: string, stored: string) => {
  const [, salt, hash] = stored.split('$');
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pin, Buffer.from(salt, 'base64'), want.length);
  return got.length === want.length && timingSafeEqual(got, want);
};
/** For an unknown account the same work is done, so the answer time does not tell it apart. */
const DUMMY = `scrypt$${randomBytes(16).toString('base64')}$${randomBytes(KEY_LEN).toString('base64')}`;
const WRONG = () => new AppError('UNAUTHORIZED', 'ელ. ფოსტა / მობილური ან PIN არასწორია');

@Injectable()
export class PinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** How many digits a new PIN has (admin setting "pin"). */
  async pinLength() {
    const s = await this.prisma.setting.findFirst({ where: { key: 'pin', isDeleted: false } });
    const n = Number((s?.value as { length?: number } | null)?.length);
    return n >= 4 && n <= 6 ? n : DEFAULT_LENGTH;
  }

  /** IsSet / SetOn / Length — the length of a new PIN (the keypad of the set form). */
  async status(userId: bigint) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { pinSetOn: true, pinHash: true, pinLockedUntil: true } });
    return { isSet: !!u.pinHash, setOn: u.pinSetOn, length: await this.pinLength(), lockedUntil: u.pinLockedUntil && u.pinLockedUntil > new Date() ? u.pinLockedUntil : null };
  }

  /** Setting a PIN is confirmed with a code to the account's e-mail (or mobile when there is none). */
  async sendOtp(userId: bigint) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.email) return this.otp.send('email', u.email, `pin:${userId}`);
    if (u.phone) return this.otp.send('sms', u.phone, `pin:${userId}`);
    throw validation([{ field: 'Login', message: 'ანგარიშს ელ. ფოსტა ან მობილური არ აქვს' }]);
  }

  async set(userId: bigint, sessionId: bigint, body: unknown) {
    const len = await this.pinLength();
    const d = parse(setBody(len), body);
    if (d.otp) {
      const ch = await this.otp.verify(d.otp.id, d.otp.uid, d.otp.code);
      if (ch.purpose !== `pin:${userId}`) throw validation([{ field: 'Otp', message: 'კოდი ამ მოქმედებას არ ეკუთვნის' }]);
    } else {
      // no code: only in a session just opened with a code (the user has proven the e-mail / mobile right now)
      const sess = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { createdOn: true, via: true } });
      if (!sess || sess.via !== 'otp' || Date.now() - sess.createdOn.getTime() > FRESH_MS) throw validation([{ field: 'Otp', message: 'დაადასტურე კოდით' }]);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash: await hashPin(d.pin), pinLength: len, pinSetOn: new Date(), pinFails: 0, pinLockedUntil: null, updatedBy: userId, updatedOn: new Date() } });
    return this.status(userId);
  }

  async remove(userId: bigint) {
    await this.prisma.user.update({ where: { id: userId }, data: { pinHash: null, pinLength: null, pinSetOn: null, pinFails: 0, pinLockedUntil: null, updatedBy: userId, updatedOn: new Date() } });
    return this.status(userId);
  }

  /** PIN or code for this login (e-mail / mobile): a PIN only when the customer has set one. */
  async method(body: unknown) {
    const { login } = parse(z.object({ login: z.string().trim().min(3) }), body);
    const { channel, target } = parseLogin(login);
    const user = await this.prisma.user.findFirst({ where: { isDeleted: false, isEnable: true, ...(channel === 'email' ? { email: target } : { phone: target }) }, select: { pinHash: true, pinLength: true } });
    // the keypad shows as many places as this user's PIN has
    return { pin: !!user?.pinHash, length: user?.pinHash ? (user.pinLength ?? DEFAULT_LENGTH) : null };
  }

  async login(body: unknown, meta: { ip?: string; userAgent?: string }) {
    const d = parse(loginBody, body);
    const { channel, target } = parseLogin(d.login);
    const user = await this.prisma.user.findFirst({ where: { isDeleted: false, ...(channel === 'email' ? { email: target } : { phone: target }) } });
    const now = new Date();
    if (user?.pinLockedUntil && user.pinLockedUntil > now) {
      const min = Math.ceil((user.pinLockedUntil.getTime() - now.getTime()) / 60_000);
      throw new AppError('RATE_LIMITED', `PIN დროებით დაბლოკილია — სცადე ${min} წუთში ან შედი კოდით`);
    }
    const ok = await checkPin(d.pin, user?.pinHash ?? DUMMY);
    if (!user || !user.pinHash || !ok) {
      if (user?.pinHash) {
        const fails = user.pinFails + 1;
        await this.prisma.user.update({ where: { id: user.id }, data: fails >= MAX_FAILS ? { pinFails: 0, pinLockedUntil: new Date(now.getTime() + LOCK_MS) } : { pinFails: fails } });
      }
      throw WRONG();
    }
    if (!user.isEnable) throw new AppError('FORBIDDEN', 'ანგარიში გამორთულია');
    const profile = (await this.auth.eligibleProfiles(user.id, 'client'))[0];
    if (!profile) throw WRONG();
    await this.prisma.user.update({ where: { id: user.id }, data: { pinFails: 0, pinLockedUntil: null, lastLoginOn: now } });
    const opened = await this.sessions.open('client', user.id, profile.id, meta, 'pin');
    const ctx = currentContext();
    if (ctx) Object.assign(ctx, { userId: user.id, userProfileId: profile.id, actorType: 'user' });
    return { user, opened };
  }
}

@Controller('client/pin')
export class ClientPinController {
  constructor(private readonly svc: PinService) {}

  @Get('status')
  status(@Req() req: AuthedRequest) {
    return this.svc.status(userAuth(req).userId);
  }

  @Post('sendOtp')
  sendOtp(@Req() req: AuthedRequest) {
    return this.svc.sendOtp(userAuth(req).userId);
  }

  @Put('set')
  set(@Req() req: AuthedRequest, @Body() body: unknown) {
    const a = userAuth(req);
    return this.svc.set(a.userId, a.sessionId, body);
  }

  @Put('remove')
  remove(@Req() req: AuthedRequest) {
    return this.svc.remove(userAuth(req).userId);
  }
}

@Controller('public/auth')
export class PublicPinController {
  constructor(private readonly svc: PinService) {}

  /** The login dialog asks first: does this account sign in with a PIN (→ the PIN field) or with a code? */
  @Post('loginMethod')
  method(@Body() body: unknown) {
    return this.svc.method(body);
  }

  @Post('pinLogin')
  async login(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const { user, opened } = await this.svc.login(body, { ip: req.ip, userAgent: req.header('user-agent') });
    res.cookie(sessionCookie('client'), opened.token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: opened.maxAgeMs,
    });
    return { id: user.id, uid: user.uid };
  }
}
