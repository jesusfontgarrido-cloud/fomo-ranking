// Servidor de pruebas: sirve /web y simula el Apps Script con el mismo Code.gs.
const http = require('http'), fs = require('fs'), path = require('path');
const { makeEnv } = require('../apps-script/test/mock');
const env = makeEnv(); env.ctx.setup();
const WEB = path.join(__dirname, '..', 'web');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const PORT = process.env.PORT || 8123;
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }); return res.end(); }
  if (req.url === '/api' && req.method === 'POST') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(env.call(JSON.parse(b))));
    }); return;
  }
  if (req.url === '/admin-me' ) { // atajo de test: hace admin al usuario por nombre
    env.sheets.Usuarios.data.forEach(r => { if (r[1] === 'Jesús') r[9] = 'SI'; }); res.end('ok'); return;
  }
  let f = req.url.split('?')[0]; if (f === '/') f = '/index.html';
  if (f === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('window.FOMO_CONFIG={API:"/api"}'); }
  const full = path.join(WEB, f);
  if (!full.startsWith(WEB) || !fs.existsSync(full)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(full)] || 'application/octet-stream' }); res.end(fs.readFileSync(full));
}).listen(PORT, () => console.log('listo en', PORT));
