import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok';
  service: 'api';
  uptimeSeconds: number;
  timestamp: string;
}

/**
 * Liveness probe consumed by Docker health checks and CI smoke tests.
 * Readiness checks (database, Redis, ML service) are added when those
 * dependencies exist, so a missing dependency cannot report "healthy" by accident.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
