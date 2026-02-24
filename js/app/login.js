// js/app/login.js
document.addEventListener('DOMContentLoaded', () => {
  Auth.redirectIfLoggedIn();

  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');

  async function doLogin() {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    errEl.style.display = 'none';

    if (!username || !password) {
      errEl.textContent   = 'Please enter username and password.';
      errEl.style.display = 'block';
      return;
    }

    btn.textContent = 'Logging in…';
    btn.disabled    = true;

    try {
      await Auth.login(username, password);
      window.location.href = 'index.html';
    } catch(e) {
      errEl.textContent   = e.message;
      errEl.style.display = 'block';
    } finally {
      btn.textContent = 'Login';
      btn.disabled    = false;
    }
  }

  btn.addEventListener('click', doLogin);
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
});
