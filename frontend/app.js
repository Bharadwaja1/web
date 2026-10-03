const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const moods=[['Happy','😊'],['Sad','😢'],['Calm','😌'],['Angry','😠'],['Stressed','😫'],['Energetic','🤩'],['Tired','😴'],['Neutral','😐']];
const tracks=[
  {title:'Golden Hour',artist:'Neon Harbor',album:'Afterglow',mood:'Happy',time:'3:24',seconds:204,color:'#16c79a,#5967ff',freq:262},
  {title:'Blue Rooms',artist:'Cassette Hearts',album:'Distance',mood:'Sad',time:'3:42',seconds:222,color:'#315be8,#6942a8',freq:220},
  {title:'Still Water',artist:'Aster Vale',album:'Soft Focus',mood:'Calm',time:'4:05',seconds:245,color:'#20c9a3,#175590',freq:196},
  {title:'Static Fire',artist:'Violet Drive',album:'Voltage',mood:'Angry',time:'2:58',seconds:178,color:'#ee3c42,#891d51',freq:330},
  {title:'Pressure Drop',artist:'Echo Field',album:'Release',mood:'Stressed',time:'3:16',seconds:196,color:'#d75178,#7537b0',freq:247},
  {title:'Electric Run',artist:'Nova Club',album:'Pulse',mood:'Energetic',time:'3:02',seconds:182,color:'#ff8c24,#f74d78',freq:392},
  {title:'Half Awake',artist:'Cloud Cinema',album:'Quiet Hours',mood:'Tired',time:'4:12',seconds:252,color:'#526976,#202943',freq:175},
  {title:'In Between',artist:'Common Ground',album:'Everyday',mood:'Neutral',time:'3:11',seconds:191,color:'#73808c,#4b585d',freq:277}
].map((t,i)=>({...t,id:i+1,cover:`linear-gradient(135deg,${t.color})`}));

const moodStyle = {
  Happy: ['#f4cf79', '#6df5ce', 'Feel-good'],
  Sad: ['#99b7ff', '#b4a1ff', 'Let it out'],
  Calm: ['#6df5ce', '#54d7f5', 'Slow down'],
  Angry: ['#ff9b94', '#ff8bb5', 'Release'],
  Stressed: ['#d0a4ff', '#99b7ff', 'Unwind'],
  Energetic: ['#ffbb7c', '#ff8bb5', 'Turn it up'],
  Tired: ['#b5b2e6', '#99b7ff', 'Drift away'],
  Neutral: ['#a8d4df', '#b4a1ff', 'Go with it']
};
const heartIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 5.4a5.3 5.3 0 0 0-7.5 0L12 6.7l-1.3-1.3a5.3 5.3 0 1 0-7.5 7.5L12 21l8.8-8.1a5.3 5.3 0 0 0 0-7.5Z"/></svg>';
const trackIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/></svg>';
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
function readList(key, fallback) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved.filter(id => tracks.some(t => t.id === id)) : fallback;
  } catch { return fallback; }
}
let favorites = new Set(readList('sonora-favorites', [1, 3, 6]));
let recent = readList('sonora-recent', []);
let current = tracks[0], playing = false, hasStarted = false, elapsed = 0;
let timer, audioContext, oscillator, gain, analyser, waveformData, animationFrame;
let playbackRequest = 0, clockOffset = 0;
const savedVolume = Number(localStorage.getItem('sonora-volume') ?? 35);
let volume = Number.isFinite(savedVolume) ? Math.max(0, Math.min(100, savedVolume)) / 100 : .35;
const formatTime = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

