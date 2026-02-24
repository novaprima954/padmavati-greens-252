// ============================================================
// js/auth.js — Login, logout, session. Loaded on every page.
// ============================================================

const Auth = (() => {
  const KEY = 'pg_session';

  function getSession() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch(e) { return null; }
  }

  function saveSession(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function clearSession() {
    localStorage.removeItem(KEY);
  }

  // Call on every protected page — redirects to login if no session
  function requireAuth() {
    const s = getSession();
    if (!s || !s.token) {
      window.location.href = 'login.html';
      return null;
    }
    return s;
  }

  // Call on login page — redirects to index if already logged in
  function redirectIfLoggedIn() {
    const s = getSession();
    if (s && s.token) window.location.href = 'index.html';
  }

  async function login(username, password) {
    const res = await API.get({ action: 'login', username, password }, true);
    if (res.error) throw new Error(res.error);
    saveSession(res);
    return res;
  }

  function logout() {
    clearSession();
    window.location.href = 'login.html';
  }

  return { getSession, saveSession, clearSession, requireAuth, redirectIfLoggedIn, login, logout };
})();
