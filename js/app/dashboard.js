// js/app/dashboard.js
const _session = Auth.requireAuth();

document.addEventListener('DOMContentLoaded', () => {
  if (!_session) return;
  Header.init('index');

  // Hide revenue card for sales role
  if (_session.role !== 'admin') {
    const rc = document.getElementById('revenueCard');
    if (rc) rc.style.display = 'none';
  }

  loadStats();
  loadRecent();
});

async function loadStats() {
  try {
    const data = await API.get({ action: 'getStats' });
    if (!data.success) return;
    const s = data.stats;
    document.getElementById('s-total').textContent  = s.total;
    document.getElementById('s-avail').textContent  = s.available;
    document.getElementById('s-booked').textContent = s.booked;
    document.getElementById('s-res').textContent    = s.reserved;
    if (_session.role === 'admin') {
      document.getElementById('s-rev').textContent = Utils.fmtCurrency(s.totalRevenue);
    }
  } catch(e) {}
}

async function loadRecent() {
  const tbody = document.getElementById('recentBody');
  try {
    const data = await API.get({ action: 'getBookings' });
    if (data.error) throw new Error(data.error);
    const bookings = data.bookings.slice(-8).reverse();
    if (!bookings.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No bookings yet</td></tr>';
      return;
    }
    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td><strong>${b['Receipt No']||'—'}</strong></td>
        <td>${b['Booking Date']||'—'}</td>
        <td>Plot ${b['Plot No']||'—'}</td>

        <td>${b['Payment Mode']||'—'}</td>
        <td>${Utils.statusBadge(b['Status']||'Active')}</td>
      </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--grey);">${e.message}</td></tr>`;
  }
}
