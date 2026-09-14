import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ApiError } from '@smartestate/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '../../generated/prisma/client.js';
import { isDomainError, type DomainError } from '../errors/domain-error.js';

/**
 * Shapes every error into the shared `ApiError` envelope. Known database
 * violations and Fastify's own errors (rate limiting, body parsing) map to
 * meaningful statuses; anything unexpected is logged with its stack and
 * reported as a generic 500 so internals never leak.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const request = http.getRequest<FastifyRequest>();
    const body = this.toApiError(exception, request);

    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, method: request.method, url: request.url },
        exception instanceof Error ? exception.stack : 'Unhandled non-error exception',
      );
    }
    void reply.status(body.statusCode).send(body);
  }

  private toApiError(exception: unknown, request: FastifyRequest): ApiError {
    if (isDomainError(exception)) {
      return domainError(exception);
    }
    if (exception instanceof HttpException) {
      return normaliseHttpException(exception);
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return prismaError(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Invalid query',
        code: 'INVALID_QUERY',
      };
    }
    const fastifyError = asFastifyError(exception);
    if (fastifyError !== undefined) {
      return fastifyError;
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: `Unexpected error handling ${request.method} ${request.url.split('?')[0] ?? request.url}`,
      code: 'INTERNAL',
    };
  }
}

/** "Bad Request", "Not Found", … derived from the numeric status. */
export function reasonPhrase(status: number): string {
  const name = HttpStatus[status];
  return name === undefined
    ? 'Error'
    : name
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Fastify / plugin error codes that clients may want to branch on. */
const FASTIFY_CODES: Readonly<Record<string, string>> = {
  FST_ERR_CTP_INVALID_JSON_BODY: 'MALFORMED_BODY',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'MALFORMED_BODY',
  FST_ERR_CTP_BODY_TOO_LARGE: 'BODY_TOO_LARGE',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  FST_ERR_RATE_LIMITED: 'RATE_LIMITED',
};

/**
 * Fastify and its plugins throw plain errors carrying `statusCode` (and often a
 * `code`). They are not HttpExceptions, so they would otherwise surface as 500.
 */
export function asFastifyError(exception: unknown): ApiError | undefined {
  if (typeof exception !== 'object' || exception === null) {
    return undefined;
  }
  const { statusCode, code, message } = exception as {
    statusCode?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (typeof statusCode !== 'number' || statusCode < 400 || statusCode >= 600) {
    return undefined;
  }
  const mapped = typeof code === 'string' ? FASTIFY_CODES[code] : undefined;
  const fallbackCode = statusCode === 429 ? 'RATE_LIMITED' : undefined;
  const resolvedCode = mapped ?? fallbackCode;
  return {
    statusCode,
    error: reasonPhrase(statusCode),
    message: typeof message === 'string' && message.length > 0 ? message : reasonPhrase(statusCode),
    ...(resolvedCode === undefined ? {} : { code: resolvedCode }),
  };
}

/** Nest's Fastify adapter wraps body-parsing failures in a plain BadRequestException; recover a code. */
function inferCode(status: number, message: string): string | undefined {
  if (status === 400 && /json|body/i.test(message)) {
    return 'MALFORMED_BODY';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  return undefined;
}

function normaliseHttpException(exception: HttpException): ApiError {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const fallbackError = reasonPhrase(status);

  if (typeof response === 'string') {
    const code = inferCode(status, response);
    return {
      statusCode: status,
      error: fallbackError,
      message: response,
      ...(code === undefined ? {} : { code }),
    };
  }
  const record = response as Record<string, unknown>;
  const rawMessage = record.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.map(String).join('; ')
    : typeof rawMessage === 'string'
      ? rawMessage
      : fallbackError;
  const code = typeof record.code === 'string' ? record.code : inferCode(status, message);
  return {
    statusCode: status,
    error: typeof record.error === 'string' ? record.error : fallbackError,
    message,
    ...(code === undefined ? {} : { code }),
    ...(Array.isArray(record.details) ? { details: record.details as ApiError['details'] } : {}),
  };
}

/**
 * Domain services throw transport-free errors (see `DomainError`); this is the
 * single place where they acquire a status code.
 */
function domainError(exception: DomainError): ApiError {
  const hasContext = Object.keys(exception.context).length > 0;
  return {
    statusCode: exception.status,
    error: reasonPhrase(exception.status),
    message: exception.message,
    code: exception.code,
    ...(hasContext ? { context: exception.context } : {}),
  };
}

function prismaError(exception: Prisma.PrismaClientKnownRequestError): ApiError {
  switch (exception.code) {
    case 'P2002': {
      const target = exception.meta?.target;
      const fields = Array.isArray(target) ? target.map(String).join(', ') : 'field';
      return {
        statusCode: 409,
        error: 'Conflict',
        message: `Duplicate value for ${fields}`,
        code: 'CONFLICT',
      };
    }
    case 'P2025':
      return {
        statusCode: 404,
        error: 'Not Found',
        message: 'Resource not found',
        code: 'NOT_FOUND',
      };
    case 'P2003':
      return {
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Referenced resource does not exist',
        code: 'INVALID_REFERENCE',
      };
    default:
      return {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Database error',
        code: 'DATABASE',
      };
  }
}
