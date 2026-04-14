/**
 * Servidor local — roda a mesma função serverless da Vercel usando
 * o módulo http nativo do Node. Útil para desenvolvimento.
 *
 * O handler em api/index.js espera (req, res) no estilo Vercel, que é
 * compatível com http.IncomingMessage / ServerResponse, então basta
 * passar a função direto.
 */
const http = require('http');
const handler = require('../api/index.js');

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = http.createServer(async (req, res) => {
  // Shim de compatibilidade: o handler Vercel usa res.status(code),
  // mas o http.ServerResponse nativo usa res.statusCode.
  res.status = (code) => { res.statusCode = code; return res; };

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
  console.log('Rotas disponíveis:');
  console.log('  GET /v1/estados');
  console.log('  GET /v1/estados/:uf');
  console.log('  GET /v1/hospitais?uf=SP');
  console.log('  GET /v1/hospitais/proximos?cep=13280000&raio=50000');
  console.log('  GET /v1/hospitais/:id');
});
