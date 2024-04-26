import { RateLimit } from './class';
import type { RateLimitConfig, RateLimitResponse } from './class';
import { ms, msPrecise, msToFriendly, formatDuration } from './utils';
import type { Unit, Duration } from './utils';

export { RateLimit, ms, msPrecise, msToFriendly, formatDuration };
export type { RateLimitConfig, RateLimitResponse, Unit, Duration };
export default RateLimit;