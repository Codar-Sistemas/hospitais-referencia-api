// Returns `null` when Upstash is not configured (local dev). Callers
// must fall back to a permissive default in that case — see rate-limit.ts.

const UPSTASH_URL: string | undefined = process.env['UPSTASH_REDIS_REST_URL'];
const UPSTASH_TOKEN: string | undefined = process.env['UPSTASH_REDIS_REST_TOKEN'];

export const isConfigured: boolean = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

export type RedisCommand = (string | number)[];
export type RedisPipelineResponse = Array<{ result?: unknown; error?: string }>;

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
