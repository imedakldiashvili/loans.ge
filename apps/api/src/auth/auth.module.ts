import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTH_CONTROLLERS } from './auth.controller';
import { ApiKeyService } from '../integration/api-keys';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ClientPasskeyController, PasskeyService, PublicPasskeyController } from './passkey';
import { SessionService } from './session.service';

@Module({
  controllers: [...AUTH_CONTROLLERS, PublicPasskeyController, ClientPasskeyController],
  providers: [AuthService, OtpService, SessionService, PasskeyService, ApiKeyService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, SessionService, OtpService, ApiKeyService],
})
export class AuthModule {}
