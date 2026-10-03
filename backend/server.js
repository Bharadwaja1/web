const http=require('http');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..','frontend');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/reset-cache'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Clear-Site-Data':'"cache", "storage"','Cache-Control':'no-store'});
    return res.end('<!doctype html><meta charset="utf-8"><title>Refreshing Sonora</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#050d18;color:#dffcff;font:18px system-ui}</style><p>Refreshing Sonora…</p><script>setTimeout(()=>location.replace("/"),700)</script>');
  }
  const requested=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const file=path.resolve(root,requested);
  if(!file.startsWith(root)){res.writeHead(403);return res.end('Forbidden')}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data)});
}).listen(4173,'127.0.0.1',()=>console.log('Sonora is running at http://localhost:4173'));
