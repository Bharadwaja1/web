import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateEmail,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, deleteDoc, doc, getDoc, getFirestore, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const fallbackConfig = {
  apiKey: 'AIzaSyAxxyjIZdKRtB9nJcHdAnF0YOoX3afpJpI',
  authDomain: 'frist-app-d0cd5.firebaseapp.com',
  projectId: 'frist-app-d0cd5',
  storageBucket: 'frist-app-d0cd5.firebasestorage.app',
  messagingSenderId: '728418975336',
  appId: '1:728418975336:web:22c195d42111324ea385dd',
  measurementId: 'G-FQ7ZGP955B'
};

let auth;
let db;
let listeners = [];
const userId = () => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to sync your data.');
  return user.uid;
};
const userDoc = () => doc(db, 'users', userId());
const childDoc = (group, id) => doc(db, 'users', userId(), group, String(id));

export async function initializeCloud(onUserChanged) {
  let config = fallbackConfig;
  try {
    const response = await fetch('/api/firebase-config');
    if (response.ok) config = await response.json();
  } catch { /* Firebase Hosting uses the public web configuration above. */ }

  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  isSupported().then(supported => supported && getAnalytics(app)).catch(() => {});
  onAuthStateChanged(auth, onUserChanged);
}

export const signIn = (email, password) => signInWithEmailAndPassword(auth, email, password);
export async function getJwtToken(forceRefresh = false) {
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to access your authentication token.');
  return user.getIdToken(forceRefresh);
}

export async function signUp(name, email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: name });
  await ensureUserDocument();
  await setDoc(userDoc(), { name, email, updatedAt: serverTimestamp() }, { merge: true });
  return credential;
}

export const resetPassword = email => sendPasswordResetEmail(auth, email);
export const signOutUser = () => signOut(auth);

export function currentUserId() { return userId(); }

export async function ensureUserDocument() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to sync your data.');
  const reference = userDoc();
  const existing = await getDoc(reference);
  const profile = existing.exists() ? existing.data() : {};
  const missing = {};
  if (!Object.hasOwn(profile, 'name')) missing.name = user.displayName || user.email?.split('@')[0] || 'Listener';
  if (!Object.hasOwn(profile, 'email')) missing.email = user.email || '';
  if (!Object.hasOwn(profile, 'photoUrl')) missing.photoUrl = user.photoURL || '';
  if (!Object.hasOwn(profile, 'createdAt')) missing.createdAt = user.metadata.creationTime ? Timestamp.fromDate(new Date(user.metadata.creationTime)) : serverTimestamp();
  if (Object.keys(missing).length) {
    await setDoc(reference, { ...missing, updatedAt: serverTimestamp() }, { merge: true });
    return { ...profile, ...missing };
  }
  return profile;
}

export function stopCloudListeners() {
  listeners.forEach(unsubscribe => unsubscribe());
  listeners = [];
}

export function listenCloudData(onData, onError) {
  stopCloudListeners();
  const uid = userId();
  const watch = (key, reference, transform) => listeners.push(onSnapshot(reference, { includeMetadataChanges: true }, snapshot => {
    if (auth.currentUser?.uid !== uid) return;
    onData(key, transform(snapshot), snapshot.metadata.fromCache);
  }, error => onError(key, error)));
  watch('profile', userDoc(), snapshot => snapshot.exists() ? snapshot.data() : null);
  for (const group of ['favorites', 'playlists', 'moodHistory', 'wellnessData']) {
    watch(group, collection(db, 'users', uid, group), snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
  }
  watch('preferences', childDoc('preferences', 'settings'), snapshot => snapshot.exists() ? snapshot.data() : {});
}

export async function setFavorite(track) {
  await setDoc(childDoc('favorites', track.id), { trackId: String(track.id), title: track.title || 'Untitled', artist: track.artist || '', album: track.album || '', mood: track.mood || '', seconds: track.seconds || 0, artwork: typeof track.artwork === 'string' ? track.artwork : '', source: track.source || 'Audius', updatedAt: serverTimestamp() }, { merge: true });
}
export const removeFavorite = id => deleteDoc(childDoc('favorites', id));
export async function savePlaylist(id, data) {
  const reference = id ? childDoc('playlists', id) : doc(collection(db, 'users', userId(), 'playlists'));
  await setDoc(reference, { ...data, updatedAt: serverTimestamp(), ...(!id ? { createdAt: serverTimestamp() } : {}) }, { merge: true });
  return reference.id;
}
export const deletePlaylist = id => deleteDoc(childDoc('playlists', id));
export async function recordMood(mood) {
  const reference = doc(collection(db, 'users', userId(), 'moodHistory'));
  await setDoc(reference, { mood, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function savePreferences(data) {
  await setDoc(childDoc('preferences', 'settings'), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

export async function updateUserProfile(name, email, photoUrl) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in to edit your profile.');
  if (email !== user.email) await updateEmail(user, email);
  if (name !== user.displayName || photoUrl !== (user.photoURL || '')) await updateProfile(user, { displayName: name, photoURL: photoUrl });
  await setDoc(userDoc(), { name, email, photoUrl, updatedAt: serverTimestamp() }, { merge: true });
}
