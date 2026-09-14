import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthResponse } from '@smartestate/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { InjectConfig, type AppConfig } from '../../config/app-config.js';
import { AuthResponseDto, LoginBodyDto, RegisterBodyDto } from './auth.dto.js';
import { AuthService, type RequestMeta, type Session } from './auth.service.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

/** Credential endpoints get a strict per-IP budget regardless of the global limit. */
const CREDENTIAL_RATE_LIMIT = { rateLimit: { max: 10, timeWindow: '1 minute' } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectConfig() private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  @RouteConfig(CREDENTIAL_RATE_LIMIT)
  @ApiOperation({ summary: 'Create an account and start a session' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async register(
    @Body() body: RegisterBodyDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    return this.commit(await this.auth.register(body, metaOf(request)), reply);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @RouteConfig(CREDENTIAL_RATE_LIMIT)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or disabled account' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async login(
    @Body() body: LoginBodyDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    return this.commit(await this.auth.login(body, metaOf(request)), reply);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @RouteConfig(CREDENTIAL_RATE_LIMIT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing, invalid, expired or replayed refresh token' })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponse> {
    try {
      return this.commit(
        await this.auth.refresh(readRefreshCookie(request), metaOf(request)),
        reply,
      );
    } catch (error) {
      clearRefreshCookie(reply, this.config.refreshToken.cookieSecure);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'End the current session' })
  @ApiNoContentResponse()
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(reply, this.config.refreshToken.cookieSecure);
  }

  @Post('logout-all')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End every session of the current user' })
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logoutAll(user.id);
    clearRefreshCookie(reply, this.config.refreshToken.cookieSecure);
  }

  private commit(session: Session, reply: FastifyReply): AuthResponse {
    setRefreshCookie(
      reply,
      session.refreshToken,
      session.refreshExpiresAt,
      this.config.refreshToken.cookieSecure,
    );
    return session.response;
  }
}

function metaOf(request: FastifyRequest): RequestMeta {
  return { userAgent: request.headers['user-agent']?.slice(0, 512), ipAddress: request.ip };
}
