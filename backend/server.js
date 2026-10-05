const http=require('http');
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..','frontend');
const securityHeaders={
  'Content-Security-Policy':"default-src 'self'; script-src 'self' https://www.gstatic.com https://www.googleapis.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' https: blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://api.audius.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cross-Origin-Opener-Policy':'same-origin'
};
const json=(res,status,data)=>{res.writeHead(status,{...securityHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png'};
const port=Number(process.env.PORT)||4173;
const host=process.env.HOST||'127.0.0.1';
const firebaseConfig={
  apiKey:'AIzaSyAxxyjIZdKRtB9nJcHdAnF0YOoX3afpJpI',
  authDomain:'frist-app-d0cd5.firebaseapp.com',
  projectId:'frist-app-d0cd5',
  storageBucket:'frist-app-d0cd5.firebasestorage.app',
  messagingSenderId:'728418975336',
  appId:'1:728418975336:web:22c195d42111324ea385dd',
  measurementId:'G-FQ7ZGP955B'
};
const audiusBase='https://api.audius.co/v1';
const regionalQueries={india:'India',latin:'Latin',africa:'Afrobeats',asia:'K-Pop',europe:'European'};
const audiusHeaders=()=>process.env.AUDIUS_API_KEY?{Authorization:`Bearer ${process.env.AUDIUS_API_KEY}`}:{ };
const audiusClients=new Map();
function rateLimitAudius(req,res){
  const key=req.socket.remoteAddress||'unknown',now=Date.now(),windowMs=60000,limit=60;
  const entry=audiusClients.get(key);
  const current=!entry||now-entry.started>=windowMs?{started:now,count:1}:{started:entry.started,count:entry.count+1};
  audiusClients.set(key,current);
  if(audiusClients.size>1000)for(const [client,value]of audiusClients)if(now-value.started>=windowMs)audiusClients.delete(client);
  if(current.count<=limit)return false;
  res.writeHead(429,{...securityHeaders,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Retry-After':String(Math.ceil((current.started+windowMs-now)/1000))});
  res.end(JSON.stringify({error:'Too many requests'}));return true;
}
const artwork=track=>track.artwork?.['480x480']||track.artwork?.['150x150']||'';
const mapAudiusTrack=track=>({
  id:String(track.id),title:track.title||'Untitled',artist:track.user?.name||track.user?.handle||'Audius artist',
  album:track.album_name||track.genre||'Audius',mood:track.mood||track.genre||'Other',seconds:Number(track.duration)||0,bpm:Number(track.bpm)||0,
  time:`${Math.floor((Number(track.duration)||0)/60)}:${String((Number(track.duration)||0)%60).padStart(2,'0')}`,
  artwork:artwork(track),streamUrl:`/api/audius/stream/${encodeURIComponent(track.id)}`,source:'Audius'
});
async function audiusTracks(url,res){
  try{
    const upstream=await fetch(url,{headers:audiusHeaders(),signal:AbortSignal.timeout(12000)});
    if(!upstream.ok) return json(res,upstream.status,{error:'Audius request failed',status:upstream.status});
    const payload=await upstream.json();
    return json(res,200,{tracks:(Array.isArray(payload.data)?payload.data:[]).map(mapAudiusTrack)});
  }catch(error){return json(res,502,{error:'Audius is currently unavailable',detail:error.message})}
}
async function streamAudius(trackId,req,res){
  try{
    const headers=audiusHeaders();
    if(req.headers.range) headers.Range=req.headers.range;
    const upstream=await fetch(`${audiusBase}/tracks/${encodeURIComponent(trackId)}/stream?app_name=MoodTunes`,{headers,redirect:'follow',signal:AbortSignal.timeout(15000)});
    if(!upstream.ok||!upstream.body) return json(res,upstream.status,{error:'Audius stream unavailable'});
    const responseHeaders={'Content-Type':upstream.headers.get('content-type')||'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'private, max-age=300'};
    for(const name of ['content-length','content-range']){const value=upstream.headers.get(name);if(value)responseHeaders[name]=value}
    res.writeHead(upstream.status,{...securityHeaders,...responseHeaders});
    for await(const chunk of upstream.body)res.write(chunk);
    res.end();
  }catch(error){if(!res.headersSent)json(res,502,{error:'Audius stream unavailable',detail:error.message});else res.destroy(error)}
}
http.createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,'http://localhost');
  const pathname=decodeURIComponent(requestUrl.pathname);
  if(pathname==='/api/health'&&req.method==='GET') return json(res,200,{ok:true});
  if(pathname==='/api/firebase-config'&&req.method==='GET') return json(res,200,firebaseConfig);
  if(pathname==='/api/audius/tracks'&&req.method==='GET'){
    if(rateLimitAudius(req,res))return;
    const region=(requestUrl.searchParams.get('region')||'global').toLowerCase();
    const search=requestUrl.searchParams.get('q')?.trim()||regionalQueries[region];
    const moods=requestUrl.searchParams.getAll('mood').filter(value=>/^[a-z]+$/i.test(value)).slice(0,4);
    const params=new URLSearchParams({limit:'30',app_name:'MoodTunes'});
    if(search)params.set('query',search);
    moods.forEach(mood=>params.append('mood',mood));
    const endpoint=`/tracks/${search||moods.length?'search':'trending'}?${params}`;
    return audiusTracks(audiusBase+endpoint,res);
  }
  const streamMatch=pathname.match(/^\/api\/audius\/stream\/([^/]+)$/);
  if(streamMatch&&req.method==='GET'){if(rateLimitAudius(req,res))return;return streamAudius(streamMatch[1],req,res)}
  if(pathname.startsWith('/api/')) return json(res,404,{error:'API endpoint not found'});
  if(pathname==='/reset-cache'){
    res.writeHead(200,{...securityHeaders,'Content-Type':'text/html; charset=utf-8','Clear-Site-Data':'"cache", "storage"','Cache-Control':'no-store'});
    return res.end('<!doctype html><meta charset="utf-8"><title>Refreshing Mood Tunes</title><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#050d18;color:#dffcff;font:18px system-ui}</style><p>Refreshing Mood Tunes…</p><script>setTimeout(()=>location.replace("/"),700)</script>');
  }
  const requested=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
  const file=path.resolve(root,requested);
  if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html')){res.writeHead(403,securityHeaders);return res.end('Forbidden')}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404,securityHeaders);return res.end('Not found')}res.writeHead(200,{...securityHeaders,'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data)});
}).listen(port,host,()=>console.log(`Mood Tunes is running at http://${host}:${port}`));
