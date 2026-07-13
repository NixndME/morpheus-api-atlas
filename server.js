/* Morpheus API Atlas — static server + API relay (no dependencies) */
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path'), { URL } = require('url');

const PORT = process.env.PORT || 2222;
const ROOT = path.join(__dirname, 'app');
const ALLOWED_HOST = process.env.ALLOWED_HOST || '';   // optional: pin relay to one Morpheus host
const MIME = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json',
              '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2'};

function serveStatic(req, res){
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {'content-type': MIME[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  });
}

function relay(req, res){
  let raw = '';
  req.on('data', c => { raw += c; if (raw.length > 2e6) req.destroy(); });
  req.on('end', () => {
    let j;
    try { j = JSON.parse(raw); } catch { return bad(res, 400, 'invalid JSON'); }
    const { base, method, apiPath, token, body } = j;
    let target;
    try { target = new URL(apiPath, base); } catch { return bad(res, 400, 'invalid base URL'); }
    if (!['http:','https:'].includes(target.protocol)) return bad(res, 400, 'only http/https base URLs are supported');
    if (!target.pathname.startsWith('/api/')) return bad(res, 400, 'only /api/* paths are relayed');
    if (!['GET','POST','PUT','DELETE'].includes(method)) return bad(res, 400, 'method not allowed');
    if (ALLOWED_HOST && target.hostname !== ALLOWED_HOST) return bad(res, 403, `relay pinned to ${ALLOWED_HOST}`);
    // SSRF hardening: never relay to cloud metadata / link-local targets
    const hn = target.hostname.toLowerCase();
    if (hn === 'metadata.google.internal' || hn === 'metadata' ||
        /^169\.254\./.test(hn) || hn === '[fd00:ec2::254]' || hn === 'fd00:ec2::254')
      return bad(res, 403, 'relay to link-local/metadata addresses is blocked');

    const lib = target.protocol === 'http:' ? http : https;
    const started = Date.now();
    const opts = { method, headers: { 'authorization': 'Bearer ' + (token||''), 'accept': 'application/json' },
                   rejectUnauthorized: false, timeout: 30000 };
    if (body) opts.headers['content-type'] = 'application/json';
    let up;
    try {
      up = lib.request(target, opts, r => {
      let out = '';
      r.on('data', c => out += c);
      r.on('end', () => {
        res.writeHead(200, {'content-type':'application/json'});
        res.end(JSON.stringify({ status: r.statusCode, ms: Date.now()-started, body: out.slice(0, 800000) }));
      });
      });
    } catch (e) {
      return bad(res, 400, 'could not open request: ' + (e.message || e.code));
    }
    up.on('timeout', () => { up.destroy(); res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({ status: 0, ms: Date.now()-started, error: 'timeout after 30s' })); });
    up.on('error', e => { res.writeHead(200, {'content-type':'application/json'});
      res.end(JSON.stringify({ status: 0, ms: Date.now()-started, error: e.code || e.message })); });
    if (body) up.write(typeof body === 'string' ? body : JSON.stringify(body));
    up.end();
  });
}
function bad(res, code, msg){ res.writeHead(code, {'content-type':'application/json'}); res.end(JSON.stringify({error: msg})); }

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/run') return relay(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  res.writeHead(405); res.end();
}).listen(PORT, () => console.log(`Morpheus API Atlas on :${PORT}` + (ALLOWED_HOST ? ` (relay pinned to ${ALLOWED_HOST})` : '')));
