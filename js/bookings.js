// js/app/bookings.js
// Auth check runs immediately — before DOMContentLoaded
Auth.requireAuth();

let allBookings = [];
let bookingCols = [];

document.addEventListener('DOMContentLoaded', () => {
  Header.init('bookings');
  loadBookings();

  document.getElementById('bSearch').addEventListener('input', filterBookings);
  document.getElementById('bStatusFilter').addEventListener('change', filterBookings);
});

async function loadBookings() {
  try {
    const data = await API.get({ action: 'getBookings' });
    if (data.error) throw new Error(data.error);
    allBookings = data.bookings;
    buildColumns(data.role);
    filterBookings();

    const subtitle = data.role === 'admin'
      ? `${allBookings.length} total bookings — full admin view`
      : `${allBookings.length} bookings — limited view`;
    document.getElementById('bookingsSubtitle').textContent = subtitle;
  } catch(e) {
    document.getElementById('bookingsTbody').innerHTML =
      `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--grey);">${e.message}</td></tr>`;
  }
}

function buildColumns(role) {
  const isAdmin = role === 'admin';
  bookingCols = isAdmin
    ? ['Receipt No','Booking Date','Booking Time','Booked By Name',
       'Customer Full Name','Phone Number','Plot No','Plot Price',
       'Token Amount','Payment Mode','Receipt Number 1',
       'Referred By','Status','Action']
    : ['Receipt No','Booking Date','Booking Time',
       'Booked By Name','Plot No','Token Amount',
       'Payment Mode','Status'];

  document.getElementById('bookingsThead').innerHTML =
    '<tr>' + bookingCols.map(c => `<th>${c === 'Action' ? '' : c}</th>`).join('') + '</tr>';
}

function filterBookings() {
  const q  = document.getElementById('bSearch').value.toLowerCase();
  const st = document.getElementById('bStatusFilter').value;

  const filtered = allBookings.filter(b => {
    const matchQ  = !q  || Object.values(b).some(v => String(v).toLowerCase().includes(q));
    const matchSt = !st || (b['Status'] || '') === st;
    return matchQ && matchSt;
  });

  document.getElementById('bCount').textContent = filtered.length + ' records';
  renderTable(filtered);
}

function renderTable(rows) {
  const tbody = document.getElementById('bookingsTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${bookingCols.length}" class="empty-state" style="padding:40px;text-align:center;color:var(--grey);">No bookings found</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(b => {
    return '<tr>' + bookingCols.map(col => {
      if (col === 'Action') {
        return b['Status'] !== 'Cancelled'
          ? `<td><button class="btn-cancel" data-receipt="${b['Receipt No']}">Cancel</button></td>`
          : '<td>—</td>';
      }
      if (col === 'Status') {
        return `<td>${Utils.statusBadge(b['Status'] || 'Active')}</td>`;
      }
      if (col === 'Token Amount' || col === 'Plot Price') {
        return `<td>${b[col] ? '₹'+Utils.fmtNum(b[col]) : '—'}</td>`;
      }
      if (col === 'Receipt No') {
        return `<td><a href="status.html?receipt=${b[col]}" style="color:var(--forest);font-weight:600;text-decoration:underline;">${b[col]||'—'}</a></td>`;
      }
      const val = b[col];
      return `<td>${val !== undefined && val !== '' ? val : '—'}</td>`;
    }).join('') + '</tr>';
  }).join('');

  // Cancel button events
  tbody.querySelectorAll('.btn-cancel').forEach(btn => {
    btn.addEventListener('click', () => cancelBooking(btn.dataset.receipt));
  });
}

async function cancelBooking(receiptNo) {
  const reason = prompt(`Reason for cancelling ${receiptNo} (required):`);
  if (!reason || !reason.trim()) return;
  if (!confirm(`Cancel booking ${receiptNo}?\nPlot will be released back to Available.`)) return;

  try {
    const res = await API.post({ action: 'cancelBooking', receiptNo, reason: reason.trim() });
    if (res.error) throw new Error(res.error);
    Utils.toast('Booking cancelled. Plot released.', 'ok');
    await loadBookings();
  } catch(e) {
    Utils.toast(e.message, 'err');
  }
}
