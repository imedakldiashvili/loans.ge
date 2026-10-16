import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../core/crud';
import { AppError, notFound } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';
import { AuthGateway, GATEWAY_PROFILE } from './auth.types';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

const loginSchema = z.object({
  gateway: z.enum(['admin', 'partner', 'client']),
  login: z.string().trim().min(3),
});
const verifySchema = z.object({
  id: z.coerce.bigint(),
  uid: z.string().uuid(),
  otp: z.string().trim().regex(/^\d{4,6}$/, '4–6 ციფრი'),
  /** optional: which profile to open the session with (several staff profiles) */
  profileId: z.coerce.bigint().optional(),
});

/** Georgian mobile: 9 digits starting with 5 (with or without +995). */
const normPhone = (s: string) => {
  const d = s.replace(/\D/g, '').replace(/^995/, '');
  return /^5\d{8}$/.test(d) ? d : null;
};

/** Login is an email or a mobile number. */
export const parseLogin = (login: string): { channel: 'email' | 'sms'; target: string } => {
  if (login.includes('@')) {
    const email = login.toLowerCase();
    if (!z.string().email().safeParse(email).success) throw new AppError('VALIDATION_ERROR', 'ელ.ფოსტა არასწორია', [{ field: 'Login', message: 'არასწორი ფორმატი' }]);
    return { channel: 'email', target: email };
  }
  const phone = normPhone(login);
  if (!phone) throw new AppError('VALIDATION_ERROR', 'მობილური ნომერი არასწორია', [{ field: 'Login', message: '9 ციფრი, იწყება 5-ით' }]);
  return { channel: 'sms', target: phone };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
  ) {}

  private findUser(channel: 'email' | 'sms', target: string) {
    return this.prisma.user.findFirst({ where: { isDeleted: false, ...(channel === 'email' ? { email: target } : { phone: target }) } });
  }

  /** Profiles of the user that can open a session on this gateway (enabled; staff — enabled organisation). */
  eligibleProfiles(userId: bigint, gateway: AuthGateway) {
    return this.prisma.userProfile.findMany({
      where: {
        userId, isDeleted: false, isEnable: true, profileType: { code: GATEWAY_PROFILE[gateway] },
        ...(gateway === 'partner' ? { organization: { isDeleted: false, isEnable: true } } : {}),
      },
      include: { profileType: true, organization: { select: { id: true, uid: true, nameKa: true, nameEn: true } } },
      orderBy: { id: 'asc' },
    });
  }

  /** Step 1: send a code. Admin / partner accounts must exist; a client account is created on first login. */
  async sendOtp(body: unknown) {
    const { gateway, login } = parse(loginSchema, body);
    const { channel, target } = parseLogin(login);
    if (gateway !== 'client') {
      const user = await this.findUser(channel, target);
      if (!user) throw notFound('ანგარიში');
      if (!user.isEnable) throw new AppError('FORBIDDEN', 'ანგარიში გამორთულია');
      const profiles = await this.eligibleProfiles(user.id, gateway);
      if (!profiles.length) {
        const any = await this.prisma.userProfile.count({ where: { userId: user.id, isDeleted: false, profileType: { code: GATEWAY_PROFILE[gateway] } } });
        throw any ? new AppError('FORBIDDEN', 'ანგარიში გამორთულია') : notFound('ანგარიში');
      }
    }
    return this.otp.send(channel, target, `login:${gateway}`);
  }

  /** Step 2: check the code and open a session (cookie is set by the controller). */
  async verifyOtp(body: unknown, meta: { ip?: string; userAgent?: string }) {
    const { id, uid, otp, profileId } = parse(verifySchema, body);
    const ch = await this.otp.verify(id, uid, otp);
    const gateway = ch.purpose.replace(/^login:/, '') as AuthGateway;
    const channel = ch.channel as 'email' | 'sms';

    let user = await this.findUser(channel, ch.target);
    if (!user) {
      if (gateway !== 'client') throw notFound('ანგარიში');
      user = await this.createCustomer(channel, ch.target);
    } else if (gateway === 'client' && !(await this.eligibleProfiles(user.id, 'client')).length) {
      // an existing user (e.g. bank staff) logs in as a borrower for the first time — add the customer profile
      await this.addCustomerProfile(user.id);
    }
    if (!user.isEnable) throw new AppError('FORBIDDEN', 'ანგარიში გამორთულია');

    const profiles = await this.eligibleProfiles(user.id, gateway);
    const profile = profileId ? profiles.find((p) => p.id === profileId) : profiles[0];
    if (!profile) throw new AppError('FORBIDDEN', 'პროფილი მიუწვდომელია');

    // the code was delivered there, so this contact is verified
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginOn: new Date(), ...(user.isVerified ? {} : { isVerified: true }) } });
    const opened = await this.sessions.open(gateway, user.id, profile.id, meta);
    const ctx = currentContext();
    if (ctx) Object.assign(ctx, { userId: user.id, userProfileId: profile.id, actorType: 'user' });
    return { gateway, user, opened };
  }

  private async customerProfileType() {
    const t = await this.prisma.profileType.findFirst({ where: { code: 'customer', isDeleted: false } });
    if (!t) throw new AppError('INTERNAL_ERROR', 'პროფილის ტიპი customer არ არის');
    return t;
  }

  /** A user is always created together with a profile (STANDARDS: at least one profile). */
  private async createCustomer(channel: 'email' | 'sms', target: string) {
    const type = await this.customerProfileType();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({ data: channel === 'email' ? { email: target } : { phone: target } });
      await tx.userProfile.create({ data: { userId: user.id, profileTypeId: type.id, createdBy: user.id, customer: { create: { createdBy: user.id } } } });
      return user;
    });
  }

  private async addCustomerProfile(userId: bigint) {
    const type = await this.customerProfileType();
    await this.prisma.userProfile.create({ data: { userId, profileTypeId: type.id, createdBy: userId, customer: { create: { createdBy: userId } } } });
  }

  /** Current user, the session's profile and the other profiles available on this gateway. */
  async me(gateway: AuthGateway, userId: bigint, userProfileId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, uid: true, email: true, phone: true, userName: true, isVerified: true, lastLoginOn: true } });
    const profiles = await this.eligibleProfiles(userId, gateway);
    const view = (p: (typeof profiles)[number]) => ({ id: p.id, uid: p.uid, profileType: p.profileType.code, role: p.role, displayName: p.displayName, organization: p.organization });
    const current = profiles.find((p) => p.id === userProfileId);
    return { user, profile: current ? view(current) : null, profiles: profiles.map(view) };
  }
}
