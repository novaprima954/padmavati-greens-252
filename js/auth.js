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

  // Call on every protected page.
  // Hides the body immediately — shows it only if session is valid.
  // This prevents any flash of page content before redirect to login.
  function requireAuth() {
    // Hide body instantly before any render
    document.documentElement.style.visibility = 'hidden';

    const s = getSession();
    if (!s || !s.token) {
      window.location.replace('login.html');
      return null;
    }

    // Session valid — show page
    document.documentElement.style.visibility = '';
    return s;
  }

  // Call on login.html — redirects away if already logged in
  function redirectIfLoggedIn() {
    const s = getSession();
    if (s && s.token) {
      window.location.replace('index.html');
    }
  }

  async function login(username, password) {
    const res = await API.get({ action: 'login', username, password }, true);
    if (res.error) throw new Error(res.error);
    saveSession(res);
    return res;
  }

  function logout() {
    clearSession();
    window.location.replace('login.html');
  }

  return { getSession, saveSession, clearSession, requireAuth, redirectIfLoggedIn, login, logout };
})();
