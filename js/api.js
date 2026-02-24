// ============================================================
// js/api.js — All API calls. Handles auth errors globally.
// ============================================================

const API = (() => {

  async function get(params, skipAuth = false) {
    const session = Auth.getSession();
    if (!skipAuth && session) params.token = session.token;

    const url = CONFIG.API_URL + '?' + new URLSearchParams(params);
    const res  = await fetch(url);
    const data = await res.json();

    if (!skipAuth && data.error === 'Unauthorized. Please login again.') {
      Auth.logout();
      return data;
    }
    return data;
  }

  async function post(body) {
    const session = Auth.getSession();
    if (session) body.token = session.token;

    const res  = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();

    if (data.error === 'Unauthorized. Please login again.') {
      Auth.logout();
      return data;
    }
    return data;
  }

  return { get, post };
})();
