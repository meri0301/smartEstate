import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/auth/decorators.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

export interface HealthResponse {
  status: 'ok';
  service: 'api';
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadinessResponse {
  status: 'ok';
  checks: { database: 'up' };
}

/**
 * Probes for Docker health checks and CI smoke tests. Liveness reports that the
 * process runs; readiness additionally proves the database answers, so a
 * container with a broken connection string is never marked healthy.
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiOkResponse({ description: 'Process is running' })
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (database reachable)' })
  @ApiOkResponse({ description: 'Ready to serve traffic' })
  @ApiServiceUnavailableResponse({ description: 'Database unreachable' })
  async ready(): Promise<ReadinessResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        message: 'Database unreachable',
        code: 'NOT_READY',
        details: [{ path: 'database', message: 'down' }],
      });
    }
    return { status: 'ok', checks: { database: 'up' } };
  }
}
