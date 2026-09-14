import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

/**
 * JwtModule is registered globally so the `JwtAuthGuard` in `common/` can verify
 * tokens; the signing secret is passed explicitly from `AppConfig` on every call.
 */
@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [TokenService, PasswordService],
})
export class AuthModule {}
