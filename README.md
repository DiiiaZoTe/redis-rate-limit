<div align="center">
  <h1>@diiiazote/redis-rate-limit</h1>
  <b>v1.0.7</b>
  <p>A simple rate limiter for Redis using ioredis</p>
</div>

---

@diiiazote/redis-rate-limit is an easy-to-use rate limiting library built for Node.js applications that rely on Redis for managing rate limits across distributed systems or single server setups. It utilizes ioredis for seamless integration with Redis and provides an developer friendly implemenation to manage request rates per identifier (e.g., user IP).

---

## Import

### Installation

You can install **`@diiiazote/redis-rate-limit`** using npm:

```
npm install @diiiazote/redis-rate-limit
```

### Importing + initialization

To use `@diiiazote/redis-rate-limit`, import the RateLimit class from the package and initialize it with a Redis client instance, and configuration parameters:

```typescript
import Redis from 'ioredis';
import { RateLimit } from '@diiiazote/redis-rate-limit';

const redisClient = new Redis(process.env.REDIS_URL_HERE);

// minimum configuration needed
const rateLimiter = new RateLimit({
  redis: redisClient,
  prefix: 'api-rate-limit'
});
```

### RateLimit props

Here is a table of properties you can configure for the `RateLimit` class:

| Name             | Type       | Description                                                 | Default
| ---------------- | ---------- | ----------------------------------------------------------- | -------------------- |
| `redis`          | `Redis`    | An instance of ioredis client.                              | N.A                  |
| `prefix`         | `string`   | A prefix for Redis keys to namespace different rate limits. | N.A                  |
| `window`         | `number`   | The duration in which requests are counted.                 | `1000` or `ms("1s")` |
| `limit`          | `number`   | The maximum number of requests allowed within the window.   | `1`                  |
| `difference`     | `number`   | Minimum time interval between requests. Acts as a cooldown. | `0` or `ms("0s")`    |
| `ephemeralCache` | `boolean`  | Whether to use an in-memory cache to store rate limit data. | `true`               |
| `logger`         | `Function` | Custom function for logging errors.                         | `console.error`      |

### RateLimit limit method response

Here is a table of the response object for the `.limit` method:

| Name         | Type                  | Description                                                      |
| ------------ | --------------------- | ---------------------------------------------------------------- |
| `key`        | `string`              | Key used for rate limiting.                                      |
| `success`    | `boolean`             | Whether the request is allowed.                                  |
| `remaining`  | `number`              | Number of requests remaining before hitting the rate limit.      |
| `limit`      | `number`              | Maximum number of requests allowed within the rate limit window. |
| `reset`      | `() => Promise<void>` | Function to reset the rate limit.                                |
| `ttl`        | `number`              | Time to live in milliseconds until the rate limit resets.        |
| `error`      | `string`              | Optional error message when the request fails.                   |
| `statusCode` | `number`              | Status code indicating the type of response or error.            |

---

## Usage

### Express

Here's how to use the `@diiiazote/redis-rate-limit` in an express application to limit API requests:

```typescript
import express from 'express';
import Redis from "ioredis";
import { RateLimit } from '@diiiazote/redis-rate-limit';

const app = express();
const rateLimiter = new RateLimit({
  redis: new Redis(),
  prefix: "MyAPI",
  window: "1m",
  limit: 100
});

app.use(async (req, res, next) => {
  const ip = req.ip;
  const response = await rateLimiter.limit(ip);
  if (!response.success) {
    return res.status(429).json({ message: "Too many requests" });
  }
  next();
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

### Next.js (self-hosted)

Here's how to use the `@diiiazote/redis-rate-limit` in Next.js. 

Define the rate limit instance outside of router function or server action.
```typescript
// /lib/rate-limit.ts
import Redis from "ioredis";
import { RateLimit, RateLimitResponse, ms } from "@diiiazote/redis-rate-limit";

// define redis
export const redis = new Redis(env.RATE_LIMIT_REDIS_HOST)

// define the api rate limit - here max 100 requests per minute
export const apiRateLimit = new RateLimit({
  redis,
  prefix: "MyApp/api", // or anything else
  window: ms("1m"),
  limit: 100,
})
```
Then import and use it with let's say the user's ip.
```typescript
// /api/myRoute/route.ts
import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { apiRateLimit } from "/lib/rate-limit"; // defined above

export async function POST(
  request: NextRequest,
) {
  const ip = headers().get("x-forwarded-for") ?? "Anonymous";
  const limit = await apiRateLimit.limit(ip);
  if(!limit?.success) {
    // rate limited, return too many request response
  }
  // ... do something not rate limited here
}
```

The nice thing about this approach is you can define multiple rate limiters
for each route/action as need be. Make sure to change the `prefix` prop so there
is no conflicts between your rate limiters. I like to use the app name and limiter name (what I'm limiting):
``` `${app_name}/${limiter_name}` ```

---

## Features

- **Flexible Rate Limiting**: Configurable windows and limits to accommodate various use cases.
- **Cooldown Support**: Ensures a minimum interval between requests with the `difference` option.
- **In-memory Caching**: Optional local caching to reduce Redis calls.
- **Easy Integration**: Simple setup with ioredis and minimal configuration.

---

## Extras

The package also exports utility functions for managing and converting durations:

- `ms`: Convert a readable duration to milliseconds.
- `msPrecise`: Sum multiple durations.
- `msToFriendly`: Convert milliseconds to a human-readable format.
- `formatDuration`: Convert milliseconds to a formatted string based on specified units.

---

## Limitations

While `redis-rate-limit` is designed to be robust and efficient, it's recommended to perform your own performance testing to ensure it meets the specific demands and traffic patterns of your application.

---

## Dependencies

`redis-rate-limit` depends only on `ioredis`.

## License

redis-rate-limit is ISC licensed.

<a href="https://www.buymeacoffee.com/alexvencel" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" height="60" /></a>