function notify(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}
function save() {
  localStorage.setItem('sonora-favorites', JSON.stringify([...favorites]));
  localStorage.setItem('sonora-recent', JSON.stringify(recent));
}
function favoriteLabel(t) {
  return (favorites.has(t.id) ? 'Remove ' + t.title + ' from' : 'Add ' + t.title + ' to') + ' favorites';
}
function row(t) {
  return '<article class="track ' + (current.id === t.id && playing ? 'current' : '') + '" data-id="' + t.id + '">' +
    '<button class="track-play" aria-label="Play ' + t.title + ' by ' + t.artist + '">' +
    '<span class="cover track-cover" style="--cover:' + t.cover + '">' + trackIcon + '</span>' +
    '<span class="track-name"><b>' + t.title + '</b><small>' + t.artist + '</small></span></button>' +
    '<span class="meta album">' + t.album + '</span><span class="meta">' + t.mood + ' · ' + t.time + '</span>' +
    '<button class="heart ' + (favorites.has(t.id) ? 'on' : '') + '" aria-label="' + favoriteLabel(t) +
    '" aria-pressed="' + favorites.has(t.id) + '">' + heartIcon + '</button></article>';
}
function paint(target, list) {
  const container = $(target);
  // Keep keyboard focus on the same control when a list changes.
  const focused = container.contains(document.activeElement) ? document.activeElement : null;
  const focusRow = focused?.closest('.track');
  const focusId = focusRow?.dataset.id;
  const focusClass = focused?.classList.contains('heart') ? '.heart' : '.track-play';
  const focusIndex = focusRow ? [...container.children].indexOf(focusRow) : 0;
  container.innerHTML = list.map(row).join('');
  container.querySelectorAll('.track').forEach(el => {
    const t = tracks.find(track => track.id === Number(el.dataset.id));
    el.onclick = event => {
      if (event.target.closest('.heart')) toggleFavorite(t);
      else play(t);
    };
  });
  if (focusId) {
    const replacement = container.querySelector('[data-id="' + focusId + '"] ' + focusClass) ||
      container.children[Math.min(focusIndex, container.children.length - 1)]?.querySelector(focusClass);
    (replacement || $('[data-view="liked"]')).focus({ preventScroll: true });
  }
}
function render() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const found = tracks.filter(t => [t.title, t.artist, t.album, t.mood].join(' ').toLowerCase().includes(query));
  const liked = tracks.filter(t => favorites.has(t.id));
  const history = recent.map(id => tracks.find(t => t.id === id)).filter(Boolean);
  paint('#homeTracks', tracks);
  paint('#searchTracks', found);
  paint('#likedTracks', liked);
  paint('#recentTracks', history);
  $('#searchEmpty').classList.toggle('hidden', !!found.length);
  $('#likedEmpty').classList.toggle('hidden', !!liked.length);
  $('#recentEmpty').classList.toggle('hidden', !!history.length);
}
function syncFavorite() {
  const button = $('#playerFavorite');
  button.innerHTML = heartIcon;
  button.classList.toggle('on', favorites.has(current.id));
  button.setAttribute('aria-label', favoriteLabel(current));
  button.setAttribute('aria-pressed', String(favorites.has(current.id)));
}
function toggleFavorite(t) {
  favorites.has(t.id) ? favorites.delete(t.id) : favorites.add(t.id);
  save();
  render();
  syncFavorite();
  notify(favorites.has(t.id) ? 'Added to favorites' : 'Removed from favorites');
}
function stopTone() {
  if (!oscillator || !audioContext) return;
  const oldOscillator = oscillator, oldGain = gain;
  oscillator = null;
  gain = null;
  oldGain.gain.cancelScheduledValues(audioContext.currentTime);
  oldGain.gain.setValueAtTime(oldGain.gain.value, audioContext.currentTime);
  oldGain.gain.linearRampToValueAtTime(0, audioContext.currentTime + .06);
  oldOscillator.stop(audioContext.currentTime + .07);
  oldOscillator.onended = () => {
    oldOscillator.disconnect();
    oldGain.disconnect();
  };
}
async function startTone(request) {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) throw new Error('Audio unavailable');
  audioContext ||= new AudioEngine();
  if (audioContext.state !== 'running') await audioContext.resume();
  if (request !== playbackRequest || !playing) return false;
  if (!analyser) {
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.connect(audioContext.destination);
    waveformData = new Uint8Array(analyser.fftSize);
  }
  oscillator = audioContext.createOscillator();
  gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = current.freq;
  gain.gain.setValueAtTime(0, audioContext.currentTime);
  gain.gain.linearRampToValueAtTime(volume * .12, audioContext.currentTime + .2);
  oscillator.connect(gain).connect(analyser);
  oscillator.start();
  clockOffset = audioContext.currentTime - elapsed;
  return true;
}
function updateProgress() {
  $('#elapsed').textContent = formatTime(elapsed);
  const seek = $('#seek');
  seek.max = current.seconds;
  seek.value = Math.floor(elapsed);
  seek.style.setProperty('--fill', elapsed / current.seconds * 100 + '%');
  seek.setAttribute('aria-valuetext', formatTime(elapsed) + ' of ' + current.time);
}
function drawWaveform() {
  const canvas = $('#waveform'), context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width, height = canvas.height, center = height / 2;
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#b9cef513';
  context.lineWidth = 1;
  for (let x = 0; x < width; x += 32) {
    context.beginPath(); context.moveTo(x, 22); context.lineTo(x, height - 22); context.stroke();
  }
  context.beginPath(); context.moveTo(0, center); context.lineTo(width, center); context.stroke();
  const palette = moodStyle[current.mood];
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, palette[0]); gradient.addColorStop(1, palette[1]);
  context.strokeStyle = gradient;
  context.lineWidth = 2.5;
  context.shadowColor = palette[0]; context.shadowBlur = 12;
  context.beginPath();
  const active = playing && analyser && !motionPreference.matches;
  if (active) analyser.getByteTimeDomainData(waveformData);
  for (let x = 0; x <= width; x += 2) {
    const sample = active ? (waveformData[Math.min(waveformData.length - 1, Math.floor(x / width * waveformData.length))] - 128) / 128 : 0;
    const envelope = Math.sin(x / width * Math.PI);
    const y = center + Math.max(-.85, Math.min(.85, sample * 12)) * center * envelope;
    if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.stroke(); context.shadowBlur = 0;
}
function animateWaveform() {
  cancelAnimationFrame(animationFrame);
  drawWaveform();
  if (playing && !motionPreference.matches && !document.hidden && $('#home').classList.contains('active')) {
    animationFrame = requestAnimationFrame(animateWaveform);
  }
}
function syncPlayer() {
  $('#player').classList.toggle('playing', playing);
  $('#frequencyCard').classList.toggle('playing', playing);
  $('#playToggle').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#playToggle').title = playing ? 'Pause' : 'Play';
  $('#signalState').textContent = playing ? 'PLAYING' : hasStarted ? 'PAUSED' : 'READY';
  $('#playerStatus').textContent = playing ? 'NOW PLAYING' : hasStarted ? 'PAUSED' : 'READY TO PLAY';
  $('#trackTitle').textContent = current.title;
  $('#trackArtist').textContent = current.artist;
  $('#cover').style.setProperty('--cover', current.cover);
  $('#duration').textContent = current.time;
  $('#featuredTitle').textContent = current.title;
  $('#featuredArtist').textContent = current.artist + ' · ' + current.album;
  $('#featuredMood').textContent = current.mood;
  document.documentElement.style.setProperty('--track-accent', moodStyle[current.mood][0]);
  document.documentElement.style.setProperty('--track-secondary', moodStyle[current.mood][1]);
  $$('.mood').forEach(button => {
    const selected = hasStarted && button.dataset.mood === current.mood;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $$('.track').forEach(row => row.classList.toggle('current', playing && Number(row.dataset.id) === current.id));
  updateProgress();
  syncFavorite();
  animateWaveform();
}
function startClock() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!playing || !oscillator) return;
    elapsed = Math.min(current.seconds, Math.max(0, audioContext.currentTime - clockOffset));
    if (elapsed >= current.seconds) return nextTrack();
    updateProgress();
  }, 250);
}
async function beginPlayback() {
  const request = ++playbackRequest;
  playing = true;
  syncPlayer();
  try {
    if (!await startTone(request)) return;
    hasStarted = true;
    recent = [current.id, ...recent.filter(id => id !== current.id)].slice(0, 16);
    save();
    render();
    syncPlayer();
    startClock();
  } catch {
    if (request !== playbackRequest) return;
    playing = false;
    stopTone();
    syncPlayer();
    notify('Audio could not start. Press play to try again.');
  }
}
function play(t) {
  clearInterval(timer);
  stopTone();
  current = t;
  elapsed = 0;
  beginPlayback();
}
function pause() {
  ++playbackRequest;
  if (playing && oscillator) elapsed = Math.min(current.seconds, Math.max(0, audioContext.currentTime - clockOffset));
  playing = false;
  clearInterval(timer);
  stopTone();
  syncPlayer();
}
function nextTrack(direction = 1) {
  play(tracks[(tracks.indexOf(current) + direction + tracks.length) % tracks.length]);
}
function showView(id) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === id));
  $$('[data-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.view === id);
    if (button.dataset.view === id) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (id === 'search') setTimeout(() => $('#searchInput').focus(), 100);
  scrollTo({ top: 0, behavior: motionPreference.matches ? 'instant' : 'smooth' });
  animateWaveform();
}
function enter(name = 'Alex Stone') {
  sessionStorage.setItem('sonora-session', '1');
  localStorage.setItem('sonora-name', name);
  $('#profileName').textContent = name;
  $('.avatar').textContent = name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = greeting + ', ' + name.split(' ')[0] + '.';
  $('#authScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#player').classList.add('show');
  syncPlayer();
}

