import { Body, Controller, Delete, Injectable, Param, ParseIntPipe, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { randomBytes } from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { parse } from '../core/crud';
import { AppError, notFound, validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';
import { AuthService } from './auth.service';
import { AuthedRequest, sessionCookie, userAuth } from './auth.types';
import { SessionService } from './session.service';

// Passkeys (WebAuthn) for customers: sign in with a fingerprint / face / device PIN instead of a one-time code.
//   add (signed in):   POST /client/passkey/registerOptions → the browser creates the key → POST /client/passkey/register
//   list / remove:     POST /client/passkey/find/{page}/{size} · DELETE /client/passkey/delete/{id}/{uid}
//   sign in:           POST /public/auth/passkeyOptions → the browser signs → POST /public/auth/passkeyLogin (sets the session cookie)
// WebAuthn options / responses travel as JSON strings (OptionsJson / ResponseJson): the API's key case conversion must not touch them.
// Challenges live in memory for 5 minutes (one API instance; several instances → a shared store).

const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'localhost';
const RP_NAME = 'loans.ge';
const ORIGINS = (process.env.WEBAUTHN_ORIGINS ?? 'http://localhost:5176').split(',').map((s) => s.trim()).filter(Boolean);
const CHALLENGE_MS = 5 * 60_000;

const registerBody = z.object({ responseJson: z.string().min(2), name: z.string().trim().max(60).optional() });
const loginBody = z.object({ challengeId: z.string().min(10), responseJson: z.string().min(2) });

/** A short label from the browser's user agent: "Windows · Chrome". */
const deviceName = (ua = '') => {
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(' · ') || 'Passkey';
};
const json = <T>(s: string): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    throw validation([{ field: 'ResponseJson', message: 'არასწორი პასუხი' }]);
  }
};

