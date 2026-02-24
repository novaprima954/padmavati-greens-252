// js/app/status.js
// Auth check runs immediately — before DOMContentLoaded
Auth.requireAuth();

document.addEventListener('DOMContentLoaded', () => {
  Header.init('status');

  document.getElementById('lookupBtn').addEventListener('click', lookupReceipt);
  document.getElementById('receiptInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') lookupReceipt();
  });

  // Pre-fill receipt from URL ?receipt=PG-2025-XXXXXX
  const params = new URLSearchParams(window.location.search);
  const r = params.get('receipt');
  if (r) {
    document.getElementById('receiptInput').value = r;
    lookupReceipt();
  }
});

async function lookupReceipt() {
  const receiptNo = document.getElementById('receiptInput').value.trim();
  if (!receiptNo) { Utils.toast('Enter a receipt number', 'err'); return; }

  const card = document.getElementById('receiptCard');
  const hint = document.getElementById('statusHint');
  card.classList.remove('show');
  card.innerHTML = '<div class="loading-block"><div class="spinner"></div>Looking up…</div>';
  card.classList.add('show');
  hint.style.display = 'none';

  try {
    const data = await API.get({ action: 'getBookingByReceipt', receiptNo });
    if (data.error) throw new Error(data.error);
    renderReceipt(data.booking, data.limited);
  } catch(e) {
    Utils.toast(e.message, 'err');
    card.classList.remove('show');
    hint.style.display = 'block';
  }
}

function renderReceipt(b, limited) {
  const card  = document.getElementById('receiptCard');
  const isCxl = (b['Status'] || '').toLowerCase() === 'cancelled';

  let html = `
    <div class="rc-head">
      <div>
        <div class="rc-tag">Booking Receipt · Padmavati Greens</div>
        <h3>${b['Receipt No']}</h3>
        <p>${b['Booking Date'] || ''}${b['Booking Time'] ? ' at ' + b['Booking Time'] : ''}</p>
      </div>
      <span class="rc-status ${isCxl ? 'cancelled' : ''}">${b['Status'] || 'Active'}</span>
    </div>
    <div class="rc-body">`;

  if (limited) {
    html += `<div class="limited-note">⚠️ Limited view — full details visible only for your own bookings.</div>`;
  }

  if (!limited) {
    html += `
      <div class="rc-section">
        <div class="rc-section-title">Customer</div>
        <div class="rc-grid">
          <div class="rc-field"><label>Full Name</label><span>${b['Customer Full Name']||'—'}</span></div>
          <div class="rc-field"><label>Phone</label><span>${b['Phone Number']||'—'}</span></div>
          <div class="rc-field"><label>Aadhaar</label><span>${b['Aadhaar Number']||'—'}</span></div>
          <div class="rc-field"><label>PAN</label><span>${b['PAN Number']||'—'}</span></div>
        </div>
        ${b['Address'] ? `<div class="rc-field" style="margin-top:8px;"><label>Address</label><span>${b['Address']}</span></div>` : ''}
      </div>`;
  }

  html += `
    <div class="rc-section">
      <div class="rc-section-title">Plot & Payment</div>
      <div class="rc-grid">
        <div class="rc-field"><label>Plot No.</label><span><strong>Plot ${b['Plot No']}</strong></span></div>
        <div class="rc-field"><label>Plot Price</label><span>${b['Plot Price'] ? '₹'+Utils.fmtNum(b['Plot Price']) : '—'}</span></div>
        <div class="rc-field"><label>Payment Mode</label><span>${b['Payment Mode']||'—'}</span></div>
        <div class="rc-field"><label>Payment Ref</label><span>${b['Payment Reference']||'—'}</span></div>
        ${!limited && b['Receipt Number 1'] ? `<div class="rc-field"><label>Receipt No. 1</label><span>${b['Receipt Number 1']}</span></div>` : ''}
        ${!limited && b['Referred By']      ? `<div class="rc-field"><label>Referred By</label><span>${b['Referred By']}</span></div>` : ''}
      </div>
    </div>`;

  if (!limited) {
    html += `
      <div class="rc-section">
        <div class="rc-section-title">Booked By</div>
        <div class="rc-grid">
          <div class="rc-field"><label>Name</label><span>${b['Booked By Name']||'—'}</span></div>
          <div class="rc-field"><label>User ID</label><span>${b['Booked By (User ID)']||'—'}</span></div>
        </div>
      </div>`;
  }

  html += `
      <div class="rc-amount">
        <span class="rc-amount-label">Token Amount Paid</span>
        <span class="rc-amount-value">₹${Utils.fmtNum(b['Token Amount'])}</span>
      </div>
      ${b['Remarks'] ? `<p style="margin-top:12px;font-size:.8rem;color:var(--grey);">📝 ${b['Remarks']}</p>` : ''}
    </div>
    <button class="btn-print" onclick="window.print()">🖨 Print Receipt</button>`;

  card.innerHTML = html;
  card.classList.add('show');
}
