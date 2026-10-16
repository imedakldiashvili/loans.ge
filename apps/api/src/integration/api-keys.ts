import { Body, Controller, Delete, Get, Injectable, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { AuthInfo } from '../auth/auth.types';
import { parse } from '../core/crud';
import { notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext, currentUserId } from '../core/request-context';

// API keys (stage 6b, integration): a bank's own system calls the same partner gateway as the cabinet,
// authenticated with `X-Api-Key: lgk_<prefix>_<secret>` instead of a session. The key is shown once when created;
// only its sha256 is stored. Scopes limit what a key may do (checked in the auth guard).

export const API_KEY_SCOPES = ['applications:read', 'applications:write', 'catalog:read', 'catalog:write'] as const;
const KEY_RX = /^lgk_([0-9a-f]{8})_([0-9A-Za-z_-]{32,})$/;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const addSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, 'მინიმუმ ერთი უფლება'),
  expiresOn: z.coerce.date().nullable().default(null),
});

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Auth guard: key → caller of the partner gateway (its organisation), or null. */
  async resolve(key: string): Promise<AuthInfo | null> {
    const m = KEY_RX.exec(key.trim());
    if (!m) return null;
    const row = await this.prisma.apiKey.findUnique({ where: { prefix: m[1] }, include: { organization: true } });
    if (!row || row.isDeleted || !row.isEnable || (row.expiresOn && row.expiresOn < new Date())) return null;
    if (row.organization.isDeleted || !row.organization.isEnable) return null;
    const a = Buffer.from(sha(key.trim()));
    const b = Buffer.from(row.keyHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // last use, at most once a minute
    if (!row.lastUsedOn || Date.now() - row.lastUsedOn.getTime() > 60_000) {
      await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedOn: new Date() } });
    }
    return {
      sessionId: null, userId: null, userProfileId: null, gateway: 'partner', role: 'integration',
      organizationId: row.organizationId, scopeCities: [], scopeProducts: [], apiKeyId: row.id, scopes: row.scopes,
    };
  }

  private org() {
    return currentContext()?.organizationId ?? BigInt(-1);
  }

  find(organizationId?: bigint) {
    return this.prisma.apiKey.findMany({
      where: { isDeleted: false, ...(organizationId ? { organizationId } : {}) },
      orderBy: { id: 'desc' },
      // never the hash
      select: { id: true, uid: true, isEnable: true, name: true, prefix: true, scopes: true, lastUsedOn: true, expiresOn: true, createdOn: true, createdBy: true, organizationId: true, organization: { select: { id: true, nameKa: true } } },
    });
  }

  /** New key — the only time the full key is returned. */
  async add(body: unknown) {
    const d = parse(addSchema, body);
    if (d.expiresOn && d.expiresOn < new Date()) throw validation([{ field: 'ExpiresOn', message: 'წარსული თარიღია' }]);
    const prefix = randomBytes(4).toString('hex');
    const key = `lgk_${prefix}_${randomBytes(24).toString('base64url')}`;
    const row = await this.prisma.apiKey.create({
      data: { organizationId: this.org(), name: d.name, prefix, keyHash: sha(key), scopes: d.scopes, expiresOn: d.expiresOn, createdBy: currentUserId() },
    });
    return { id: row.id, uid: row.uid, key };
  }

  private async own(id: number, uid: string) {
    const row = await this.prisma.apiKey.findFirst({ where: { id: BigInt(id), uid, organizationId: this.org(), isDeleted: false } });
    if (!row) throw notFound('API გასაღები');
    return row;
  }

  async enable(id: number, uid: string, on: boolean) {
    const row = await this.own(id, uid);
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { isEnable: on, updatedBy: currentUserId(), updatedOn: new Date() } });
    return { id: row.id, uid: row.uid };
  }

  async remove(id: number, uid: string) {
    const row = await this.own(id, uid);
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { isDeleted: true, deletedBy: currentUserId(), deletedOn: new Date() } });
    return { id: row.id, uid: row.uid };
  }
}

/** Back office of the organisation manages its own keys (the guard lets only `back` here). */
@Controller('partner/apiKey')
export class PartnerApiKeyController {
  constructor(private readonly svc: ApiKeyService) {}

  @Post('find/:pageNumber/:pageSize')
  async find() {
    const items = await this.svc.find(currentContext()?.organizationId ?? BigInt(-1));
    return { items, pageNumber: 1, pageSize: items.length, totalCount: items.length, totalPages: 1 };
  }

  /** Returns { ID, UID, Key } — the key is shown only now. */
  @Post('add')
  add(@Body() body: unknown) {
    return this.svc.add(body);
  }

  @Put('enable/:id/:uid')
  enable(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.enable(id, uid, true);
  }

  @Put('disable/:id/:uid')
  disable(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.enable(id, uid, false);
  }

  @Delete('delete/:id/:uid')
  remove(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.remove(id, uid);
  }
}

/** Admin sees every organisation's keys (no secrets). */
@Controller('admin/apiKey')
export class AdminApiKeyController {
  constructor(private readonly svc: ApiKeyService) {}

  @Post('find/:pageNumber/:pageSize')
  async find() {
    const items = await this.svc.find();
    return { items, pageNumber: 1, pageSize: items.length, totalCount: items.length, totalPages: 1 };
  }

  @Get('scopes')
  scopes() {
    return API_KEY_SCOPES;
  }
}
