// Wraps the Vercel-style handler at api/index.ts and exposes it on a
// plain HTTP port. Env loading (`.env`, `.env.local`) is done by Node's
// --env-file flags in the `dev` npm script — that happens before any
// ESM import, so lib/core/supabase.ts captures the right credentials.
//
//   npm run dev                       # PORT=3001 default
//   PORT=3010 npm run dev

import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import handler from '../api/index.js';
import type { Request, Response } from '../lib/types/http.js';

const PORT = Number(process.env['PORT'] ?? 3001);

// Vercel adds `.status()`, `.json()`, `.send()` to its response. Polyfill
// them so the handler runs unchanged on bare Node.
function polyfillResponse(res: ServerResponse): Response {
  const r = res as Response;
  r.status = (code: number) => {
    r.statusCode = code;
    return r;
  };
  r.json = (payload: unknown) => {
    if (!r.getHeader('Content-Type')) {
      r.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    r.end(JSON.stringify(payload));
    return r;
  };
  r.send = (payload: unknown) => {
    if (payload !== null && typeof payload === 'object') return r.json(payload);
    r.end(payload === null || payload === undefined ? '' : String(payload));
    return r;
  };
  return r;
}

async function bufferBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

const server = http.createServer((nodeReq: IncomingMessage, nodeRes: ServerResponse) => {
  void (async () => {
    const req = nodeReq as Request;
    const url = new URL(nodeReq.url ?? '/', `http://${nodeReq.headers.host ?? 'localhost'}`);
    req.query = Object.fromEntries(url.searchParams.entries());

    if (nodeReq.method === 'POST') {
      const raw = await bufferBody(nodeReq);
      try {
        req.body = raw ? (JSON.parse(raw) as unknown) : {};
      } catch {
        req.body = {};
      }
    }

    const res = polyfillResponse(nodeRes);

    try {
      await handler(req, res);
    } catch (err: unknown) {
      console.error('[dev-server] handler crashed:', err);
      if (!nodeRes.writableEnded) {
        nodeRes.statusCode = 500;
        nodeRes.end(
          JSON.stringify({
            error: 'internal_error',
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  })();
});

server.listen(PORT, () => {
  console.log(`[dev-server] API listening on http://localhost:${PORT}`);
  console.log(`[dev-server] SUPABASE_URL = ${process.env['SUPABASE_URL'] ?? '(unset)'}`);
});
