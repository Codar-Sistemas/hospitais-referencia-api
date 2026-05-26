// Local server — runs the same Vercel serverless function via Node's native http
// module. Used for development. The handler in api/index.js expects (req, res)
// in the Vercel style, which is compatible with http.IncomingMessage/ServerResponse.

const http = require('http');
const handler = require('../api/index.js');

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = http.createServer(async (req, res) => {
  // Compat shim: Vercel handler uses res.status(code), native ServerResponse uses res.statusCode.
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  try {
    await handler(req, res);
  } catch (e) {
    console.error('[unhandled]', e);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: { status: 500, message: String(e.message || e) } }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`hospitais-referencia-api local: http://localhost:${PORT}`);
  console.log(`Backend (PostgREST):   ${process.env.SUPABASE_URL}`);
  console.log('');
  console.log('Available routes:');
  console.log('  GET /v1/states');
  console.log('  GET /v1/states/:state_code');
  console.log('  GET /v1/hospitals?state_code=SP');
  console.log('  GET /v1/hospitals/nearby?cep=13280000&radius_m=50000');
  console.log('  GET /v1/hospitals/:id');
});
