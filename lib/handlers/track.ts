/**
 * `POST /v1/track` — frontend telemetry sink.
 *
 * Accepts a tightly validated event from the web app and writes a row to
 * `web_events`. We never trust client-supplied IP/UA — those come from
 * the request headers, not the body.
 */

import { ValidationError } from '../core/errors.js';
import { json } from '../core/http.js';
import { trackWebEvent } from '../core/metrics.js';
import type { Request, Response } from '../types/http.js';

const ALLOWED_EVENT_TYPES = new Set([
  'search_executed',
  'hospital_clicked',
  'map_opened',
  'phone_clicked',
  'directions_clicked',
  'shared',
  'page_viewed',
]);

const MAX_PAYLOAD_BYTES = 4096;

interface TrackBody {
  event_type?: unknown;
  session_id?: unknown;
  referrer?: unknown;
  path?: unknown;
  state_code?: unknown;
  treatment?: unknown;
  payload?: unknown;
}

async function readJsonBody(req: Request): Promise<TrackBody> {
  return new Promise<TrackBody>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_PAYLOAD_BYTES) {
        reject(new ValidationError('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw) as TrackBody);
      } catch {
        reject(new ValidationError('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export async function postTrack(
  req: Request,
  res: Response,
  ip: string,
  userAgent: string | null,
): Promise<void> {
  const body = await readJsonBody(req);

  const eventType = typeof body.event_type === 'string' ? body.event_type : '';
  if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) {
    throw new ValidationError(
      `Invalid event_type. Allowed: ${[...ALLOWED_EVENT_TYPES].join(', ')}`,
    );
  }

  const stateCodeRaw =
    typeof body.state_code === 'string' && /^[A-Z]{2}$/i.test(body.state_code)
      ? body.state_code.toUpperCase()
      : null;

  trackWebEvent({
    event_type: eventType,
    session_id: typeof body.session_id === 'string' ? body.session_id.slice(0, 64) : null,
    ip,
    user_agent: userAgent,
    referrer: typeof body.referrer === 'string' ? body.referrer : null,
    path: typeof body.path === 'string' ? body.path.slice(0, 256) : null,
    state_code: stateCodeRaw,
    treatment: typeof body.treatment === 'string' ? body.treatment.slice(0, 64) : null,
    payload:
      body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : null,
  });

  json(res, 202, { accepted: true });
}
