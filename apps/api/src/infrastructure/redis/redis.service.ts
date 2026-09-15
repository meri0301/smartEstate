/**
 * Redis, treated as a convenience rather than a dependency.
 *
 * Every method here fails soft. A cache that is down turns every read into a
 * miss and every write into nothing, and the application carries on doing the
 * work it would have done anyway. That is the whole reason to have this wrapper
 * instead of injecting the client: it makes "Redis is optional" a property of
 * one file rather than a rule every caller has to remember.
 *
 * Connections are lazy and retries are bounded, so an API that starts before
 * Redis does will connect when it can, and one that never finds Redis will not
 * spend its life reconnecting.
 */
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { InjectConfig, type AppConfig } from '../../config/app-config.js';

/** After this many failed attempts the client stops trying until the process restarts. */
const MAX_RETRIES = 3;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis | undefined;
  private warnedOffline = false;

  constructor(@InjectConfig() config: AppConfig) {
    if (config.redisUrl === undefined) {
      this.logger.log('no REDIS_URL configured; caching is disabled');
      return;
    }
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => (attempt > MAX_RETRIES ? null : Math.min(attempt * 200, 1_000)),
    });
    // Without a listener ioredis treats a connection error as an unhandled
    // rejection and takes the process down with it.
    this.client.on('error', (error: Error) => {
      if (!this.warnedOffline) {
        this.warnedOffline = true;
        this.logger.warn({ err: error }, 'Redis is unavailable; continuing without a cache');
      }
    });
    this.client.on('ready', () => {
      this.warnedOffline = false;
      this.logger.log('Redis connected');
    });
    void this.client.connect().catch(() => {
      // Already reported by the error listener; swallowed so start-up continues.
    });
  }

  /** True only when a command would actually reach the server. */
  get connected(): boolean {
    return this.client?.status === 'ready';
  }

  async get(key: string): Promise<string | undefined> {
    if (!this.connected) {
      return undefined;
    }
    try {
      return (await this.client?.get(key)) ?? undefined;
    } catch (error) {
      this.logger.warn({ err: error, key }, 'cache read failed');
      return undefined;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.connected) {
      return;
    }
    try {
      await this.client?.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'cache write failed');
    }
  }

  /**
   * Increments a counter that expires, and returns its new value.
   *
   * Used for quota windows. `undefined` means the counter could not be kept, and
   * the caller has to decide what to do without one; for a quota that means
   * letting the request through, because refusing work because the cache is down
   * would be worse than briefly exceeding a soft limit.
   */
  async increment(key: string, ttlSeconds: number): Promise<number | undefined> {
    if (!this.connected) {
      return undefined;
    }
    try {
      const results = await this.client?.multi().incr(key).expire(key, ttlSeconds, 'NX').exec();
      const value = results?.[0]?.[1];
      return typeof value === 'number' ? value : undefined;
    } catch (error) {
      this.logger.warn({ err: error, key }, 'counter increment failed');
      return undefined;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client !== undefined) {
      // `quit` waits for in-flight commands; `disconnect` would drop them.
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }
}
