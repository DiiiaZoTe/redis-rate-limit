import type { RateLimitConfig, RateLimitResponse } from "./class";
import { RateLimit } from "./class";
import type { Duration, Unit } from "./utils";
import { formatDuration, ms, msPrecise, msToFriendly } from "./utils";

export { RateLimit, ms, msPrecise, msToFriendly, formatDuration };
export type { RateLimitConfig, RateLimitResponse, Unit, Duration };
export default RateLimit;
