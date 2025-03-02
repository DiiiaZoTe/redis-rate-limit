import Redis from "ioredis";

const DEFAULT_CONFIG = {
  window: 1000,
  limit: 1,
  difference: 0,
  ephemeralCache: true,
};

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
  ephemeralCache?: boolean;
  /**
   * custom logging function
   * @default console.error
   */
  logger?: (error: any) => void;
};

export type RateLimitResponse = {
  /** key used for rate limiting */
  key: string;
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
  /** status code:
   *  -  0: success
   *  - -1: redis server error
   *  - -2: limit error - too many requests
   *  - -3: difference error - request too soon after the last one
   */
  statusCode: number;
};

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
    logger,
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
      console.error(
        `Difference cannot be greater than window size. Defaulting to the window size`
      );
      this.difference = this.window;
    }

    this.maxRequest = limit < 1 ? 5 : limit;
    this.prefix = prefix;
    this.localCache = ephemeralCache ? new Cache() : undefined;
    this.logger = logger
      ? logger
      : (error: any) => {
        console.error(error);
      };
  }

  /**
   *
   * @param id a unique identifier for the rate limit - usually the IP address
   * @returns
   */
  public async limit(id: string): Promise<RateLimitResponse> {
    const key = `${this.prefix}:${id}`; // key for redis
    const differenceKey = `${key}:last`;
    const now = Date.now();
    try {
      // check local cache if the request is blocked
      if (this.localCache) {
        const cacheResult = this.localCache.isBlocked(key);
        if (cacheResult.blocked) {
          // console.log("cache blocked the request");
          return this.createErrorResponse({
            error: "Too many requests.",
            key,
            statusCode: -2,
            ttl: cacheResult.reset - now,
          });
        }
      }

      // when difference provided check if the request is too soon
      if (this.difference) {
        try {
          const lastRequestTimestamp = await this.redis.get(differenceKey);
          // console.log("lastRequestTimestamp", lastRequestTimestamp);
          // console.log("time since last request:", lastRequestTimestamp ? now - parseInt(lastRequestTimestamp) : "no last request");
          if (
            lastRequestTimestamp &&
            now - parseInt(lastRequestTimestamp) < this.difference
          ) {
            // get some data to return with the error
            const { remaining, ttl } = await this.getKeyInfo(key);
            return this.createErrorResponse({
              error: "Request too soon after the last one.",
              key,
              statusCode: -3,
              ttl,
              remaining,
            });
          }
        } catch (error) {
          this.logger(`Failed to check difference between requests - ${error}`);
          return this.createErrorResponse({
            error: "Failed to check difference between requests.",
            key,
            statusCode: -1,
          });
        }
      }

      const currentResult = await this.redis
        .multi()
        .incr(key) // Increment the key and capture the new value
        .set(differenceKey, now) // Set the last timestamp
        .pexpire(differenceKey, this.difference) // Set expiration for the timestamp key
        .exec((err, results) => {
          // Execute the transaction
          if (err) {
            return undefined;
          }
          const current = parseInt(results?.[0]?.[1] as string); // Get the value of the first command
          if (current === 1) {
            this.redis.pexpire(key, this.window); // Set expiration for the rate limit key
          }
        });

      // get the current value of the key
      const current = parseInt(currentResult?.[0]?.[1] as string);
      // console.log("this is the request number after we increment:", current)
      if (current === undefined) {
        return this.createErrorResponse({
          error: "Failed to rate limit request.",
          key,
          statusCode: -1,
        });
      }

      // get success and important data
      const success = current <= this.maxRequest;
      const { remaining, ttl } = await this.getRemainingAndTTL(key, current);

      // block the request in local cache if it exceeds the limit
      if (!success && this.localCache) {
        this.localCache.blockUntil(key, now + ttl);
        return this.createErrorResponse({
          error: "Too many requests.",
          key,
          statusCode: -2,
          ttl,
        });
        // console.log("Cache will block the next request")
      }

      return this.createLimitResponse({ success, remaining, ttl, key });
    } catch (error) {
      const message = "Failed to rate limit request";
      this.logger(`${message} - ${error}`);
      return this.createErrorResponse({ error: message, key, statusCode: -1 });
    }
  }

  public async getKeyInfo(key: string) {
    const current = parseInt((await this.redis.get(key)) as string) || 0;
    const { remaining, ttl } = await this.getRemainingAndTTL(key, current);
    return { current, remaining, ttl };
  }

  private async getRemainingAndTTL(
    key: string,
    current: number
  ): Promise<{ remaining: number; ttl: number }> {
    const remaining = Math.max(this.maxRequest - current, 0);
    const ttl = await this.redis.pttl(key);
    return { remaining, ttl };
  }

  private createLimitResponse(res: {
    success: boolean;
    remaining: number;
    ttl: number;
    key: string;
  }): RateLimitResponse {
    return {
      success: res.success,
      remaining: res.remaining,
      limit: this.maxRequest,
      reset: () => this.reset(res.key),
      ttl: res.ttl,
      key: res.key,
      statusCode: 0,
    };
  }

  private createErrorResponse(res: {
    error: string;
    key: string;
    statusCode: number;
    ttl?: number;
    remaining?: number;
  }): RateLimitResponse {
    return {
      success: false,
      remaining: res.remaining ?? 0,
      limit: this.maxRequest,
      reset: () => this.reset(res.key),
      ttl: res.ttl ?? 0,
      error: res.error,
      key: res.key,
      statusCode: res.statusCode || -2,
    };
  }

  private async reset(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      if (this.localCache) {
        this.localCache.pop(key);
      }
    } catch (error) {
      this.logger("Failed to reset rate limit - " + error);
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
