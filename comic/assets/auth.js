// Google 登入＋雲端閱讀進度（Firebase）。所有頁面共用。
// 沒登入時進度照舊存在瀏覽器；登入後同步到 Firestore 的 progress/{uid}。
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDDhOA65iXn-v3Z7oQ6xUbtki0bYNIOLmA',
  authDomain: 'xitian.firebaseapp.com',
  projectId: 'xitian',
  storageBucket: 'xitian.firebasestorage.app',
  messagingSenderId: '705617601689',
  appId: '1:705617601689:web:664f37f96f45c64ad50408',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
auth.languageCode = 'zh-TW';
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const X = window.X;
const h = X.h;
let user = null;

// ── 登入區塊 ───────────────────────────────
const box = h('div', { class: 'authbox' });
const reader = document.body.classList.contains('reader');
if (reader) {
  const bar = document.querySelector('.bar');
  bar.insertBefore(box, bar.querySelector('.prog'));
} else {
  document.body.append(box);
}

async function login() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = e && e.code;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/cancelled-popup-request') {
      await signInWithRedirect(auth, provider);
    } else if (code !== 'auth/popup-closed-by-user') {
      alert('登入失敗，請再試一次。');
    }
  }
}

function renderBox() {
  if (!user) {
    box.replaceChildren(h('button', { class: 'auth-btn', type: 'button', text: '用 Google 登入', onclick: login }));
    return;
  }
  const name = user.displayName || user.email || '已登入';
  box.replaceChildren(
    user.photoURL
      ? h('img', { class: 'auth-avatar', src: user.photoURL, alt: name, title: name, width: 28, height: 28, referrerpolicy: 'no-referrer' })
      : h('span', { class: 'auth-name', text: name }),
    h('button', { class: 'auth-btn', type: 'button', text: '登出', onclick: () => signOut(auth) })
  );
}
renderBox();
getRedirectResult(auth).catch(() => {});

// ── 進度同步 ───────────────────────────────
const local = () => X.store.get('last', null);

async function pullCloud() {
  try {
    const snap = await getDoc(doc(db, 'progress', user.uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    return { v: d.v, p: d.p, t: d.updatedAt ? d.updatedAt.toMillis() : 0 };
  } catch {
    return null;
  }
}

async function push(last) {
  if (!user || !last) return;
  try {
    await setDoc(doc(db, 'progress', user.uid), { v: last.v, p: last.p, updatedAt: serverTimestamp() });
  } catch {}
}

let timer;
addEventListener('xitian:progress', (e) => {
  clearTimeout(timer);
  timer = setTimeout(() => push(e.detail), 2000);
});
addEventListener('pagehide', () => {
  if (timer) { clearTimeout(timer); push(local()); }
});

onAuthStateChanged(auth, async (u) => {
  user = u;
  renderBox();
  if (!u) return;
  const cloud = await pullCloud();
  const mine = local();
  if (cloud && cloud.v && cloud.p && (!mine || !mine.t || cloud.t > mine.t)) {
    // 雲端比較新：採用雲端
    X.store.set('last', cloud);
    const progress = X.store.get('progress', {});
    progress[cloud.v] = Math.max(progress[cloud.v] || 0, cloud.p);
    X.store.set('progress', progress);
    if (X.refreshResume) X.refreshResume();
  } else if (mine && mine.v && (!cloud || (mine.t || 0) > cloud.t)) {
    push(mine);
  }
});
