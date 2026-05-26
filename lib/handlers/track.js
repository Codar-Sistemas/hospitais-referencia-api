const { json } = require('../core/http');
const { ValidationError } = require('../core/errors');
const { trackWebEvent } = require('../core/metrics');

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

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on('data', (chunk) => {
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
        resolve(JSON.parse(raw));
      } catch {
        reject(new ValidationError('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function postTrack(req, res, ip, userAgent) {
  const body = await readJsonBody(req);

  if (!body.event_type || !ALLOWED_EVENT_TYPES.has(body.event_type)) {
    throw new ValidationError(
      `Invalid event_type. Allowed: ${[...ALLOWED_EVENT_TYPES].join(', ')}`,
    );
  }

  trackWebEvent({
    event_type: body.event_type,
    session_id: typeof body.session_id === 'string' ? body.session_id.slice(0, 64) : null,
    ip,
    user_agent: userAgent,
    referrer: typeof body.referrer === 'string' ? body.referrer : null,
    path: typeof body.path === 'string' ? body.path.slice(0, 256) : null,
    state_code:
      typeof body.state_code === 'string' && /^[A-Z]{2}$/i.test(body.state_code)
        ? body.state_code.toUpperCase()
        : null,
    treatment: typeof body.treatment === 'string' ? body.treatment.slice(0, 64) : null,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : null,
  });

  json(res, 202, { accepted: true });
}

module.exports = { postTrack };
