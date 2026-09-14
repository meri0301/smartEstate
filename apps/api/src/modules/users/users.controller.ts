import { Body, Controller, Get, Param, Patch, Put, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminUser, MeResponse, Page } from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Roles } from '../../common/auth/decorators.js';
import {
  AdminUserDto,
  AdminUsersPageDto,
  AdminUsersQueryDto,
  MeResponseDto,
  PreferencesBodyDto,
  UpdateMeBodyDto,
  UpdateUserRoleBodyDto,
  UserParamsDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current account and buyer profile' })
  @ApiOkResponse({ type: MeResponseDto })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.users.getMe(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update display name, phone or interface locale' })
  @ApiOkResponse({ type: MeResponseDto })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateMeBodyDto,
  ): Promise<MeResponse> {
    return this.users.updateMe(user.id, body);
  }

  @Put('me/preferences')
  @ApiOperation({
    summary: 'Save onboarding preferences (budget, rooms, priorities, commute anchor)',
  })
  @ApiOkResponse({ type: MeResponseDto })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PreferencesBodyDto,
  ): Promise<MeResponse> {
    return this.users.updatePreferences(user.id, body);
  }

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'List accounts (admin)' })
  @ApiOkResponse({ type: AdminUsersPageDto })
  @ApiForbiddenResponse({ description: 'Requires the ADMIN role' })
  listUsers(@Query() query: AdminUsersQueryDto): Promise<Page<AdminUser>> {
    return this.users.listUsers(query);
  }

  @Patch(':id/role')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Change the role of an account (admin)' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiForbiddenResponse({ description: 'Requires the ADMIN role' })
  updateRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: UserParamsDto,
    @Body() body: UpdateUserRoleBodyDto,
    @Req() request: FastifyRequest,
  ): Promise<AdminUser> {
    return this.users.updateRole(actor, params.id, body.role, request.ip);
  }
}
