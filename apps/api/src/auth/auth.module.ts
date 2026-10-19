import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AUTH_CONTROLLERS } from './auth.controller';
import { ApiKeyService } from '../integration/api-keys';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ClientPinController, PinService, PublicPinController } from './pin';
import { SessionService } from './session.service';

@Module({
  controllers: [...AUTH_CONTROLLERS, PublicPinController, ClientPinController],
  providers: [AuthService, OtpService, SessionService, PinService, ApiKeyService, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [AuthService, SessionService, OtpService, ApiKeyService],
})
export class AuthModule {}
