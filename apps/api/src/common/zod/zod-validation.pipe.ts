import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodError } from 'zod';
import { isZodDto } from './zod-dto.js';

/** 400 response carrying field-level issues in the shared `ApiError` shape. */
export class ValidationException extends BadRequestException {
  constructor(error: ZodError) {
    super({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      code: 'VALIDATION_FAILED',
      details: error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
}

/**
 * Global pipe: any parameter typed with a Zod DTO class is parsed with its
 * schema and replaced by the parsed (coerced, defaulted) value. Parameters
 * typed with anything else pass through untouched.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const dto = metadata.metatype;
    if (!isZodDto(dto)) {
      return value;
    }
    const result = dto.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationException(result.error);
    }
    return result.data;
  }
}
