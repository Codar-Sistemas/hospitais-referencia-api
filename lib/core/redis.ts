/**
 * Upstash Redis REST client — used by the rate limiter. When Upstash is not
 * configured (local dev without external services) the pipeline returns
 * `null`; callers must fall back to a permissive default in that case.
 */

const UPSTASH_URL: string | undefined = process.env['UPSTASH_REDIS_REST_URL'];
const UPSTASH_TOKEN: string | undefined = process.env['UPSTASH_REDIS_REST_TOKEN'];

export const isConfigured: boolean = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

/** A single Upstash command, e.g. `['INCR', 'rate:1.2.3.4']`. */
export type RedisCommand = (string | number)[];

/** Upstash pipeline response — one entry per command. */
export type RedisPipelineResponse = Array<{ result?: unknown; error?: string }>;

/**
 * Sends a batch of commands to Upstash. Returns `null` if Upstash is not
 * configured, so callers don't have to check `isConfigured` themselves.
 */
export async function pipeline(commands: RedisCommand[]): Promise<RedisPipelineResponse | null> {
  if (!isConfigured) return null;
  const r = await fetch(`${UPSTASH_URL ?? ''}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  return (await r.json()) as RedisPipelineResponse;
}
