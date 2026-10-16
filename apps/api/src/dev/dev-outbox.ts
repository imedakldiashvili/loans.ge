import { Controller, DynamicModule, Get, Injectable, Logger, Module, Param, ParseIntPipe, Post, Body, Delete } from '@nestjs/common';
import { z } from 'zod';
import { parse } from '../core/crud';
import { PrismaService } from '../core/prisma.service';

// Dev outbox — TEST ENVIRONMENTS ONLY.
// When DEV_OUTBOX=true (and NODE_ENV is not "production"), every one-time code is also saved here, so testers can read it
// in the OTP viewer (apps/otp-viewer) instead of the API console. In production the module is not loaded at all:
// no table writes, no /dev routes.

export const devOutboxEnabled = () => process.env.DEV_OUTBOX === 'true' && process.env.NODE_ENV !== 'production';

@Injectable()
export class DevOutbox {
  private readonly log = new Logger('DevOutbox');
  readonly enabled = devOutboxEnabled();

  constructor(private readonly prisma: PrismaService) {
    if (this.enabled) this.log.warn('DEV_OUTBOX is on — one-time codes are stored for the OTP viewer. Never enable this in production.');
  }

  /** Called by the OTP service after a code is sent; does nothing unless enabled. */
  async record(m: { channel: string; target: string; purpose: string; code: string; text: string; expiresOn: Date; challengeUid: string }) {
    if (!this.enabled) return;
    await this.prisma.devOutbox.create({ data: m });
  }
}

const findBody = z.preprocess((v) => v ?? {}, z.object({ filter: z.preprocess((v) => v ?? {}, z.object({ search: z.string().trim().optional() })) }));

/** /dev/outbox/find/{page}/{size} · /dev/outbox/clear — only registered when the outbox is enabled. */
@Controller('dev/outbox')
class DevOutboxController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('find/:pageNumber/:pageSize')
  async find(@Param('pageNumber', ParseIntPipe) pageNumber: number, @Param('pageSize', ParseIntPipe) pageSize: number, @Body() body: unknown) {
    const { filter } = parse(findBody, body);
    const size = Math.min(Math.max(pageSize, 1), 100);
    const where = { isDeleted: false, ...(filter.search ? { target: { contains: filter.search.toLowerCase().replace(/\s+/g, ''), mode: 'insensitive' as const } } : {}) };
    const [items, totalCount] = await Promise.all([
      this.prisma.devOutbox.findMany({ where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * size, take: size }),
      this.prisma.devOutbox.count({ where }),
    ]);
    // used = the code was already entered; locked = tries are over
    const challenges = await this.prisma.otpChallenge.findMany({ where: { uid: { in: items.map((i) => i.challengeUid) } }, select: { uid: true, consumedOn: true, attempts: true } });
    const withState = items.map((i) => {
      const c = challenges.find((x) => x.uid === i.challengeUid);
      return { ...i, isUsed: !!c?.consumedOn, attempts: c?.attempts ?? 0 };
    });
    return { items: withState, pageNumber, pageSize: size, totalCount, totalPages: Math.ceil(totalCount / size) };
  }

  @Get('status')
  status() {
    return { enabled: true, environment: process.env.NODE_ENV ?? 'development' };
  }

  @Delete('clear')
  async clear() {
    const r = await this.prisma.devOutbox.deleteMany({});
    return { deleted: r.count };
  }
}

@Module({ providers: [DevOutbox], exports: [DevOutbox] })
class DevOutboxCoreModule {}

/** Always provides DevOutbox (a no-op when disabled); adds the /dev routes only when enabled. */
@Module({})
export class DevOutboxModule {
  static register(): DynamicModule {
    return {
      module: DevOutboxModule,
      global: true,
      imports: [DevOutboxCoreModule],
      controllers: devOutboxEnabled() ? [DevOutboxController] : [],
      exports: [DevOutboxCoreModule],
    };
  }
}
