import { Body, Controller, Get, Injectable, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { parseLogin } from '../auth/auth.service';
import { OtpService } from '../auth/otp.service';
import { parse } from '../core/crud';
import { AppError, conflict, notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';

// Client gateway — the customer's own profile (prototype loans-ge.html cabinet → პროფილი).
// Account: e-mail (login), user name, mobile (changed with an SMS code); personal data and location.

const ids = () => {
  const c = currentContext();
  if (!c?.userId || !c.userProfileId) throw new AppError('UNAUTHORIZED', 'საჭიროა ავტორიზაცია');
  return { userId: c.userId, profileId: c.userProfileId };
};
const phoneOf = (s: string) => {
  const r = parseLogin(s);
  if (r.channel !== 'sms') throw validation([{ field: 'Phone', message: '9 ციფრი, იწყება 5-ით' }]);
  return r.target;
};

const editSchema = z.object({
  userName: z.string().trim().max(60).nullable().default(null),
  pid: z.string().trim().regex(/^\d{11}$/, '11 ციფრი').nullable().default(null),
  firstName: z.string().trim().max(60).nullable().default(null),
  lastName: z.string().trim().max(60).nullable().default(null),
  birthDate: z.coerce.date().nullable().default(null),
  cityId: z.coerce.bigint().nullable().default(null),
  districtId: z.coerce.bigint().nullable().default(null),
  village: z.string().trim().max(100).nullable().default(null),
});
const phoneSchema = z.object({ phone: z.string().trim(), otp: z.object({ id: z.coerce.bigint(), uid: z.string().uuid(), code: z.string().trim().regex(/^\d{4,6}$/) }) });

@Injectable()
export class ClientProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
  ) {}

  private async load(id: number, uid: string) {
    const { userId, profileId } = ids();
    if (BigInt(id) !== profileId) throw notFound('პროფილი');
    const p = await this.prisma.userProfile.findFirst({
      where: { id: profileId, uid, userId, isDeleted: false },
      include: { user: { select: { id: true, uid: true, email: true, phone: true, userName: true, isVerified: true } }, customer: true },
    });
    if (!p) throw notFound('პროფილი');
    return p;
  }

  async detail(id: number, uid: string) {
    const p = await this.load(id, uid);
    return { id: p.id, uid: p.uid, user: p.user, customer: p.customer };
  }

  async edit(id: number, uid: string, body: unknown) {
    const d = parse(editSchema, body);
    const p = await this.load(id, uid);
    if (d.cityId && !(await this.prisma.city.count({ where: { id: d.cityId, isDeleted: false } }))) throw validation([{ field: 'CityID', message: 'ქალაქი ვერ მოიძებნა' }]);
    if (d.districtId && !(await this.prisma.district.count({ where: { id: d.districtId, cityId: d.cityId ?? BigInt(-1), isDeleted: false } }))) {
      throw validation([{ field: 'DistrictID', message: 'უბანი ამ ქალაქს არ ეკუთვნის' }]);
    }
    const now = new Date();
    const by = p.userId;
    const data = { pid: d.pid, firstName: d.firstName, lastName: d.lastName, birthDate: d.birthDate, cityId: d.cityId, districtId: d.districtId, village: d.village };
    // a changed identity is no longer verified
    const c = p.customer;
    const identityChanged = !!c && (c.pid !== d.pid || c.firstName !== d.firstName || c.lastName !== d.lastName);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({ where: { id: p.userId }, data: { userName: d.userName, updatedBy: by, updatedOn: now } });
      await tx.customerDetail.upsert({ where: { userProfileId: p.id }, create: { userProfileId: p.id, createdBy: by, ...data }, update: { ...data, ...(identityChanged ? { isVerified: false } : {}), updatedBy: by, updatedOn: now } });
    });
    return { id: p.id, uid: p.uid };
  }

  /** New mobile: an SMS code goes to the new number. */
  async sendPhoneOtp(body: unknown) {
    const { phone } = parse(z.object({ phone: z.string().trim() }), body);
    const target = phoneOf(phone);
    const { userId } = ids();
    if (await this.prisma.user.count({ where: { phone: target, isDeleted: false, NOT: { id: userId } } })) throw conflict('ეს ნომერი სხვა ანგარიშზეა');
    return this.otp.send('sms', target, `phone:${userId}`);
  }

  async changePhone(id: number, uid: string, body: unknown) {
    const d = parse(phoneSchema, body);
    const p = await this.load(id, uid);
    const phone = phoneOf(d.phone);
    const ch = await this.otp.verify(d.otp.id, d.otp.uid, d.otp.code);
    if (ch.purpose !== `phone:${p.userId}` || ch.target !== phone) throw validation([{ field: 'Otp', message: 'კოდი ამ ნომერს არ ეკუთვნის' }]);
    if (await this.prisma.user.count({ where: { phone, isDeleted: false, NOT: { id: p.userId } } })) throw conflict('ეს ნომერი სხვა ანგარიშზეა');
    await this.prisma.user.update({ where: { id: p.userId }, data: { phone, updatedBy: p.userId, updatedOn: new Date() } });
    return { id: p.id, uid: p.uid };
  }
}

@Controller('client/profile')
export class ClientProfileController {
  constructor(private readonly svc: ClientProfileService) {}

  @Get('detail/:id/:uid')
  detail(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.detail(id, uid);
  }

  @Put('edit/:id/:uid')
  edit(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
    return this.svc.edit(id, uid, body);
  }

  @Post('sendPhoneOtp')
  sendPhoneOtp(@Body() body: unknown) {
    return this.svc.sendPhoneOtp(body);
  }

  @Put('changePhone/:id/:uid')
  changePhone(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Body() body: unknown) {
    return this.svc.changePhone(id, uid, body);
  }
}

/** Home page numbers (prototype hero stats). */
@Controller('public/stats')
export class PublicStatsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary() {
    const [applications, customers, organizations] = await Promise.all([
      this.prisma.application.count({ where: { isDeleted: false } }),
      this.prisma.userProfile.count({ where: { isDeleted: false, profileType: { code: 'customer' } } }),
      this.prisma.organization.count({ where: { isDeleted: false, isEnable: true, isPartner: true } }),
    ]);
    return { applications, customers, organizations };
  }
}

