import { authResponseSchema, loginBodySchema, registerBodySchema } from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class RegisterBodyDto extends createZodDto(registerBodySchema, {
  name: 'RegisterBodyDto',
}) {}
export class LoginBodyDto extends createZodDto(loginBodySchema, { name: 'LoginBodyDto' }) {}
export class AuthResponseDto extends createZodDto(authResponseSchema, {
  name: 'AuthResponseDto',
  io: 'output',
}) {}
