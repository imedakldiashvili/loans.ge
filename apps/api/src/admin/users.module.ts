import { Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z, ZodTypeAny } from 'zod';
import { parseLogin } from '../auth/auth.service';
import { CrudConfig, crudController, CrudService, parse } from '../core/crud';
import { AppError, conflict, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext, currentUserId } from '../core/request-context';

// Users and their profiles (admin gateway):
//   /admin/user      — every person: contacts, enable/disable (no add/delete — a user is created together with a profile)
//   /admin/admin     — admin profiles (role super | operator | analyst)
//   /admin/staff     — organisation staff profiles (role sales | back, scope by partner products and cities)
//   /admin/customer  — borrower profiles (view, enable/disable)
// One `user` table; every user keeps at least one profile (STANDARDS.md §5).

export const contacts = {
  email: z.string().trim().toLowerCase().email().nullable().default(null),
  phone: z.string().trim().nullable().default(null),
};
export const userInclude = { user: { select: { id: true, uid: true, email: true, phone: true, userName: true, isEnable: true, isVerified: true, lastLoginOn: true } } };

/** Normalises email/phone through the same rules as login; at least one is required. */
const normContacts = (d: { email: string | null; phone: string | null }) => {
  if (!d.email && !d.phone) throw validation([{ field: 'Email', message: 'ელ.ფოსტა ან მობილური სავალდებულოა' }]);
  const phone = d.phone ? parseLogin(d.phone).target : null;
  return { email: d.email, phone };
};

const typeId = async (prisma: PrismaService, code: string) => {
  const t = await prisma.profileType.findFirst({ where: { code, isDeleted: false } });
  if (!t) throw new AppError('INTERNAL_ERROR', `პროფილის ტიპი ${code} არ არის`);
  return t.id;
};

/** Own profile can't be disabled or deleted (prototype rule "(შენ)"). */
const notSelf = (row: Record<string, unknown>) => {
  if (row.id === currentContext()?.userProfileId) throw conflict('საკუთარ ანგარიშს ვერ გამორთავ და ვერ წაშლი');
};

/** CRUD over user_profile of one profile type; add/edit also create/update the user's contacts. */
class ProfileService extends CrudService {
  constructor(
    prisma: PrismaService,
    cfg: CrudConfig,
    private readonly typeCode: string,
    private readonly profileData: (d: Record<string, unknown>, prisma: PrismaService) => Promise<Record<string, unknown>>,
  ) {
    super(prisma, cfg);
  }

  async add(body: unknown) {
    const d = parse(this.cfg.schema, body) as Record<string, unknown>;
    const { email, phone } = normContacts(d as { email: string | null; phone: string | null });
    const profile = await this.profileData(d, this.prisma);
    const profileTypeId = await typeId(this.prisma, this.typeCode);
    const by = currentUserId();
    const users = await this.prisma.user.findMany({ where: { isDeleted: false, OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] } });
    if (users.length > 1) throw conflict('ელ.ფოსტა და მობილური სხვადასხვა მომხმარებელს ეკუთვნის');
    let user = users[0];
    if (user) {
      const dup = await this.prisma.userProfile.count({
        where: { userId: user.id, profileTypeId, isDeleted: false, ...(profile.organizationId ? { organizationId: profile.organizationId as bigint } : {}) },
      });
      if (dup) throw conflict('ამ მომხმარებელს ასეთი პროფილი უკვე აქვს');
    }
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (!user) user = await tx.user.create({ data: { email, phone, userName: (d.displayName as string) ?? null, createdBy: by } });
      else if ((email && !user.email) || (phone && !user.phone)) {
        user = await tx.user.update({ where: { id: user.id }, data: { email: user.email ?? email, phone: user.phone ?? phone, updatedBy: by, updatedOn: new Date() } });
      }
      const row = await tx.userProfile.create({ data: { userId: user.id, profileTypeId, createdBy: by, ...profile }, select: { id: true, uid: true } });
      return { id: row.id, uid: row.uid };
    });
  }

  async edit(id: number, uid: string, body: unknown) {
    const existing = await this.get(id, uid);
    const d = parse(this.cfg.schema, body) as Record<string, unknown>;
    const { email, phone } = normContacts(d as { email: string | null; phone: string | null });
    const profile = await this.profileData(d, this.prisma);
    const by = currentUserId();
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({ where: { id: existing.userId as bigint }, data: { email, phone, updatedBy: by, updatedOn: new Date() } });
      const row = await tx.userProfile.update({ where: { id: BigInt(id) }, data: { ...profile, updatedBy: by, updatedOn: new Date() }, select: { id: true, uid: true } });
      return { id: row.id, uid: row.uid };
    });
  }
}

const lastProfileGuard = async (row: Record<string, unknown>, prisma: PrismaService) => {
  notSelf(row);
  const n = await prisma.userProfile.count({ where: { userId: row.userId as bigint, isDeleted: false } });
  if (n <= 1) throw conflict('მომხმარებლის ბოლო პროფილს ვერ წაშლი — გამორთე');
};