@Injectable()
export class PasskeyService {
  /** challenge → what it was issued for; registration — by user, sign-in — by a random id */
  private readonly challenges = new Map<string, { challenge: string; userId?: bigint; at: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  private keep(key: string, challenge: string, userId?: bigint) {
    const now = Date.now();
    for (const [k, v] of this.challenges) if (now - v.at > CHALLENGE_MS) this.challenges.delete(k);
    this.challenges.set(key, { challenge, userId, at: now });
  }
  /** One use: taken out of the store; expired / unknown → 400. */
  private take(key: string) {
    const c = this.challenges.get(key);
    this.challenges.delete(key);
    if (!c || Date.now() - c.at > CHALLENGE_MS) throw validation([{ field: 'ChallengeID', message: 'ვადა გავიდა — სცადე თავიდან' }]);
    return c;
  }

  // ── add a passkey (signed in)

  async registerOptions(userId: bigint) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const mine = await this.prisma.passkey.findMany({ where: { userId, isDeleted: false } });
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(user.uid),
      userName: user.email ?? user.phone ?? user.uid,
      userDisplayName: user.userName ?? user.email ?? user.phone ?? '',
      attestationType: 'none',
      // a key the device keeps for this site (no user name to type when signing in)
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      excludeCredentials: mine.map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
    });
    this.keep(`reg:${userId}`, options.challenge, userId);
    return { optionsJson: JSON.stringify(options) };
  }

  async register(userId: bigint, body: unknown, userAgent?: string) {
    const d = parse(registerBody, body);
    const { challenge } = this.take(`reg:${userId}`);
    let v: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      v = await verifyRegistrationResponse({
        response: json<RegistrationResponseJSON>(d.responseJson), expectedChallenge: challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID, requireUserVerification: false,
      });
    } catch (e) {
      throw validation([{ field: 'ResponseJson', message: (e as Error).message }], 'პასკოდი ვერ დადასტურდა');
    }
    if (!v.verified || !v.registrationInfo) throw validation([{ field: 'ResponseJson', message: 'პასკოდი ვერ დადასტურდა' }]);
    const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
    if (await this.prisma.passkey.count({ where: { credentialId: credential.id } })) throw new AppError('CONFLICT', 'ეს პასკოდი უკვე დამატებულია');
    const row = await this.prisma.passkey.create({
      data: {
        userId, createdBy: userId, credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: BigInt(credential.counter),
        transports: credential.transports ?? [], deviceType: credentialDeviceType, backedUp: credentialBackedUp, name: d.name || deviceName(userAgent),
      },
    });
    return { id: row.id, uid: row.uid };
  }

  async find(userId: bigint) {
    const items = await this.prisma.passkey.findMany({
      where: { userId, isDeleted: false }, orderBy: { createdOn: 'desc' },
      select: { id: true, uid: true, name: true, deviceType: true, backedUp: true, createdOn: true, lastUsedOn: true },
    });
    return { items, pageNumber: 1, pageSize: items.length, totalCount: items.length, totalPages: 1 };
  }

  async remove(userId: bigint, id: number, uid: string) {
    const p = await this.prisma.passkey.findFirst({ where: { id: BigInt(id), uid, userId, isDeleted: false } });
    if (!p) throw notFound('პასკოდი');
    await this.prisma.passkey.update({ where: { id: p.id }, data: { isDeleted: true, deletedOn: new Date(), deletedBy: userId } });
    return { id: p.id, uid: p.uid };
  }

  // ── sign in

  async loginOptions() {
    const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'preferred' });
    const challengeId = randomBytes(16).toString('hex');
    this.keep(`login:${challengeId}`, options.challenge);
    return { challengeId, optionsJson: JSON.stringify(options) };
  }

  async login(body: unknown, meta: { ip?: string; userAgent?: string }) {
    const d = parse(loginBody, body);
    const { challenge } = this.take(`login:${d.challengeId}`);
    const response = json<AuthenticationResponseJSON>(d.responseJson);
    const pk = await this.prisma.passkey.findFirst({ where: { credentialId: response.id, isDeleted: false, isEnable: true }, include: { user: true } });
    if (!pk || pk.user.isDeleted) throw new AppError('UNAUTHORIZED', 'პასკოდი ვერ მოიძებნა — შედი კოდით და დაამატე პროფილში');
    let v: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      v = await verifyAuthenticationResponse({
        response, expectedChallenge: challenge, expectedOrigin: ORIGINS, expectedRPID: RP_ID, requireUserVerification: false,
        credential: { id: pk.credentialId, publicKey: new Uint8Array(pk.publicKey), counter: Number(pk.counter), transports: pk.transports as AuthenticatorTransportFuture[] },
      });
    } catch (e) {
      throw new AppError('UNAUTHORIZED', `პასკოდი ვერ დადასტურდა: ${(e as Error).message}`);
    }
    if (!v.verified) throw new AppError('UNAUTHORIZED', 'პასკოდი ვერ დადასტურდა');
    if (!pk.user.isEnable) throw new AppError('FORBIDDEN', 'ანგარიში გამორთულია');

    const profile = (await this.auth.eligibleProfiles(pk.userId, 'client'))[0];
    if (!profile) throw new AppError('FORBIDDEN', 'პროფილი მიუწვდომელია');
    const now = new Date();
    await this.prisma.passkey.update({ where: { id: pk.id }, data: { counter: BigInt(v.authenticationInfo.newCounter), lastUsedOn: now } });
    await this.prisma.user.update({ where: { id: pk.userId }, data: { lastLoginOn: now } });
    const opened = await this.sessions.open('client', pk.userId, profile.id, meta);
    const ctx = currentContext();
    if (ctx) Object.assign(ctx, { userId: pk.userId, userProfileId: profile.id, actorType: 'user' });
    return { user: pk.user, opened };
  }
}

@Controller('client/passkey')
export class ClientPasskeyController {
  constructor(private readonly svc: PasskeyService) {}

  @Post('registerOptions')
  registerOptions(@Req() req: AuthedRequest) {
    return this.svc.registerOptions(userAuth(req).userId);
  }

  @Post('register')
  register(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.svc.register(userAuth(req).userId, body, req.header('user-agent'));
  }

  @Post('find/:pageNumber/:pageSize')
  find(@Req() req: AuthedRequest) {
    return this.svc.find(userAuth(req).userId);
  }

  @Delete('delete/:id/:uid')
  remove(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.remove(userAuth(req).userId, id, uid);
  }
}

@Controller('public/auth')
export class PublicPasskeyController {
  constructor(private readonly svc: PasskeyService) {}

  @Post('passkeyOptions')
  options() {
    return this.svc.loginOptions();
  }

  @Post('passkeyLogin')
  async login(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const { user, opened } = await this.svc.login(body, { ip: req.ip, userAgent: req.header('user-agent') });
    res.cookie(sessionCookie('client'), opened.token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: opened.maxAgeMs,
    });
    return { id: user.id, uid: user.uid };
  }
}
