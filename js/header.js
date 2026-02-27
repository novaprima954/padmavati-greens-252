// ============================================================
// js/header.js — Builds and injects header + mobile nav
// ============================================================

const Header = (() => {

  const NAV_ITEMS = [
    { label: '🏠 Home',      href: 'index.html',    page: 'index',    roles: ['admin','sales'] },
    { label: '📍 Plots',     href: 'plots.html',    page: 'plots',    roles: ['admin','sales'] },
    { label: '📝 Book',      href: 'booking.html',  page: 'booking',  roles: ['admin','sales'] },
    { label: '🔍 Status',    href: 'status.html',   page: 'status',   roles: ['admin','sales'] },
    { label: '📋 Bookings',  href: 'bookings.html', page: 'bookings', roles: ['admin','sales'] },
    { label: '📊 Reports',   href: 'reports.html',  page: 'reports',  roles: ['admin'] },
  ];

  function init(currentPage) {
    const session = Auth.requireAuth();
    if (!session) return;

    const navHTML = NAV_ITEMS
      .filter(item => item.roles.includes(session.role))
      .map(item => `
      <a href="${item.href}" class="nav-btn${currentPage === item.page ? ' active' : ''}">
        ${item.label}
      </a>`).join('');

    const html = `
      <header>
        <div class="header-inner">
          <a href="index.html" class="brand">
            <div class="brand-icon">🌿</div>
            <div>
              <div class="brand-name">${CONFIG.PROJECT_NAME}</div>
              <div class="brand-sub">${CONFIG.LAYOUT}</div>
            </div>
          </a>

          <nav id="mainNav" class="main-nav">${navHTML}</nav>

          <div class="header-right">
            <div class="user-pill">
              <div class="user-avatar" id="hUserAvatar">
                ${(session.name || session.username).charAt(0).toUpperCase()}
              </div>
              <div class="user-info">
                <div class="user-name" id="hUserName">${session.name || session.username}</div>
                <div class="user-role">${session.role}</div>
              </div>
            </div>
            <button class="btn-logout" id="logoutBtn" title="Logout">⎋ Logout</button>
            <button class="hamburger" id="hamburger" aria-label="Menu">☰</button>
          </div>
        </div>

        <!-- Mobile nav drawer -->
        <div class="mobile-nav" id="mobileNav">
          ${navHTML}
          <div class="mobile-user">
            <span>${session.name || session.username}</span>
            <span class="role-tag">${session.role}</span>
          </div>
          <button class="mobile-logout" id="mobileLogout">⎋ Logout</button>
        </div>
      </header>`;

    // Inject before first child of body
    document.body.insertAdjacentHTML('afterbegin', html);

    // Events
    document.getElementById('logoutBtn').addEventListener('click', () => {
      if (confirm('Log out?')) Auth.logout();
    });
    document.getElementById('hamburger').addEventListener('click', () => {
      document.getElementById('mobileNav').classList.toggle('open');
      document.getElementById('hamburger').textContent =
        document.getElementById('mobileNav').classList.contains('open') ? '✕' : '☰';
    });
    document.getElementById('mobileLogout').addEventListener('click', () => {
      if (confirm('Log out?')) Auth.logout();
    });

    // Close mobile nav on outside click
    document.addEventListener('click', e => {
      const nav  = document.getElementById('mobileNav');
      const hamb = document.getElementById('hamburger');
      if (nav && hamb && !nav.contains(e.target) && !hamb.contains(e.target)) {
        nav.classList.remove('open');
        hamb.textContent = '☰';
      }
    });
  }

  return { init };
})();