export const profileModule = (
  module: string,
  typeCode: string,
  cfg: Omit<CrudConfig, 'gateway' | 'module' | 'model' | 'scope'> & { schema: ZodTypeAny },
  profileData: (d: Record<string, unknown>, prisma: PrismaService) => Promise<Record<string, unknown>>,
  gateway = 'admin',
) => {
  const full: CrudConfig = {
    gateway, module, model: 'userProfile', scope: { profileType: { code: typeCode } },
    beforeEnable: async (row) => notSelf(row), beforeDelete: lastProfileGuard, ...cfg,
  };
  class Service extends ProfileService {
    constructor(prisma: PrismaService) {
      super(prisma, full, typeCode, profileData);
    }
  }
  Reflect.defineMetadata('design:paramtypes', [PrismaService], Service);
  Object.defineProperty(Service, 'name', { value: `${gateway}_${module}_Service` });
  return { service: Service, controller: crudController(full, Service) };
};

// ── /admin/admin
const admins = profileModule(
  'admin', 'admin',
  {
    schema: z.object({ ...contacts, displayName: z.string().trim().min(1), role: z.enum(['super', 'operator', 'analyst']) }),
    searchFields: ['displayName', 'user.email', 'user.phone'], filterFields: ['role'], include: userInclude,
  },
  async (d) => ({ displayName: d.displayName, role: d.role }),
);

// ── /admin/staff
const staff = profileModule(
  'staff', 'staff',
  {
    schema: z.object({
      ...contacts, displayName: z.string().trim().min(1), organizationId: z.coerce.bigint(), role: z.enum(['sales', 'back']),
      scopeProducts: z.array(z.coerce.bigint()).default([]), scopeCities: z.array(z.coerce.bigint()).default([]),
    }),
    searchFields: ['displayName', 'user.email', 'user.phone'], filterFields: ['organizationId', 'role'],
    include: { ...userInclude, organization: { select: { id: true, uid: true, nameKa: true, nameEn: true } } },
  },
  (d, prisma) => staffData(d, prisma),
);

/** Staff profile values: partner organisation, role, scope (sales only; empty = everything). */
export const staffData = async (d: Record<string, unknown>, prisma: PrismaService) => {
  {
    const org = await prisma.organization.findFirst({ where: { id: d.organizationId as bigint, isDeleted: false } });
    if (!org) throw validation([{ field: 'OrganizationID', message: 'ორგანიზაცია ვერ მოიძებნა' }]);
    if (!org.isPartner) throw validation([{ field: 'OrganizationID', message: 'ორგანიზაცია პარტნიორი არ არის' }]);
    // scope applies to sales only; empty = everything
    const sales = d.role === 'sales';
    const products = sales ? (d.scopeProducts as bigint[]) : [];
    const cities = sales ? (d.scopeCities as bigint[]) : [];
    if (products.length && (await prisma.partnerProduct.count({ where: { id: { in: products }, organizationId: org.id, isDeleted: false } })) !== products.length) {
      throw validation([{ field: 'ScopeProducts', message: 'პროდუქტი ამ ორგანიზაციას არ ეკუთვნის' }]);
    }
    if (cities.length && (await prisma.city.count({ where: { id: { in: cities }, isDeleted: false } })) !== cities.length) {
      throw validation([{ field: 'ScopeCities', message: 'ქალაქი ვერ მოიძებნა' }]);
    }
    return { displayName: d.displayName, organizationId: org.id, role: d.role, scopeProducts: products, scopeCities: cities };
  }
};

// ── /admin/customer — view and enable/disable only
const customers = profileModule(
  'customer', 'customer',
  {
    schema: z.object({}), actions: ['find', 'detail', 'enable', 'disable'],
    searchFields: ['displayName', 'user.email', 'user.phone', 'customer.pid', 'customer.lastName'],
    include: { ...userInclude, customer: true },
  },
  async () => ({}),
);

// ── /admin/user
const userCfg: CrudConfig = {
  gateway: 'admin', module: 'user', model: 'user', actions: ['find', 'detail', 'edit', 'enable', 'disable'],
  schema: z.object({ ...contacts, userName: z.string().trim().nullable().default(null) }),
  searchFields: ['email', 'phone', 'userName'], filterFields: ['isVerified'],
  include: { profiles: { where: { isDeleted: false }, select: { id: true, uid: true, isEnable: true, role: true, displayName: true, profileType: { select: { code: true } }, organization: { select: { id: true, nameKa: true } } } } },
  beforeEnable: async (row) => {
    if (row.id === currentUserId()) throw conflict('საკუთარ ანგარიშს ვერ გამორთავ');
  },
};
class UserService extends CrudService {
  constructor(prisma: PrismaService) {
    super(prisma, userCfg);
  }

  async edit(id: number, uid: string, body: unknown) {
    await this.get(id, uid);
    const d = parse(this.cfg.schema, body) as { email: string | null; phone: string | null; userName: string | null };
    const { email, phone } = normContacts(d);
    const row = await this.prisma.user.update({
      where: { id: BigInt(id) }, data: { email, phone, userName: d.userName, updatedBy: currentUserId(), updatedOn: new Date() }, select: { id: true, uid: true },
    });
    return { id: row.id, uid: row.uid };
  }
}
Reflect.defineMetadata('design:paramtypes', [PrismaService], UserService);
const users = { service: UserService, controller: crudController(userCfg, UserService) };

const parts = [users, admins, staff, customers];

@Module({
  controllers: parts.map((p) => p.controller),
  providers: parts.map((p) => p.service),
})
export class AdminUsersModule {}
