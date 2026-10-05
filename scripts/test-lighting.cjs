// Browser regression: real Web Audio, loud musical pulses, and pause/resume.
// Firebase and the catalog are stubbed on an isolated local fixture server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const root = path.resolve(__dirname, '../frontend');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const browserCandidates = process.platform === 'win32'
  ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ]
  : process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const browser = process.env.CHROME_PATH || browserCandidates.find(candidate => fs.existsSync(candidate));

function makeAudio() {
  const rate = 44100, duration = 40;
  const buffer = Buffer.alloc(44 + rate * duration * 2);
  buffer.write('RIFF'); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(buffer.length - 44, 40);
  for (let i = 0; i < rate * duration; i++) {
    const t = i / rate, pulse = Math.exp(-(t % .5) * 20);
    // Loud, sustained harmonics plus a 120 BPM kick; stresses detector saturation.
    const sample = (.66 + .31 * pulse) * Math.sin(2 * Math.PI * 172 * t);
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  return buffer;
}

async function main() {
  assert(browser, 'Chrome or Chromium was not found. Set CHROME_PATH to the browser executable.');
  const audio = makeAudio();
  const exports = fs.readFileSync(path.join(root, 'app.js'), 'utf8').match(/import \{([^}]+)\} from '.\/firebase-client.js'/)[1].split(',').map(name => name.trim());
  const implemented = ['initializeCloud', 'ensureUserDocument', 'listenCloudData', 'currentUserId', 'savePreferences'];
  const firebase = `
    const user = { uid: 'test-listener', displayName: 'Lighting test', email: 'test@example.test' };
    const profile = { name: user.displayName, email: user.email };
    let listener; const settings = { volume: 100, lightingMode: 'dj', lightingIntensity: 90 };
    window.__writes = [];
    export const initializeCloud = async callback => callback(user);
    export const ensureUserDocument = async () => profile;
    export const currentUserId = () => user.uid;
    export const listenCloudData = callback => { listener = callback; callback('preferences', settings, false); };
    export const savePreferences = async data => { window.__writes.push(data); Object.assign(settings, data); listener?.('preferences', settings, false); };
    ${exports.filter(name => !implemented.includes(name)).map(name => `export const ${name} = async () => {};`).join('\n')}
  `;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/firebase-client.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(firebase); }
    if (pathname === '/api/audius/tracks') {
      const requestUrl = new URL(req.url, 'http://localhost');
      const query = requestUrl.searchParams.get('q');
      const mood = requestUrl.searchParams.get('mood') || 'Other';
      const id = query === 'Telugu' ? 'telugu-first' : query === 'Tamil' ? 'tamil-second' : requestUrl.searchParams.has('mood') ? 'normal-third' : 'pulse';
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ tracks: [{ id, title: id, artist: 'Test', mood, seconds: 40, streamUrl: '/test.wav' }] }));
    }
    if (pathname === '/test.wav') {
      const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) : audio.length - 1;
      res.writeHead(range ? 206 : 200, { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${audio.length}` } : {}) });
      return res.end(audio.subarray(start, end + 1));
    }
    const file = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
      res.end(fs.readFileSync(file));
    } catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sonora-lighting-'));
  const chrome = spawn(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let browserLog = '';
  chrome.stderr.on('data', chunk => { browserLog += chunk.toString(); });
  let socket, closeBrowser;
  try {
    const portFile = path.join(profileDir, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i++) {
      try { port = fs.readFileSync(portFile, 'utf8').split('\n')[0]; if (/^\d+$/.test(port)) break; } catch {}
      await delay(100);
    }
    assert(port, `Browser did not start: ${browserLog.slice(-1500)}`);
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    console.log('Browser connected; testing actual audio playback.');
    let id = 0; const pending = new Map(), errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) { const waiter = pending.get(message.id); pending.delete(message.id); if (waiter) message.error ? waiter.reject(message.error) : waiter.resolve(message.result); }
      else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const key = ++id;
      const timeout = setTimeout(() => { pending.delete(key); reject(new Error(`Browser timeout: ${method}\n${browserLog.slice(-1800)}`)); }, 15000);
      pending.set(key, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
      socket.send(JSON.stringify({ id: key, method, params }));
    });
    closeBrowser = () => send('Browser.close');
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__audioEvents = [];
      const NativeAudio = window.Audio;
      window.Audio = function(...args) {
        const audio = new NativeAudio(...args);
        for (const type of ['error', 'playing', 'loadedmetadata']) audio.addEventListener(type, () => window.__audioEvents.push({ type, src: audio.src, code: audio.error?.code, message: audio.error?.message }));
        return audio;
      };
    ` });
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 100; i++) {
      if (await evaluate(`!!document.querySelector('#homeTracks .track')`)) break;
      await delay(100);
    }
    await evaluate(`document.querySelector('#playMix').click()`);
    for (let i = 0; i < 50; i++) {
      if (await evaluate(`document.querySelector('#player').classList.contains('beat-reactive')`)) break;
      await delay(100);
    }
    await delay(1000);
    const readiness = await evaluate(`({ catalog: document.querySelector('#catalogStatus').textContent, toast: document.querySelector('#toast').textContent, auth: document.querySelector('#authStatus').textContent, tracks: document.querySelectorAll('#homeTracks .track').length, firebaseLoaded: !!window.__writes, lighting: document.querySelector('#player').classList.contains('beat-reactive') })`);
    console.log(readiness);
    if (!readiness.lighting) console.log(await evaluate('window.__audioEvents'), browserLog.slice(-1800));
    assert(readiness.lighting, 'Fixture audio must start before checking its colors');
    const sample = () => evaluate(`new Promise(resolve => {
      const values = []; let count = 0;
      const timer = setInterval(() => {
        values.push(getComputedStyle(document.querySelector('#player')).getPropertyValue('--track-accent'));
        if (++count === 30) { clearInterval(timer); resolve({ colors: [...new Set(values)].length, status: document.querySelector('#lightingStatus').textContent, elapsed: document.querySelector('#elapsed').textContent }); }
      }, 100);
    })`);
    const first = await sample();
    const sustained = await sample();
    await evaluate(`document.querySelector('#playToggle').click()`);
    const paused = await sample();
    await evaluate(`document.querySelector('#playToggle').click()`);
    await delay(700);
    const resumed = await sample();
    await evaluate(`const mode = document.querySelector('#lightingMode'); mode.value = 'off'; mode.dispatchEvent(new Event('change'));`);
    const off = await sample();
    await evaluate(`document.querySelector('#lightingMode').value = 'beat'; document.querySelector('#lightingMode').dispatchEvent(new Event('change'));`);
    const reenabled = await sample();
    await evaluate(`document.querySelector('[data-mood="Happy"]').click()`);
    let moodOrder = [];
    for (let i = 0; i < 50; i++) {
      moodOrder = await evaluate(`[...document.querySelectorAll('#homeTracks .track')].map(row => row.dataset.id)`);
      if (moodOrder.length === 3) break;
      await delay(100);
    }
    console.log(JSON.stringify({ first, sustained, paused, resumed, off, reenabled, moodOrder, errors }, null, 2));
    assert(first.colors >= 4 && sustained.colors >= 4, 'Colors must keep changing during loud playback');
    assert(resumed.colors >= 4 && reenabled.colors >= 4, 'Colors must keep changing after resume and enabling lights');
    assert.equal(paused.colors, 1, 'Paused lighting must be stable');
    assert.equal(off.colors, 1, 'Off mode must be stable');
    assert(first.status.startsWith('Audio reactive'), 'Test must exercise real analysis, not the rhythm fallback');
    assert.deepEqual(moodOrder, ['telugu-first', 'tamil-second', 'normal-third'], 'Mood results must prioritize Telugu, then Tamil, then regular tracks');
    assert.equal(errors.length, 0, 'No browser runtime errors');
  } finally {
    if (closeBrowser) await closeBrowser().catch(() => {});
    socket?.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore', timeout: 3000 });
    else chrome.kill();
    chrome.stderr.destroy(); chrome.unref();
    server.closeAllConnections(); server.close();
    await delay(700);
    // Only remove the exact temporary browser profile created by this test.
    if (path.dirname(profileDir) === path.resolve(os.tmpdir()) && path.basename(profileDir).startsWith('sonora-lighting-')) {
      try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
