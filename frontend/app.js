import { currentUserId, deletePlaylist, ensureUserDocument, initializeCloud, listenCloudData, recordMood, removeFavorite, resetPassword, savePlaylist, savePreferences, setFavorite, signIn, signOutUser, signUp, stopCloudListeners, updateUserProfile } from './firebase-client.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const moods=[['Happy','😊'],['Sad','😢'],['Calm','😌'],['Angry','😠'],['Stressed','😫'],['Energetic','🤩'],['Tired','😴'],['Neutral','😐']];
let tracks = [];
let searchTracks = [];
let catalogRequest = 0, searchRequest = 0, moodRequest = 0, searchTimer;
let activeMood = null;
const audiusMoods = {
  Happy: ['Upbeat', 'Excited', 'Easygoing'],
  Sad: ['Melancholy', 'Sentimental', 'Yearning'],
  Calm: ['Peaceful', 'Tender', 'Easygoing'],
  Angry: ['Aggressive', 'Fiery', 'Defiant', 'Rowdy'],
  Stressed: ['Brooding', 'Serious', 'Gritty'],
  Energetic: ['Energizing', 'Empowering', 'Stirring', 'Excited'],
  Tired: ['Tender', 'Peaceful', 'Sensual'],
  Neutral: ['Cool', 'Sophisticated', 'Easygoing']
};

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
let favorites = new Set();
let favoriteTracks = [];
let favoriteDocIds = new Map();
let recent = [];
let playlists = [];
let moodHistory = [];
let wellnessData = [];
let cloudUser = null;
let authEpoch = 0;
let preferencesLoaded = false;
let restoredSong = null;
let current = null, playing = false, hasStarted = false, elapsed = 0;
let timer, audioElement;
let audioContext, analyser, beatFrame;
const audioSamples = new Uint8Array(256);
const waveformSamples = new Uint8Array(512);
let beatHue = 185, beatBaseline = .12, lastBeatAt = 0;
let lightingMode = 'dj', lightingIntensity = 90, silentFrames = 0, lastEstimatedBeat = -1;
let playbackRequest = 0;
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
  if (cloudUser) savePreferences({ recent, region: $('#regionSelect').value, selectedSong: selectedSong() }).catch(() => notify('Cloud sync is unavailable. Changes may appear after reconnecting.'));
}
function selectedSong() {
  if (!current) return null;
  const { id, title, artist, album, mood, seconds, time, artwork, source, bpm } = current;
  return { id, title, artist, album, mood, seconds, time, artwork: typeof artwork === 'string' ? artwork : '', source: source || 'Audius', bpm: Number(bpm) || 0 };
}
function selectTrack(track) {
  current = track;
  if (cloudUser && preferencesLoaded) savePreferences({ selectedSong: selectedSong() }).catch(() => notify('Selected song could not sync to Firestore.'));
}
const safe = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
function favoriteLabel(t) {
  return (favorites.has(t.id) ? 'Remove ' + t.title + ' from' : 'Add ' + t.title + ' to') + ' favorites';
}
function row(t) {
  return '<article class="track ' + (current?.id === t.id && playing ? 'current' : '') + '" data-id="' + safe(t.id) + '">' +
    '<button class="track-play" aria-label="Play ' + safe(t.title) + ' by ' + safe(t.artist) + '">' +
    '<span class="cover track-cover" style="--cover:' + safe(t.cover) + '">' + trackIcon + '</span>' +
    '<span class="track-name"><b>' + safe(t.title) + '</b><small>' + safe(t.artist) + '</small></span></button>' +
    '<span class="meta album">' + safe(t.album) + '</span><span class="meta">' + safe(t.mood) + ' · ' + safe(t.time) + '</span>' +
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
    const t = list.find(track => String(track.id) === el.dataset.id);
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
  const found = query ? searchTracks : tracks;
  const available = [...new Map([...tracks, ...searchTracks, ...favoriteTracks, ...(current ? [current] : [])].map(t => [t.id, t])).values()];
  const liked = available.filter(t => favorites.has(t.id));
  const history = recent.map(id => available.find(t => t.id === id)).filter(Boolean);
  paint('#homeTracks', tracks);
  paint('#searchTracks', found);
  paint('#likedTracks', liked);
  paint('#recentTracks', history);
  $('#searchEmpty').classList.toggle('hidden', !!found.length || !!query);
  $('#likedEmpty').classList.toggle('hidden', !!liked.length);
  $('#recentEmpty').classList.toggle('hidden', !!history.length);
  $('#profileFavoriteCount').textContent = favorites.size;
  $('#profileRecentCount').textContent = recent.length;
}
function syncFavorite() {
  const button = $('#playerFavorite');
  button.innerHTML = heartIcon;
  button.disabled = !current;
  if (!current) { button.setAttribute('aria-label', 'Favorite current track'); return; }
  button.classList.toggle('on', favorites.has(current.id));
  button.setAttribute('aria-label', favoriteLabel(current));
  button.setAttribute('aria-pressed', String(favorites.has(current.id)));
}
function toggleFavorite(t) {
  if (!t || !cloudUser) return;
  const wasFavorite = favorites.has(t.id);
  wasFavorite ? favorites.delete(t.id) : favorites.add(t.id);
  render();
  syncFavorite();
  (wasFavorite ? removeFavorite(favoriteDocIds.get(t.id) || t.id) : setFavorite(t)).catch(() => {
    wasFavorite ? favorites.add(t.id) : favorites.delete(t.id);
    render(); syncFavorite(); notify('Favorite could not sync. Check your connection.');
  });
  notify(wasFavorite ? 'Removed from favorites' : 'Added to favorites');
}
function prepareAudiusTrack(track, index = 0) {
  const colors = ['#16c79a,#5967ff', '#315be8,#6942a8', '#ee3c42,#891d51', '#ff8c24,#f74d78'];
  const seconds = Number(track.seconds ?? track.duration) || 0;
  return {
    ...track,
    id: String(track.id),
    artist: track.artist || track.user?.name || track.user?.handle || 'Audius artist',
    album: track.album || track.album_name || track.genre || 'Audius',
    seconds,
    time: track.time || formatTime(seconds),
    mood: track.mood || track.genre || 'Other',
    cover: track.artwork ? `url('${typeof track.artwork === 'string' ? track.artwork : track.artwork['480x480'] || track.artwork['150x150']}')` : `linear-gradient(135deg,${colors[index % colors.length]})`,
    streamUrl: track.streamUrl || `https://api.audius.co/v1/tracks/${encodeURIComponent(track.id)}/stream?app_name=MoodTunes`
  };
}
async function fetchAudius(region, query = '', moods = []) {
  const params = new URLSearchParams({ region });
  if (query) params.set('q', query);
  moods.forEach(mood => params.append('mood', mood));
  try {
    const response = await fetch('/api/audius/tracks?' + params);
    if (response.ok && response.headers.get('content-type')?.includes('application/json')) return (await response.json()).tracks || [];
  } catch { /* Static hosting has no API route. */ }
  const direct = new URL(query || region !== 'global' || moods.length ? 'https://api.audius.co/v1/tracks/search' : 'https://api.audius.co/v1/tracks/trending');
  direct.searchParams.set('app_name', 'MoodTunes');
  direct.searchParams.set('limit', '30');
  if (query || region !== 'global') direct.searchParams.set('query', query || { india: 'India', latin: 'Latin', africa: 'Afrobeats', asia: 'K-Pop', europe: 'European' }[region]);
  moods.forEach(mood => direct.searchParams.append('mood', mood));
  const response = await fetch(direct);
  if (!response.ok) throw new Error('Audius request failed');
  return (await response.json()).data || [];
}
async function loadAudius(region = 'global') {
  ++moodRequest;
  activeMood = null;
  const request = ++catalogRequest;
  const status = $('#catalogStatus');
  status.textContent = 'Loading Audius music…';
  try {
    const loaded = (await fetchAudius(region)).map(prepareAudiusTrack);
    if (request !== catalogRequest) return;
    pause();
    tracks = loaded;
    selectTrack((restoredSong && (tracks.find(track => track.id === restoredSong.id) || restoredSong)) || tracks[0] || null);
    restoredSong = null;
    elapsed = 0;
    render();
    syncPlayer();
    status.textContent = tracks.length ? `${tracks.length} tracks from Audius · ${region === 'global' ? 'Global trending' : $('#regionSelect').selectedOptions[0].text}` : 'No tracks found for this region.';
  } catch {
    if (request !== catalogRequest) return;
    pause();
    tracks = [];
    selectTrack(null);
    render();
    syncPlayer();
    status.textContent = 'Audius is unavailable. Please try again later.';
  }
}
async function playMood(mood) {
  const request = ++moodRequest;
  ++catalogRequest;
  const region = $('#regionSelect').value;
  const regionName = $('#regionSelect').selectedOptions[0].text;
  const status = $('#catalogStatus');
  status.textContent = `Finding Telugu and Tamil ${mood.toLowerCase()} music first…`;
  try {
    const results = await Promise.allSettled([
      fetchAudius(region, 'Telugu', audiusMoods[mood]),
      fetchAudius(region, 'Tamil', audiusMoods[mood]),
      fetchAudius(region, '', audiusMoods[mood])
    ]);
    const ordered = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    const loaded = [...new Map(ordered
      .map(prepareAudiusTrack)
      .filter(track => audiusMoods[mood].includes(track.mood))
      .map(track => [track.id, track])).values()];
    if (request !== moodRequest || region !== $('#regionSelect').value) return;
    if (!loaded.length) {
      status.textContent = `No ${mood.toLowerCase()} tracks found in ${regionName}. Try another mood or region.`;
      return;
    }
    pause();
    activeMood = mood;
    if (cloudUser) recordMood(mood).catch(() => notify('Mood could not sync.'));
    tracks = loaded;
    selectTrack(tracks[0]);
    elapsed = 0;
    render();
    syncPlayer();
    status.textContent = `${tracks.length} ${mood.toLowerCase()} tracks · Telugu and Tamil first, then ${regionName}`;
    play(current, true);
  } catch {
    if (request === moodRequest) status.textContent = 'Audius is unavailable. Please try again later.';
  }
}
async function searchAudius(query) {
  const request = ++searchRequest;
  const status = $('#searchStatus');
  if (!query) {
    searchTracks = [];
    status.textContent = 'Showing current Audius tracks';
    render();
    return;
  }
  status.textContent = 'Searching Audius…';
  try {
    const results = (await fetchAudius('global', query)).map(prepareAudiusTrack);
    if (request !== searchRequest) return;
    searchTracks = results;
    status.textContent = results.length ? `${results.length} results for “${query}”` : `No results for “${query}”`;
    render();
  } catch {
    if (request !== searchRequest) return;
    searchTracks = [];
    status.textContent = 'Search is unavailable. Please try again later.';
    render();
  }
}
function stopTone() {
  cancelAnimationFrame(beatFrame);
  beatFrame = 0;
  $('#player').style.setProperty('--beat', '0');
  $('#player').classList.remove('beat-reactive');
  $('#lightingStatus').textContent = lightingMode === 'off' ? 'Player lights are off.' : 'Start a song to see the lights.';
  $$('.visualizer i').forEach(bar => bar.style.removeProperty('transform'));
  analyser = null;
  if (!audioElement) return;
  audioElement.pause();
  audioElement.removeAttribute('src');
  audioElement.load();
  audioElement = null;
}
function startLights() {
  cancelAnimationFrame(beatFrame);
  beatFrame = 0;
  if (!playing || lightingMode === 'off') {
    $('#player').classList.remove('beat-reactive');
    $('#lightingStatus').textContent = lightingMode === 'off' ? 'Player lights are off.' : 'Start a song to see the lights.';
    return;
  }
  silentFrames = 0;
  lastEstimatedBeat = -1;
  $('#player').classList.add('beat-reactive');
  animateBeat();
}
function syncLightingSettings() {
  $('#lightingMode').value = lightingMode;
  $('#lightingIntensity').value = lightingIntensity;
  $('#lightingIntensityValue').textContent = lightingIntensity + '%';
  if (playing) {
    if (lightingMode === 'off') {
      cancelAnimationFrame(beatFrame);
      beatFrame = 0;
      $('#player').classList.remove('beat-reactive');
      syncPlayer();
      $('#lightingStatus').textContent = 'Player lights are off.';
    } else startLights();
  }
}
function animateBeat() {
  if (!playing || lightingMode === 'off' || !audioElement) { beatFrame = 0; return; }
  let level = 0, hit = false;
  if (analyser) {
    analyser.getByteFrequencyData(audioSamples);
    analyser.getByteTimeDomainData(waveformSamples);
    let bass = 0, power = 0;
    for (let i = 2; i < 32; i++) bass += audioSamples[i];
    for (const sample of waveformSamples) power += ((sample - 128) / 128) ** 2;
    const rms = Math.sqrt(power / waveformSamples.length);
    // Keep the full signal for onset detection. Clamping here made loud tracks
    // a constant 1, so their adaptive threshold could never detect another beat.
    level = Math.max(bass / (30 * 255) * 2.2, rms * 3.2);
    silentFrames = level < .015 ? silentFrames + 1 : 0;
    if (silentFrames > 90 && audioElement.currentTime > 1.5) analyser = null;
    beatBaseline = beatBaseline * .97 + level * .03;
    const now = performance.now();
    hit = level > Math.max(.12, beatBaseline * (lightingMode === 'dj' ? 1.12 : 1.25)) && now - lastBeatAt > (lightingMode === 'dj' ? 130 : 200);
    if (hit) lastBeatAt = now;
  }
  if (!analyser) {
    const bpm = Number(current?.bpm);
    const tempo = bpm >= 50 && bpm <= 220 ? bpm : 120;
    const pulsePosition = audioElement.currentTime * tempo / 60 * (lightingMode === 'dj' ? 2 : 1);
    const index = Math.floor(pulsePosition);
    const phase = pulsePosition - index;
    hit = index !== lastEstimatedBeat;
    lastEstimatedBeat = index;
    level = .16 + Math.exp(-phase * 6) * .8;
  }
  if (hit) beatHue = (beatHue + (lightingMode === 'dj' ? 83 : 53)) % 360;
  const energy = Math.min(1, level * 1.35 + (hit ? .28 : 0)) * lightingIntensity / 100;
  const hue = (beatHue + Math.round(level * 68)) % 360;
  const player = $('#player');
  player.style.setProperty('--track-accent', `hsl(${hue} 100% 65%)`);
  player.style.setProperty('--track-secondary', `hsl(${(hue + 105) % 360} 100% 68%)`);
  player.style.setProperty('--beat', energy.toFixed(2));
  player.style.setProperty('--glow-size', `${Math.round(8 + energy * 90)}px`);
  player.style.setProperty('--light-opacity', (.08 + energy * .88).toFixed(2));
  $('#lightingStatus').textContent = analyser ? 'Audio reactive lighting is active.' : 'Rhythm estimate is active because this stream cannot be analysed.';
  $$('.visualizer i').forEach((bar, index) => {
    const value = analyser ? audioSamples[3 + index * 9] / 255 : level * (index % 2 ? .8 : 1);
    bar.style.transform = `scaleY(${Math.max(.25, value * 2.3).toFixed(2)})`;
  });
  beatFrame = requestAnimationFrame(animateBeat);
}
async function startTone(request) {
  if (!current?.streamUrl) throw new Error('No stream available');
  const streamUrl = current.streamUrl;
  const isDirectStream = !streamUrl.startsWith('/');
  let retrying = false;
  async function openStream(withAnalysis) {
    if (withAnalysis) {
      audioContext ||= new AudioContext();
      await audioContext.resume();
    }
    if (request !== playbackRequest) return false;
    const audio = new Audio();
    if (withAnalysis && isDirectStream) audio.crossOrigin = 'anonymous';
    audio.src = streamUrl;
    audioElement = audio;
    analyser = null;
    if (withAnalysis) {
      const node = audioContext.createAnalyser();
      node.fftSize = 512;
      node.smoothingTimeConstant = .15;
      const source = audioContext.createMediaElementSource(audio);
      source.connect(node);
      node.connect(audioContext.destination);
      analyser = node;
    }
    audio.volume = volume;
    audio.currentTime = Math.min(elapsed, Math.max(0, current.seconds - 1));
    audio.onended = () => request === playbackRequest && nextTrack();
    audio.onerror = () => {
      if (request !== playbackRequest || !playing) return;
      if (withAnalysis && isDirectStream && !retrying) {
        setTimeout(async () => {
          if (retrying || request !== playbackRequest || audioElement !== audio) return;
          retrying = true;
          stopTone();
          try { if (await openStream(false)) { startClock(); notify('Using estimated rhythm for this stream.'); } }
          catch { pause(); notify('This Audius track could not be streamed.'); }
        }, 100);
      } else if (!withAnalysis || !retrying) { pause(); notify('This Audius track could not be streamed.'); }
    };
    await audio.play();
    if (request !== playbackRequest || !playing) { audio.pause(); return false; }
    beatBaseline = .12;
    lastBeatAt = 0;
    startLights();
    return true;
  }
  try { return await openStream(typeof AudioContext !== 'undefined'); }
  catch (error) {
    if (!isDirectStream || retrying || request !== playbackRequest) throw error;
    retrying = true;
    stopTone();
    const started = await openStream(false);
    if (started) notify('Using estimated rhythm for this stream.');
    return started;
  }
}
function updateProgress() {
  $('#elapsed').textContent = formatTime(elapsed);
  const seek = $('#seek');
  seek.disabled = !current;
  seek.max = current?.seconds || 0;
  seek.value = Math.floor(elapsed);
  seek.style.setProperty('--fill', current?.seconds ? elapsed / current.seconds * 100 + '%' : '0%');
  seek.setAttribute('aria-valuetext', formatTime(elapsed) + ' of ' + (current?.time || '0:00'));
}
function syncPlayer() {
  $('#playToggle').disabled = !current;
  $('#previous').disabled = !current;
  $('#next').disabled = !current;
  $('#player').classList.toggle('playing', playing);
  $('#playToggle').setAttribute('aria-label', playing ? 'Pause' : 'Play');
  $('#playToggle').title = playing ? 'Pause' : 'Play';
  $('#playerStatus').textContent = playing ? 'NOW PLAYING' : hasStarted ? 'PAUSED' : 'READY TO PLAY';
  $('#trackTitle').textContent = current?.title || 'No track selected';
  $('#trackArtist').textContent = current?.artist || 'Browse Audius music';
  $('#cover').style.setProperty('--cover', current?.cover || 'linear-gradient(135deg,#315be8,#6942a8)');
  renderCloudPanels();
  $('#duration').textContent = current?.time || '0:00';
  if (!$('#player').classList.contains('beat-reactive')) {
    $('#player').style.setProperty('--track-accent', (moodStyle[current?.mood] || moodStyle.Neutral)[0]);
    $('#player').style.setProperty('--track-secondary', (moodStyle[current?.mood] || moodStyle.Neutral)[1]);
  }
  $$('.mood').forEach(button => {
    const selected = button.dataset.mood === activeMood;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $$('.track').forEach(row => row.classList.toggle('current', playing && row.dataset.id === String(current?.id)));
  updateProgress();
  syncFavorite();
}
function startClock() {
  clearInterval(timer);
  timer = setInterval(() => {
    if (!playing || !audioElement) return;
    elapsed = audioElement.currentTime;
    if (elapsed >= current.seconds) return nextTrack();
    updateProgress();
  }, 250);
}
async function beginPlayback() {
  if (!current) return;
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
function play(t, keepMood = false) {
  if (!t) return;
  if (!keepMood) activeMood = null;
  clearInterval(timer);
  stopTone();
  selectTrack(t);
  elapsed = 0;
  beginPlayback();
}
function pause() {
  ++playbackRequest;
  if (playing && audioElement) elapsed = audioElement.currentTime;
  playing = false;
  clearInterval(timer);
  stopTone();
  syncPlayer();
}
function nextTrack(direction = 1) {
  const queue = searchTracks.includes(current) ? searchTracks : tracks;
  if (!queue.length) return;
  play(queue[(queue.indexOf(current) + direction + queue.length) % queue.length], !!activeMood);
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
}
function renderCloudPanels() {
  $('#playlistEmpty').classList.toggle('hidden', !!playlists.length);
  $('#playlistList').innerHTML = playlists.map(item => {
    const songs = Array.isArray(item.tracks) ? item.tracks : Array.isArray(item.trackIds) ? item.trackIds : [];
    const names = songs.slice(0, 8).map(song => typeof song === 'object' ? song.title || song.name || song.id : song);
    const ids = Array.isArray(item.trackIds) ? item.trackIds.map(String) : Array.isArray(item.tracks) ? item.tracks.map(song => String(typeof song === 'object' ? song.id || song.trackId : song)) : [];
    return `<article class="playlist-item" data-id="${safe(item.id)}"><h2>${safe(item.name || item.title || 'Untitled playlist')}</h2><p>${songs.length} tracks${names.length ? ' · ' + names.map(safe).join(', ') : ''}</p><div class="playlist-actions"><button class="back" data-action="track" type="button" ${current ? '' : 'disabled'}>${ids.includes(current?.id) ? 'Remove current song' : 'Add current song'}</button><button class="back" data-action="rename" type="button">Rename</button><button class="back" data-action="delete" type="button">Delete</button></div></article>`;
  }).join('');
  $('#playlistList').querySelectorAll('.playlist-item button').forEach(button => button.onclick = async () => {
    const item = playlists.find(entry => entry.id === button.closest('.playlist-item').dataset.id);
    if (!item) return;
    try {
      if (button.dataset.action === 'track' && current) {
        if (Array.isArray(item.tracks)) {
          const ids = item.tracks.map(song => String(typeof song === 'object' ? song.id || song.trackId : song));
          const tracks = ids.includes(current.id) ? item.tracks.filter((song, index) => ids[index] !== current.id) : [...item.tracks, typeof item.tracks[0] === 'object' ? selectedSong() : current.id];
          await savePlaylist(item.id, { tracks });
        } else {
          const ids = Array.isArray(item.trackIds) ? item.trackIds.map(String) : [];
          await savePlaylist(item.id, { trackIds: ids.includes(current.id) ? ids.filter(id => id !== current.id) : [...ids, current.id] });
        }
      } else if (button.dataset.action === 'rename') {
        const name = prompt('Playlist name', item.name || item.title || '');
        if (name?.trim()) await savePlaylist(item.id, { name: name.trim() });
      } else if (confirm(`Delete ${item.name || item.title || 'this playlist'}?`)) await deletePlaylist(item.id);
    } catch { notify('Playlist change could not sync. Check your connection.'); }
  });
  const history = moodHistory.slice().sort((a, b) => (b.createdAt?.seconds || b.timestamp?.seconds || 0) - (a.createdAt?.seconds || a.timestamp?.seconds || 0));
  $('#moodHistoryEmpty').classList.toggle('hidden', !!history.length);
  $('#moodHistoryList').innerHTML = history.slice(0, 12).map(item => `<div class="data-item">${safe(item.mood || item.name || 'Mood recorded')}</div>`).join('');
  $('#wellnessEmpty').classList.toggle('hidden', !!wellnessData.length);
  $('#wellnessList').innerHTML = wellnessData.slice(0, 12).map(item => `<div class="data-item">${safe(item.title || item.type || item.name || 'Wellness entry')}${item.value != null ? ': ' + safe(item.value) : ''}</div>`).join('');
}
function applyCloudData(key, data) {
  if (key === 'profile' && data) {
    enter(data.name || cloudUser.displayName || 'Listener', data.email || cloudUser.email || '');
    $('#editPhoto').value = data.photoUrl || '';
    if (data.photoUrl) {
      for (const target of [$('.avatar'), $('#profileAvatarLarge')]) {
        const image = document.createElement('img');
        image.src = data.photoUrl;
        image.alt = '';
        image.onerror = () => image.remove();
        target.append(image);
      }
    }
    const joined = data.createdAt?.toDate?.();
    if (joined) $('#memberSince').textContent = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(joined);
  } else if (key === 'favorites') {
    favoriteDocIds = new Map(data.map(item => [String(item.trackId || item.track?.id || item.id), item.id]));
    favoriteTracks = data.map(item => prepareAudiusTrack({ ...item.track, ...item, id: item.trackId || item.track?.id || item.id }));
    favorites = new Set(favoriteTracks.map(item => item.id));
    render(); syncFavorite();
  } else if (key === 'playlists') { playlists = data; renderCloudPanels(); }
  else if (key === 'moodHistory') { moodHistory = data; renderCloudPanels(); }
  else if (key === 'wellnessData') { wellnessData = data; renderCloudPanels(); }
  else if (key === 'preferences') {
    preferencesLoaded = true;
    recent = Array.isArray(data.recent) ? data.recent : [];
    if (data.region && $('#regionSelect').querySelector(`option[value="${data.region}"]`) && $('#regionSelect').value !== data.region) {
      $('#regionSelect').value = data.region;
      if (cloudUser) loadAudius(data.region);
    }
    if (Number.isFinite(Number(data.volume))) volume = Math.max(0, Math.min(100, Number(data.volume))) / 100;
    if (audioElement) audioElement.volume = volume;
    const mode = ['off', 'beat', 'dj'].includes(data.lightingMode) ? data.lightingMode : 'dj';
    const intensity = Number.isFinite(Number(data.lightingIntensity)) ? Math.max(0, Math.min(100, Number(data.lightingIntensity))) : 90;
    if (mode !== lightingMode || intensity !== lightingIntensity) { lightingMode = mode; lightingIntensity = intensity; syncLightingSettings(); }
    if (data.selectedSong?.id && !playing && current?.id !== String(data.selectedSong.id)) {
      // A settings echo must not replace a working audio URL with a different
      // stream for the same song (in particular, the local analysis proxy).
      restoredSong = [...tracks, ...searchTracks, ...favoriteTracks].find(track => track.id === String(data.selectedSong.id)) || prepareAudiusTrack(data.selectedSong);
      current = restoredSong;
      syncPlayer();
    }
    render(); syncVolume();
  }
}
function enter(name = 'Alex Stone', email = 'alex@moodtunes.app') {
  $('#profileName').textContent = name;
  const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
  $('.avatar').textContent = initials;
  $('#profileAvatarLarge').textContent = initials;
  $('#profileDisplayName').textContent = name;
  $('#profileEmail').textContent = email;
  $('#editName').value = name;
  $('#editEmail').value = email;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('#greeting').textContent = greeting + ', ' + name.split(' ')[0] + '.';
  $('#authScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#player').classList.add('show');
  syncPlayer();
}

function authMessage(error) {
  const code = error?.code || '';
  if (code.includes('invalid-credential')) return 'Email or password is incorrect.';
  if (code.includes('email-already-in-use')) return 'An account already uses that email.';
  if (code.includes('weak-password')) return 'Use a stronger password (at least 6 characters).';
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('user-not-found')) return 'No account was found for that email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a little while and try again.';
  if (code.includes('network-request-failed')) return 'Check your internet connection and try again.';
  if (code.includes('quota-exceeded')) return 'Firebase has reached its email sending limit. Try again later or contact the app administrator.';
  if (code.includes('operation-not-allowed')) return 'Email/password authentication is disabled in Firebase. Enable it in Firebase Authentication settings.';
  if (code.includes('unauthorized-continue-uri') || code.includes('invalid-continue-uri')) return 'The password reset link domain is not authorized in Firebase Authentication settings.';
  if (code.includes('invalid-api-key') || code.includes('app-not-authorized')) return 'This app is not authorized to use the Firebase project. Check the Firebase app configuration.';
  if (code.includes('unauthorized-domain')) return 'This website domain is not authorized for Firebase sign-in.';
  return 'Firebase could not complete that request. Please try again.';
}

async function restoreUser(user) {
  ++authEpoch;
  stopCloudListeners();
  preferencesLoaded = false;
  cloudUser = user;
  if (!user) {
    pause(); favorites = new Set(); favoriteTracks = []; favoriteDocIds = new Map(); recent = []; playlists = []; moodHistory = []; wellnessData = []; current = null; restoredSong = null;
    $('#app').classList.add('hidden');
    $('#authScreen').classList.remove('hidden');
    $('#player').classList.remove('show');
    $('#authStatus').textContent = '';
    return;
  }
  const epoch = authEpoch;
  $('#authStatus').textContent = 'Loading your account…';
  try {
    let profile;
    try { profile = await ensureUserDocument(); }
    catch { profile = { name: user.displayName || user.email?.split('@')[0] || 'Listener', email: user.email || '' }; $('#syncStatus').textContent = 'Offline · waiting to sync'; }
    if (epoch !== authEpoch) return;
    const uid = currentUserId();
    if (uid !== user.uid) return;
    enter(profile.name || user.displayName || 'Listener', profile.email || user.email || '');
    listenCloudData((key, data, fromCache) => {
      if (epoch !== authEpoch) return;
      applyCloudData(key, data);
      $('#syncStatus').textContent = fromCache ? 'Offline · showing cached data' : 'Synced with Firebase';
    }, (key, error) => { if (key === 'preferences') preferencesLoaded = true; $('#syncStatus').textContent = `Could not load ${key}. Check your connection.`; notify(error.message || 'Firebase sync failed.'); });
    await loadAudius($('#regionSelect').value);
    $('#authStatus').textContent = '';
  } catch (error) {
    $('#authStatus').textContent = 'Could not load your account. Check your connection and retry sign-in.';
    notify(error.message || 'Firebase is unavailable.');
  }
}

$('#moodGrid').innerHTML = moods.map(([name, emoji]) =>
  '<button class="mood" data-mood="' + name + '" aria-pressed="false" style="--mood-color:' + moodStyle[name][0] + '">' +
  '<span class="emoji" aria-hidden="true">' + emoji + '</span><span class="mood-name">' + name +
  '<small>' + moodStyle[name][2] + '</small></span></button>'
).join('');
$$('[data-auth]').forEach(button => button.onclick = () => {
  $$('.auth-form').forEach(form => form.classList.toggle('hidden', form.dataset.form !== button.dataset.auth));
  $('#resetSuccess').classList.add('hidden');
  $('#authStatus').textContent = '';
});
$('#loginForm').onsubmit = async event => {
  event.preventDefault();
  const [email, password] = event.currentTarget.querySelectorAll('input');
  try { await signIn(email.value.trim(), password.value); } catch (error) { notify(authMessage(error)); }
};
$('#signupForm').onsubmit = async event => {
  event.preventDefault();
  const inputs = event.currentTarget.querySelectorAll('input');
  try { await signUp(inputs[0].value.trim(), inputs[1].value.trim(), inputs[2].value); notify('Your account is ready'); }
  catch (error) { notify(authMessage(error)); }
};
$('#forgotForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.querySelector('input').value.trim();
  const button = form.querySelector('button[type="submit"]');
  const success = $('#resetSuccess');
  success.classList.add('hidden');
  success.classList.remove('error');
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    await resetPassword(email);
    success.textContent = `If an account exists for ${email}, a password reset link has been sent. Check your inbox and spam folder.`;
    success.classList.remove('hidden');
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      success.textContent = `If an account exists for ${email}, a password reset link has been sent. Check your inbox and spam folder.`;
      success.classList.remove('hidden');
      return;
    }
    success.textContent = authMessage(error);
    success.classList.add('error');
    success.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'Send reset link';
  }
};
$('#logout').onclick = async () => {
  pause();
  try { await signOutUser(); } catch (error) { notify(authMessage(error)); }
};
$('#editProfile').onclick = () => { $('#profileForm').classList.remove('hidden'); $('#editProfile').classList.add('hidden'); $('#editName').focus(); };
$('#cancelProfileEdit').onclick = () => { $('#profileForm').classList.add('hidden'); $('#editProfile').classList.remove('hidden'); $('#editName').value = $('#profileDisplayName').textContent; $('#editEmail').value = $('#profileEmail').textContent; };
$('#profileForm').onsubmit = async event => {
  event.preventDefault();
  const name = $('#editName').value.trim();
  const email = $('#editEmail').value.trim();
  const photoUrl = $('#editPhoto').value.trim();
  if (!name || !email || !cloudUser) return;
  const button = $('#profileForm button[type="submit"]');
  button.disabled = true;
  try {
    await updateUserProfile(name, email, photoUrl);
    enter(name, email);
    $('#profileForm').classList.add('hidden');
    $('#editProfile').classList.remove('hidden');
    notify('Profile updated');
  } catch (error) {
    notify(error?.code === 'auth/requires-recent-login' ? 'Sign out and sign in again before changing your email.' : authMessage(error));
  } finally { button.disabled = false; }
};
$$('[data-view]').forEach(button => button.onclick = () => showView(button.dataset.view));
$$('.mood').forEach(button => button.onclick = () => playMood(button.dataset.mood));
$('#searchForm').onsubmit = event => { event.preventDefault(); clearTimeout(searchTimer); searchAudius($('#searchInput').value.trim()); };
$('#searchInput').oninput = event => {
  clearTimeout(searchTimer);
  ++searchRequest;
  const query = event.target.value.trim();
  if (!query) searchAudius('');
  else searchTimer = setTimeout(() => searchAudius(query), 350);
};
$('#regionSelect').onchange = event => { savePreferences({ region: event.target.value }).catch(() => notify('Region preference could not sync.')); loadAudius(event.target.value); };
$('#playlistForm').onsubmit = async event => {
  event.preventDefault();
  const input = $('#playlistName');
  const name = input.value.trim();
  if (!name) return;
  try { await savePlaylist(null, { name, trackIds: [] }); input.value = ''; }
  catch { notify('Playlist could not sync. Check your connection.'); }
};
$('#playMix').onclick = () => tracks.length ? play(tracks[0]) : notify('Music is unavailable right now.');
$('#next').onclick = () => nextTrack();
$('#previous').onclick = () => nextTrack(-1);
$('#playToggle').onclick = () => playing ? pause() : beginPlayback();
$('#playerFavorite').onclick = () => toggleFavorite(current);
$('#seek').oninput = event => {
  if (!current) return;
  elapsed = Math.max(0, Math.min(current.seconds, Number(event.target.value)));
  if (audioElement) audioElement.currentTime = elapsed;
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
  if (cloudUser) savePreferences({ volume: Number(event.target.value) }).catch(() => notify('Volume preference could not sync.'));
  syncVolume();
  if (audioElement) audioElement.volume = volume;
};
$('#lightingMode').onchange = event => {
  lightingMode = event.target.value;
  syncLightingSettings();
  if (cloudUser) savePreferences({ lightingMode }).catch(() => notify('Lighting settings could not sync.'));
};
$('#lightingIntensity').oninput = event => {
  lightingIntensity = Number(event.target.value);
  $('#lightingIntensityValue').textContent = lightingIntensity + '%';
};
$('#lightingIntensity').onchange = () => {
  if (cloudUser) savePreferences({ lightingIntensity }).catch(() => notify('Lighting settings could not sync.'));
};
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(registrations => registrations.forEach(registration => registration.unregister()));
if ('caches' in window) caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
window.addEventListener('offline', () => { if (cloudUser) $('#syncStatus').textContent = 'Offline · showing available data'; });
window.addEventListener('online', () => { if (cloudUser) { $('#syncStatus').textContent = 'Reconnecting to Firebase…'; ensureUserDocument().catch(() => notify('Could not reconnect to Firestore.')); } });
$('#today').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
$('[data-view="home"]').setAttribute('aria-current', 'page');
render();
syncVolume();
syncLightingSettings();
syncPlayer();
initializeCloud(restoreUser).catch(() => notify('Firebase could not start. Check the project configuration.'));
