import {
  adminUserSchema,
  adminUsersQuerySchema,
  meResponseSchema,
  pageSchema,
  preferencesBodySchema,
  updateMeBodySchema,
  updateUserRoleBodySchema,
  uuidSchema,
} from '@smartestate/contracts';
import { z } from 'zod';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class UpdateMeBodyDto extends createZodDto(updateMeBodySchema, {
  name: 'UpdateMeBodyDto',
}) {}
export class PreferencesBodyDto extends createZodDto(preferencesBodySchema, {
  name: 'PreferencesBodyDto',
}) {}
export class MeResponseDto extends createZodDto(meResponseSchema, {
  name: 'MeResponseDto',
  io: 'output',
}) {}
export class AdminUsersQueryDto extends createZodDto(adminUsersQuerySchema, {
  name: 'AdminUsersQueryDto',
}) {}
export class UpdateUserRoleBodyDto extends createZodDto(updateUserRoleBodySchema, {
  name: 'UpdateUserRoleBodyDto',
}) {}
export class AdminUserDto extends createZodDto(adminUserSchema, {
  name: 'AdminUserDto',
  io: 'output',
}) {}
export class AdminUsersPageDto extends createZodDto(pageSchema(adminUserSchema), {
  name: 'AdminUsersPageDto',
  io: 'output',
}) {}
export class UserParamsDto extends createZodDto(z.object({ id: uuidSchema }), {
  name: 'UserParamsDto',
}) {}
