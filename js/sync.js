/**
 * sync.js — Firebase real-time sync for LivePoll
 */
const Sync = {
  db: null,
  sessionId: null,
  auth: null,
  currentUser: null,
  authReady: false,
  _authReadyPromise: null,
  _authListeners: [],

  async init() {
    if (!SYNC_ENABLED) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      this.db = firebase.database();
      this.auth = firebase.auth();

      // Generate fallback anonymous session ID
      this.sessionId = this.sessionId || ('u' + Math.random().toString(36).slice(2, 9));

      // Create a one-time promise that resolves when auth state is first known
      this._authReadyPromise = new Promise(resolve => {
        this.auth.onAuthStateChanged(user => {
          this.currentUser = user;
          if (user) {
            this.sessionId = user.uid;
          } else {
            this.sessionId = 'u' + Math.random().toString(36).slice(2, 9);
          }
          if (!this.authReady) {
            this.authReady = true;
            resolve(user);
          }
          this._authListeners.forEach(cb => cb(user));
        });
      });

      return true;
    } catch (e) {
      console.error('[Sync] init failed:', e);
      return false;
    }
  },

  ref(path) { return this.db ? this.db.ref(path) : null; },

  async get(path) {
    const snap = await this.ref(path).once('value');
    return snap.exists() ? snap.val() : null;
  },

  async set(path, data) { await this.ref(path).set(data); },

  async update(path, data) { await this.ref(path).update(data); },

  on(path, cb) {
    const r = this.ref(path);
    if (r) r.on('value', snap => cb(snap.exists() ? snap.val() : null));
    return () => r && r.off();
  },

  offAll(path) { const r = this.ref(path); if (r) r.off(); },

  serverTime() { return firebase.database.ServerValue.TIMESTAMP; },

  waitForAuth() {
    return this._authReadyPromise || Promise.resolve(null);
  },

  async signInWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await this.auth.signInWithRedirect(provider);
    } catch (e) {
      console.error('[Sync] Google sign-in failed:', e);
      return null;
    }
  },

  async signOut() {
    try {
      await this.auth.signOut();
    } catch (e) {
      console.error('[Sync] sign-out failed:', e);
    }
  },

  onAuth(cb) {
    this._authListeners.push(cb);
    if (this.authReady) cb(this.currentUser);
    return () => {
      this._authListeners = this._authListeners.filter(fn => fn !== cb);
    };
  },

  isLoggedIn() {
    return !!this.currentUser;
  }
};
