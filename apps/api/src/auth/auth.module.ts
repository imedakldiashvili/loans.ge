import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTH_CONTROLLERS } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

@Module({
  controllers: AUTH_CONTROLLERS,
  providers: [AuthService, OtpService, SessionService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, SessionService, OtpService],
})
export class AuthModule {}
