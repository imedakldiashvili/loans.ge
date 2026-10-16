import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service';

@Controller('public/system')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date() };
  }
}
