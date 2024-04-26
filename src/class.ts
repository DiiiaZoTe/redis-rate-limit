import Redis from 'ioredis';
import { ms } from './utils';

const DEFAULT_CONFIG = {
  window: 1000,
  limit: 1,
  difference: 0,
  ephemeralCache: true,
}

export type RateLimitConfig = {
  /** ioredis client instance */
  redis: Redis;
  /** prefix for redis key - useful to have multiple projects on one redis */
  prefix: string;
  /** 
   * window in milliseconds
   * @default 1000 if not provided or < 0
   * @example 1000 or use:  
   * ```ms("1s")``` or ```msPrecise(["1s"])``` (for multiple units)
   */
  window?: number;
  /** 
   * max requests allowed in window
   * @default 1
   */
  limit?: number;
  /**
   * time difference in ms to account between 2 requests. Acts as a cooldown period.
   * @default 0 (no difference)
   * @example 1000 or use:  
   * ```ms("1s")``` or ```msPrecise(["1s"])``` (for multiple units)
   */
  difference?: number;
  /** 
   * adds an in-memory cache to store the rate limit data 
   * @default true
   */
  ephemeralCache?: boolean
  /** 
   * custom logging function 
   * @default console.error
   */
  logger?: (error: any) => void;
}

export type RateLimitResponse = {
  /** whether the request is allowed */
  success: boolean;
  /** number of requests remaining */
  remaining: number;
  /** max number of requests allowed in the window */
  limit: number;
  /** reset function to reset the rate limit */
  reset: () => Promise<void>;
  /** time to live in milliseconds */
  ttl: number;
  /** error message */
  error?: string;
  /** key used for rate limiting */
  key: string;
}

/**
 * RateLimit class to limit requests based on the IP address
 * 
 * @param {RateLimitConfig} config RateLimitConfig
 * @param {Redis} config.redis ioredis client instance
 * @param {string} config.prefix prefix for redis key - useful to have multiple projects on one redis
 * @param {number} [config.window=1000] window with unit (ms, s, m, h, d)
 * @param {number} [config.limit=1] max requests allowed in window
 * @param {number} [config.difference=0] time difference to account between 2 requests. Acts as a cooldown period.
 * @param {boolean} [config.ephemeralCache=true] adds an in-memory cache to store the rate limit data
 * @param {(error: any) => void} [config.logger=console.error] custom logging function
 * 
 * 
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * 
 * const redis = new Redis("redis_url");
 * 
 * const rateLimit = new RateLimit({
 *   redis,
 *   prefix: "rate-limit",
 *   window: "1s",
 *   maxRequest: 1
 * });
 * 
 * ...
 * 
 * const ip = req.headers['x-forwarded-for'] || "anonymous";
 * const response = await rateLimit.limit(ip);
 * if (!response.success) {
 *  return res.status(429).json({ message: "Too many requests" });
 * }
 * ```
 */
export class RateLimit {
  private redis: Redis;
  private prefix: string;
  private window: number;
  private maxRequest: number;
  private difference: number;
  private localCache: Cache | undefined;
  private logger: (error: any) => void;

  constructor({
    redis,
    prefix,
    window = DEFAULT_CONFIG.window,
    limit = DEFAULT_CONFIG.limit,
    difference = DEFAULT_CONFIG.difference,
    ephemeralCache = DEFAULT_CONFIG.ephemeralCache,
    logger
  }: RateLimitConfig) {
    this.redis = redis;
    // Ensure the provided Redis client is valid
    if (!this.redis) {
      throw new Error("No Redis client provided.");
    }
    // Redis health check
    this.redis.ping().catch((error) => {
      throw new Error(`Failed to connect to Redis - ${error}`);
    });

    this.window = window;
    this.difference = difference;
    if (this.difference > this.window) {
      console.error(`Difference cannot be greater than window size. Defaulting to the window size`);
      this.difference = this.window;
    }

    this.maxRequest = limit < 1 ? 5 : limit;
    this.prefix = prefix;
    this.localCache = ephemeralCache ? new Cache() : undefined;
    this.logger = logger ? logger : (error: any) => { console.error(error) };
  }

  /**
   * 
   * @param id a unique identifier for the rate limit - usually the IP address
   * @returns 
   */
  public async limit(id: string): Promise<RateLimitResponse> {
    const key = `${this.prefix}:${id}`; // key for redis
    const now = Date.now();
    try {
      // check local cache if the request is blocked
      if (this.localCache) {
        const cacheResult = this.localCache.isBlocked(key);
        if (cacheResult.blocked) {
          return this.createLimitResponse(false, 0, cacheResult.reset, key);
        }
      }

      // when difference provided check if the request is too soon
      if (this.difference) {
        try {
          const lastRequestTimestamp = await this.redis.get(`${key}:last`);
          if (lastRequestTimestamp && (now - parseInt(lastRequestTimestamp) < this.difference)) {
            return this.createErrorResponse("Request too soon after the last one", key);
          }
        } catch (error) {
          this.logger(`Failed to check difference between requests - ${error}`);
          return this.createErrorResponse("Failed to check difference between requests", key);
        }
      }

      // increment the key in redis
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.pexpire(key, this.window);
      }

      // get success and important data 
      const success = current <= this.maxRequest;
      const remaining = Math.max(this.maxRequest - current, 0);
      const ttl = await this.redis.pttl(key);
      const reset = now + ttl;

      // block the request in local cache if it exceeds the limit
      if (!success && this.localCache) {
        this.localCache.blockUntil(key, reset);
      }

      return this.createLimitResponse(success, remaining, reset, key);

    } catch (error) {
      const message = "Failed to rate limit request";
      this.logger(`${message} - ${error}`);
      return this.createErrorResponse(message, key);
    }
  }

  private createLimitResponse(success: boolean, remaining: number, reset: number, key: string): RateLimitResponse {
    return {
      success,
      remaining,
      limit: this.maxRequest,
      reset: () => this.reset(key),
      ttl: reset - Date.now(),
      key
    };
  }

  private createErrorResponse(error: string, key: string): RateLimitResponse {
    return {
      success: false,
      remaining: 0,
      limit: this.maxRequest,
      reset: () => this.reset(key),
      ttl: 0,
      error,
      key
    };
  }

  private async reset(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      if (this.localCache) {
        this.localCache.pop(key);
      }
    } catch (error) {
      this.logger("Failed to reset rate limit - " + error)
    }
  }
}

/**
 * Cache class to store rate limit data in-memory
 */
class Cache {
  private cache: Map<string, number>;

  constructor() {
    this.cache = new Map<string, number>();
  }

  public isBlocked(identifier: string): { blocked: boolean; reset: number } {
    const reset = this.cache.get(identifier);
    if (!reset || reset < Date.now()) {
      this.cache.delete(identifier);
      return { blocked: false, reset: 0 };
    }
    return { blocked: true, reset };
  }

  public blockUntil(identifier: string, reset: number): void {
    this.cache.set(identifier, reset);
  }

  public set(key: string, value: number): void {
    this.cache.set(key, value);
  }

  public get(key: string): number | null {
    return this.cache.get(key) || null;
  }

  public incr(key: string): number {
    let value = this.get(key) ?? 0;
    value += 1;
    this.cache.set(key, value);
    return value;
  }

  public pop(key: string): void {
    this.cache.delete(key);
  }

  public empty(): void {
    this.cache.clear();
  }
}