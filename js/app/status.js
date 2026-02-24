// js/app/status.js
Auth.requireAuth();

document.addEventListener('DOMContentLoaded', () => {
  Header.init('status');

  const searchType  = document.getElementById('searchType');
  const input       = document.getElementById('receiptInput');
  const lookupBtn   = document.getElementById('lookupBtn');

  // Update placeholder based on search type
  const placeholders = {
    receipt: 'e.g. PG-2025-123456',
    name:    'e.g. Ramesh Sharma',
    phone:   'e.g. 9876543210'
  };
  searchType.addEventListener('change', () => {
    input.placeholder = placeholders[searchType.value] || '';
    input.value = '';
  });

  lookupBtn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // Pre-fill from URL
  const params = new URLSearchParams(window.location.search);
  const r = params.get('receipt');
  if (r) { input.value = r; doSearch(); }
});

async function doSearch() {
  const type  = document.getElementById('searchType').value;
  const query = document.getElementById('receiptInput').value.trim();
  if (!query) { Utils.toast('Please enter a search value', 'err'); return; }

  const card    = document.getElementById('receiptCard');
  const multi   = document.getElementById('multiResults');
  const hint    = document.getElementById('statusHint');

  card.classList.remove('show');
  multi.style.display = 'none';
  hint.style.display  = 'none';

  if (type === 'receipt') {
    // Direct receipt lookup
    card.innerHTML = '<div class="loading-block"><div class="spinner"></div>Looking up…</div>';
    card.classList.add('show');
    try {
      const data = await API.get({ action: 'getBookingByReceipt', receiptNo: query });
      if (data.error) throw new Error(data.error);
      renderReceipt(data.booking, data.limited);
    } catch(e) {
      Utils.toast(e.message, 'err');
      card.classList.remove('show');
      hint.style.display = 'block';
    }
  } else {
    // Name or phone — search all bookings
    multi.innerHTML = '<div class="loading-block"><div class="spinner"></div>Searching…</div>';
    multi.style.display = 'block';
    try {
      const data = await API.get({ action: 'getBookings' });
      if (data.error) throw new Error(data.error);

      const q = query.toLowerCase();
      const matches = data.bookings.filter(b => {
        if (type === 'name')  return (b['Customer Full Name']||'').toLowerCase().includes(q);
        if (type === 'phone') return (b['Phone Number']||'').includes(q);
        return false;
      });

      if (!matches.length) {
        multi.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><p>No bookings found for "${query}"</p></div>`;
        return;
      }

      if (matches.length === 1) {
        // Single match — show full receipt directly
        multi.style.display = 'none';
        try {
          const d2 = await API.get({ action: 'getBookingByReceipt', receiptNo: matches[0]['Receipt No'] });
          if (!d2.error) { renderReceipt(d2.booking, d2.limited); return; }
        } catch(e) {}
      }

      // Multiple matches — show list
      multi.innerHTML = `
        <div style="font-size:.82rem;color:var(--grey);margin-bottom:10px;">${matches.length} booking${matches.length>1?'s':''} found — tap to view</div>
        ${matches.map(b => `
          <div class="multi-result-item" data-receipt="${b['Receipt No']}">
            <div class="mri-left">
              <div class="mri-name">${b['Customer Full Name'] || '—'}</div>
              <div class="mri-sub">Plot ${b['Plot No']} · ${b['Booking Date']||''}</div>
            </div>
            <div class="mri-right">
              <div class="mri-receipt">${b['Receipt No']}</div>
              <span class="badge ${b['Status']||'Active'}">${b['Status']||'Active'}</span>
            </div>
          </div>`).join('')}`;

      multi.querySelectorAll('.multi-result-item').forEach(item => {
        item.addEventListener('click', async () => {
          multi.style.display = 'none';
          card.innerHTML = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';
          card.classList.add('show');
          try {
            const d = await API.get({ action:'getBookingByReceipt', receiptNo: item.dataset.receipt });
            if (d.error) throw new Error(d.error);
            renderReceipt(d.booking, d.limited);
          } catch(er) { Utils.toast(er.message,'err'); card.classList.remove('show'); }
        });
      });

    } catch(e) {
      Utils.toast(e.message, 'err');
      multi.style.display = 'none';
      hint.style.display  = 'block';
    }
  }
}

function renderReceipt(b, limited) {
  const card  = document.getElementById('receiptCard');
  const isCxl = (b['Status']||'').toLowerCase() === 'cancelled';

  let html = `
    <div class="rc-head">
      <div>
        <div class="rc-tag">Booking Receipt · Padmavati Greens</div>
        <h3>${b['Receipt No']}</h3>
        <p>${b['Booking Date']||''}${b['Booking Time'] ? ' at '+b['Booking Time'] : ''}</p>
      </div>
      <span class="rc-status ${isCxl?'cancelled':''}">${b['Status']||'Active'}</span>
    </div>
    <div class="rc-body">`;

  if (limited) html += `<div class="limited-note">⚠️ Limited view — full details visible only for your own bookings.</div>`;

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