$('#railToggle').onclick = () => {
  const expanded = $('#sidebar').classList.toggle('expanded');
  $('#railToggle').setAttribute('aria-label', expanded ? 'Collapse navigation' : 'Expand navigation');
  $('#railToggle').setAttribute('aria-expanded', String(expanded));
};
$('#moodGrid').innerHTML = moods.map(([name, emoji]) =>
  '<button class="mood" data-mood="' + name + '" aria-pressed="false" style="--mood-color:' + moodStyle[name][0] + '">' +
  '<span class="emoji" aria-hidden="true">' + emoji + '</span><span class="mood-name">' + name +
  '<small>' + moodStyle[name][2] + '</small></span></button>'
).join('');
$$('[data-auth]').forEach(button => button.onclick = () =>
  $$('.auth-form').forEach(form => form.classList.toggle('hidden', form.dataset.form !== button.dataset.auth))
);
$('#loginForm').onsubmit = event => { event.preventDefault(); enter(localStorage.getItem('sonora-name') || 'Alex Stone'); };
$('#signupForm').onsubmit = event => {
  event.preventDefault(); enter($('#newName').value.trim() || 'Listener'); notify('Your account is ready');
};
$('#forgotForm').onsubmit = event => { event.preventDefault(); $('#resetSuccess').classList.remove('hidden'); };
$('#logout').onclick = () => {
  pause();
  sessionStorage.removeItem('sonora-session');
  $('#app').classList.add('hidden');
  $('#authScreen').classList.remove('hidden');
  $('#player').classList.remove('show');
};
$$('[data-view]').forEach(button => button.onclick = () => showView(button.dataset.view));
$$('.mood').forEach(button => button.onclick = () => play(tracks.find(t => t.mood === button.dataset.mood)));
$('#searchInput').oninput = render;
$('#playMix').onclick = () => play(tracks[0]);
$('#next').onclick = () => nextTrack();
$('#previous').onclick = () => nextTrack(-1);
$('#playToggle').onclick = () => playing ? pause() : beginPlayback();
$('#playerFavorite').onclick = () => toggleFavorite(current);
$('#seek').oninput = event => {
  elapsed = Math.max(0, Math.min(current.seconds, Number(event.target.value)));
  if (audioContext) clockOffset = audioContext.currentTime - elapsed;
  updateProgress();
};
function syncVolume() {
  const percent = Math.round(volume * 100);
  $('#volume').value = percent;
  $('#volume').style.setProperty('--fill', percent + '%');
  $('#volume').setAttribute('aria-valuetext', percent + '%');
  $('#volumeValue').textContent = percent + '%';
}
$('#volume').oninput = event => {
  volume = Number(event.target.value) / 100;
  localStorage.setItem('sonora-volume', event.target.value);
  syncVolume();
  if (gain && audioContext) {
    gain.gain.cancelScheduledValues(audioContext.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(volume * .12, audioContext.currentTime + .05);
  }
};
motionPreference.addEventListener('change', animateWaveform);
document.addEventListener('visibilitychange', animateWaveform);
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
if ('caches' in window) caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
$('#today').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
$('[data-view="home"]').setAttribute('aria-current', 'page');
render();
syncVolume();
syncPlayer();
if (sessionStorage.getItem('sonora-session')) enter(localStorage.getItem('sonora-name') || 'Alex Stone');
