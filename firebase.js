// ════════════════════════════════════════
//   FIREBASE CONFIG
// ════════════════════════════════════════
// Setup (one-time):
// 1. console.firebase.google.com → naya project banao (ya existing use karo)
// 2. Project Settings (⚙️) → "Your apps" → Web app add karo (</> icon)
// 3. Jo config object milega, neeche paste karo
// 4. Authentication → Sign-in method → Google → Enable karo
// 5. Firestore Database → Create database (production mode)

const firebaseConfig = {
  apiKey: "AIzaSyDCGgZIECdXTo5z_yr3Ud-W0Fkn5sWUotE",
  authDomain: "lailackashmircstays.firebaseapp.com",
  projectId: "lailackashmircstays",
  storageBucket: "lailackashmircstays.firebasestorage.app",
  messagingSenderId: "535019456430",
  appId: "1:535019456430:web:7bac9e77eab3221415aa3f",
  measurementId: "G-WVBLQ0H2GQ"
};

let auth, db, googleProvider;

if (typeof firebase !== 'undefined') {
  firebase.initializeApp(firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
  googleProvider = new firebase.auth.GoogleAuthProvider();
} else {
  console.warn('Firebase SDK load nahi hua — index.html mein CDN <script> tags check karo (network/adblock issue ho sakta hai).');
}

// Firestore collection references — index.html admin panel inhi ko
// localStorage ki jagah use karega (Step 3 mein wire hoga)
const refs = db ? {
  rooms: db.collection('rooms'),
  packages: db.collection('packages'),
  bookings: db.collection('bookings'),
  photos: db.collection('photos'),
  users: db.collection('users'),
  siteContent: db.collection('site_content') // About Us, hero bg, property info
} : null;
// NOTE: top-level const/let in a plain <script> does NOT attach to `window`
// (only `var`/function declarations do). index.html checks `window.refs` to
// decide Firestore-vs-localStorage, so we attach it explicitly here:
window.refs = refs;

// ════════════════════════════════════════
//   GOOGLE SIGN-IN
// ════════════════════════════════════════
let currentUser = null;

function signInWithGoogle(){
  if(!auth) return Promise.reject(new Error('Firebase not configured yet'));
  return auth.signInWithPopup(googleProvider).then(result => {
    currentUser = result.user;
    return handleUserAfterLogin(result.user).then(() => result.user);
  }).catch(err => {
    console.error('signInWithGoogle error:', err);
    throw new Error(friendlyAuthError(err));
  });
}

// ════════════════════════════════════════
//   EMAIL / PASSWORD SIGN-IN  (used by login.html)
// ════════════════════════════════════════
function signUpWithEmail(name, email, password){
  if(!auth) return Promise.reject(new Error('Firebase not configured yet'));
  return auth.createUserWithEmailAndPassword(email, password).then(result => {
    currentUser = result.user;
    return result.user.updateProfile({ displayName: name })
      .then(() => handleUserAfterLogin(result.user))
      .then(() => result.user.sendEmailVerification())
      .then(() => result.user);
  }).catch(err => {
    console.error('signUpWithEmail error:', err);
    throw new Error(friendlyAuthError(err));
  });
}

function signInWithEmail(email, password){
  if(!auth) return Promise.reject(new Error('Firebase not configured yet'));
  return auth.signInWithEmailAndPassword(email, password).then(result => {
    currentUser = result.user;
    return result.user;
  }).catch(err => {
    console.error('signInWithEmail error:', err);
    throw new Error(friendlyAuthError(err));
  });
}

// ════════════════════════════════════════
//   FRIENDLY ERROR MESSAGES
// ════════════════════════════════════════
function friendlyAuthError(err){
  const map = {
    'auth/email-already-in-use': 'Yeh email already registered hai — sign in try karo.',
    'auth/invalid-email': 'Email address valid nahi hai.',
    'auth/weak-password': 'Password kam se kam 6 characters ka hona chahiye.',
    'auth/user-not-found': 'Account nahi mila — email check karo ya sign up karo.',
    'auth/wrong-password': 'Password galat hai.',
    'auth/invalid-credential': 'Email ya password galat hai.',
    'auth/too-many-requests': 'Bahut zyada attempts ho gaye — kuch der baad try karo.',
    'auth/network-request-failed': 'Network error — internet connection check karo.',
    'auth/popup-closed-by-user': 'Sign-in popup band ho gaya.'
  };
  return map[err.code] || (err.message || 'Kuch galat ho gaya, dobara try karo.');
}

function resetPassword(email){
  if(!auth) return Promise.reject(new Error('Firebase not configured yet'));
  return auth.sendPasswordResetEmail(email).catch(err => {
    console.error('resetPassword error:', err);
    throw new Error(friendlyAuthError(err));
  });
}

function signOutUser(){
  if(!auth) return Promise.resolve();
  return auth.signOut();
}

if(auth){
  auth.onAuthStateChanged(user => {
    currentUser = user;
    if(typeof onAuthChanged === 'function') onAuthChanged(user); // hook defined below, updates nav UI
  });
}

// ════════════════════════════════════════
//   REFERRAL SYSTEM
// ════════════════════════════════════════
// Flow: existing user shares link  yoursite.com/?ref=THEIR_CODE
// → visitor's browser remembers the code (even before signing in)
// → on their FIRST Google sign-in, we save referredBy + bump referrer's count

function captureReferralFromURL(){
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  if(ref) localStorage.setItem('pending_referral', ref);
}
captureReferralFromURL();

function getMyReferralCode(user){
  return user.uid.slice(0, 8); // short, shareable code
}

function getMyReferralLink(){
  if(!currentUser) return null;
  return `${window.location.origin}${window.location.pathname}?ref=${getMyReferralCode(currentUser)}`;
}

async function handleUserAfterLogin(user){
  if(!refs) return;
  const userRef = refs.users.doc(user.uid);
  const snap = await userRef.get();
  if(snap.exists) return; // not first login, nothing to do

  const pendingRef = localStorage.getItem('pending_referral');
  await userRef.set({
    name: user.displayName,
    email: user.email,
    photo: user.photoURL,
    referralCode: getMyReferralCode(user),
    referredBy: pendingRef || null,
    referralCount: 0,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  if(pendingRef){
    const q = await refs.users.where('referralCode', '==', pendingRef).limit(1).get();
    if(!q.empty){
      await refs.users.doc(q.docs[0].id).update({
        referralCount: firebase.firestore.FieldValue.increment(1)
      });
    }
    localStorage.removeItem('pending_referral');
  }
}

// ════════════════════════════════════════
//   ABOUT US CONTENT  (admin-editable, Step 3 mein form milega)
// ════════════════════════════════════════
async function getAboutContent(){
  if(!refs) return null;
  const doc = await refs.siteContent.doc('about').get();
  return doc.exists ? doc.data() : null;
}

async function saveAboutContent(data){
  if(!refs) throw new Error('Firebase not configured yet');
  await refs.siteContent.doc('about').set(data, { merge: true });
}

// ════════════════════════════════════════
//   NAV UI HOOKS (sign-in button + referral dropdown)
// ════════════════════════════════════════
function onAuthChanged(user){
  const authBtn = document.getElementById('authBtn');
  const nadName = document.getElementById('nadName');
  if(!authBtn) return;
  if(user){
    authBtn.textContent = '👤 ' + (user.displayName ? user.displayName.split(' ')[0] : 'Account');
    if(nadName) nadName.textContent = user.displayName || user.email;
  } else {
    authBtn.textContent = 'Sign in';
  }
}

function handleAuthClick(){
  if(currentUser){
    document.getElementById('navAuthDrop').classList.toggle('open');
  } else {
    signInWithGoogle().catch(err => {
      console.error(err);
      if(typeof showToast === 'function') showToast('❌ Sign-in failed');
    });
  }
}

function handleSignOut(){
  signOutUser().then(() => {
    document.getElementById('navAuthDrop')?.classList.remove('open');
    if(typeof showToast === 'function') showToast('👋 Signed out');
  });
}

function copyReferralLink(){
  const link = getMyReferralLink();
  if(!link) return;
  navigator.clipboard.writeText(link).then(() => {
    if(typeof showToast === 'function') showToast('🔗 Referral link copied!');
  });
  document.getElementById('navAuthDrop')?.classList.remove('open');
}

// Close the referral dropdown when clicking outside it
document.addEventListener('click', (e) => {
  const navAuth = document.getElementById('navAuth');
  const drop = document.getElementById('navAuthDrop');
  if(navAuth && drop && !navAuth.contains(e.target)) drop.classList.remove('open');
});
