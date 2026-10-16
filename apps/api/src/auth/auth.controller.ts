import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Req, Res, Type } from '@nestjs/common';
import type { Response } from 'express';
import { AppError, notFound } from '../core/errors';
import { AuthService } from './auth.service';
import { AuthedRequest, AuthGateway, sessionCookie } from './auth.types';
import { SessionService } from './session.service';

/** Login: POST /public/auth/sendOtp → POST /public/auth/verifyOtp (sets the session cookie of the gateway). */
@Controller('public/auth')
export class PublicAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sendOtp')
  sendOtp(@Body() body: unknown) {
    return this.auth.sendOtp(body);
  }

  @Post('verifyOtp')
  async verifyOtp(@Body() body: unknown, @Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const { gateway, user, opened } = await this.auth.verifyOtp(body, { ip: req.ip, userAgent: req.header('user-agent') });
    res.cookie(sessionCookie(gateway), opened.token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: opened.maxAgeMs,
    });
    return { id: user.id, uid: user.uid };
  }
}

/** Per gateway: GET me, PUT logout, PUT switchProfile/{id}/{uid}. */
const gatewayAuthController = (gateway: AuthGateway): Type => {
  @Controller(`${gateway}/auth`)
  class GatewayAuthController {
    constructor(
      readonly auth: AuthService,
      readonly sessions: SessionService,
    ) {}

    @Get('me')
    me(@Req() req: AuthedRequest) {
      const a = req.auth!;
      return this.auth.me(gateway, a.userId, a.userProfileId);
    }

    @Put('logout')
    async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
      const a = req.auth!;
      const closed = await this.sessions.close(a.sessionId, a.userId);
      res.clearCookie(sessionCookie(gateway), { path: '/' });
      return closed;
    }

    @Put('switchProfile/:id/:uid')
    async switchProfile(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @Req() req: AuthedRequest) {
      const a = req.auth!;
      const profiles = await this.auth.eligibleProfiles(a.userId, gateway);
      const p = profiles.find((x) => x.id === BigInt(id));
      if (!p) throw notFound('პროფილი');
      if (p.uid !== uid) throw notFound('პროფილი');
      if (p.id === a.userProfileId) throw new AppError('CONFLICT', 'ეს პროფილი უკვე არჩეულია');
      await this.sessions.switchProfile(a.sessionId, p.id, a.userId);
      return { id: p.id, uid: p.uid };
    }
  }
  Reflect.defineMetadata('design:paramtypes', [AuthService, SessionService], GatewayAuthController);
  Object.defineProperty(GatewayAuthController, 'name', { value: `${gateway}_auth_Controller` });
  return GatewayAuthController;
};

export const AUTH_CONTROLLERS = [PublicAuthController, ...(['admin', 'partner', 'client'] as const).map(gatewayAuthController)];
