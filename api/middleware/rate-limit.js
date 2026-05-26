const redis = require('../lib/redis');

const RATE_LIMIT = 15; // requests per window
const RATE_WINDOW = 60; // window length in seconds

async function checkRateLimit(ip) {
  if (!redis.isConfigured) {
    return { allowed: true, count: 0, remaining: RATE_LIMIT };
  }

  const window = Math.floor(Date.now() / (RATE_WINDOW * 1000));
  const key = `rl:${ip}:${window}`;

  try {
    const result = await redis.pipeline([
      ['INCR', key],
      ['EXPIRE', key, RATE_WINDOW],
    ]);
    const count = result[0].result;
    return {
      allowed: count <= RATE_LIMIT,
      count,
      remaining: Math.max(0, RATE_LIMIT - count),
    };
  } catch {
    // Fail open if Upstash is unreachable.
    return { allowed: true, count: 0, remaining: RATE_LIMIT };
  }
}

function applyRateHeaders(res, rate) {
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT);
  res.setHeader('X-RateLimit-Remaining', rate.remaining);
  res.setHeader('X-RateLimit-Window', `${RATE_WINDOW}s`);
}

module.exports = {
  checkRateLimit,
  applyRateHeaders,
  RATE_LIMIT,
  RATE_WINDOW,
};
