import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../core/prisma.service';
import { AuthGateway, AuthInfo, GATEWAY_PROFILE, SESSION_HOURS } from './auth.types';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Opens a session; only the hash of the token is stored. */
  async open(gateway: AuthGateway, userId: bigint, userProfileId: bigint, meta: { ip?: string; userAgent?: string }) {
    const token = randomBytes(32).toString('base64url');
    const session = await this.prisma.session.create({
      data: {
        gateway, userId, userProfileId, tokenHash: hash(token), createdBy: userId,
        ip: meta.ip ?? null, userAgent: meta.userAgent ?? null,
        expiresOn: new Date(Date.now() + SESSION_HOURS[gateway] * 3600_000),
      },
    });
    return { token, session, maxAgeMs: SESSION_HOURS[gateway] * 3600_000 };
  }

  /** Resolves a token for the gateway; null when the session, user or profile is no longer valid. */
  async resolve(gateway: AuthGateway, token: string): Promise<AuthInfo | null> {
    const s = await this.prisma.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: true, userProfile: { include: { profileType: true, organization: true } } },
    });
    if (!s || s.gateway !== gateway || s.isDeleted || !s.isEnable || s.expiresOn < new Date()) return null;
    const p = s.userProfile;
    if (s.user.isDeleted || !s.user.isEnable || p.isDeleted || !p.isEnable || p.profileType.code !== GATEWAY_PROFILE[gateway]) return null;
    // a staff member of a disabled organisation can't work in the cabinet
    if (p.organization && (p.organization.isDeleted || !p.organization.isEnable)) return null;
    return { sessionId: s.id, userId: s.userId, userProfileId: p.id, gateway, role: p.role, organizationId: p.organizationId };
  }

  async close(sessionId: bigint, userId: bigint) {
    return this.prisma.session.update({ where: { id: sessionId }, data: { isDeleted: true, deletedBy: userId, deletedOn: new Date() }, select: { id: true, uid: true } });
  }

  async switchProfile(sessionId: bigint, userProfileId: bigint, userId: bigint) {
    await this.prisma.session.update({ where: { id: sessionId }, data: { userProfileId, updatedBy: userId, updatedOn: new Date() } });
  }
}
