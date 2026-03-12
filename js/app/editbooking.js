// js/app/editbooking.js
Auth.requireAuth();

let currentBooking = null;

document.addEventListener('DOMContentLoaded', () => {
  const sess = Auth.getSession();
  if (!sess || sess.role !== 'admin') { window.location.href = 'index.html'; return; }

  Header.init('editbooking');
  Utils.setupOverlays();

  document.getElementById('searchBtn').addEventListener('click', doSearch);
  document.getElementById('searchQuery').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });
  document.getElementById('btnBackToSearch').addEventListener('click', showSearch);
  document.getElementById('btnCancelEdit').addEventListener('click', showSearch);
});

function showSearch() {
  document.getElementById('searchPanel').style.display = 'block';
  document.getElementById('editPanel').style.display   = 'none';
  currentBooking = null;
}

// ── SEARCH ────────────────────────────────────────
async function doSearch() {
  const q = document.getElementById('searchQuery').value.trim();
  if (!q) { Utils.toast('Enter a search query', 'err'); return; }

  const btn = document.getElementById('searchBtn');
  btn.disabled = true; btn.textContent = 'Searching…';
  const out = document.getElementById('searchResult');
  out.innerHTML = '<div style="color:var(--grey);text-align:center;padding:20px;">Searching…</div>';

  try {
    const res = await API.get({ action: 'getBookingForEdit', query: q });
    if (res.error) {
      out.innerHTML = `<div style="background:#ffebee;border-radius:10px;padding:16px;color:#b71c1c;text-align:center;">${res.error}</div>`;
      return;
    }
    if (res.mode === 'edit') {
      out.innerHTML = '';
      loadEditForm(res.booking);
    } else {
      renderPicker(res.bookings, out);
    }
  } catch(e) {
    Utils.toast(e.message, 'err');
    out.innerHTML = '';
  } finally {
    btn.disabled = false; btn.textContent = 'Search';
  }
}

function renderPicker(bookings, out) {
  out.innerHTML = `
    <div style="font-size:.84rem;color:#78909c;margin-bottom:12px;">${bookings.length} bookings found — select one to edit:</div>
    ${bookings.map(b => `
      <div class="eb-pick-card" onclick='loadEditForm(${JSON.stringify(b).replace(/'/g,"&#39;")})'>
        <div>
          <div class="eb-pick-name">${b['Customer Full Name']||'—'}</div>
          <div class="eb-pick-meta">Plot ${b['Plot No']||'—'} &nbsp;·&nbsp; ${b['Receipt No']||'—'} &nbsp;·&nbsp; ${b['Booking Date']||'—'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:.78rem;background:${b['Status']==='Cancelled'?'#ffcdd2':'#e8f5e9'};color:${b['Status']==='Cancelled'?'#b71c1c':'#2e7d32'};padding:2px 10px;border-radius:20px;font-weight:600;">${b['Status']||'Active'}</span>
          <button class="eb-pick-btn">Edit →</button>
        </div>
      </div>`).join('')}`;
}

// ── LOAD FORM ─────────────────────────────────────
function loadEditForm(booking) {
  currentBooking = booking;
  const isCancelled = (booking['Status']||'') === 'Cancelled';

  // Hero
  document.getElementById('ebHeroName').textContent = booking['Customer Full Name'] || '—';
  document.getElementById('ebHeroSub').textContent  = `Plot ${booking['Plot No']||'—'} · ${booking['Booking Date']||'—'} · ${booking['Area SqFt']||'—'} SqFt`;

  const chips = [
    { label: 'Receipt', val: booking['Receipt No']||'—' },
    { label: 'Manual Rcpt', val: booking['Receipt Number 1']||'—' },
    { label: 'Booked By', val: booking['Booked By Name']||'—' },
  ];
  document.getElementById('ebHeroChips').innerHTML = chips
    .map(c => `<span class="eb-hero-chip">${c.label}: <strong>${c.val}</strong></span>`)
    .join('');

  const badge = document.getElementById('ebStatusBadge');
  badge.textContent = booking['Status'] || 'Active';
  badge.className = 'eb-status-badge' + (isCancelled ? ' cancelled' : '');

  document.getElementById('cancelledBanner').style.display = isCancelled ? 'block' : 'none';
  document.getElementById('saveBtn').style.display         = isCancelled ? 'none'  : 'flex';

  // Customer fields
  document.getElementById('f-customerName').value = booking['Customer Full Name'] || '';
  document.getElementById('f-phone').value        = String(booking['Phone Number']||'').replace(/\.0$/,'');
  document.getElementById('f-aadhaar').value      = booking['Aadhaar Number']    || '';
  document.getElementById('f-address').value      = booking['Address']           || '';
  document.getElementById('f-referredBy').value   = booking['Referred By']       || '';
  document.getElementById('f-remarks').value      = booking['Remarks']           || '';

  // Booking date — show as dd/mm/yyyy read-only
  document.getElementById('f-bookingDate').value  = booking['Booking Date'] || '';

  // Payment mode
  const modeEl  = document.getElementById('f-paymentMode');
  const modeVal = booking['Payment Mode'] || 'Cash';
  [...modeEl.options].forEach(o => { o.selected = o.value === modeVal; });

  document.getElementById('f-paymentRef').value   = booking['Payment Reference'] || '';
  document.getElementById('f-tokenAmount').value  = booking['Token Amount']      || 0;

  // Rates
  document.getElementById('f-br').value = booking['BR'] || '';
  document.getElementById('f-rr').value = booking['RR'] || '';
  document.getElementById('areaDisplay').textContent = booking['Area SqFt'] || '—';

  // Recalc with paid amounts
  recalcAmounts();

  // Last edited info
  const lastBy = booking['Last Edited By'];
  const lastAt = booking['Last Edited At'];
  document.getElementById('lastEditInfo').textContent = lastBy
    ? `Last edited by ${lastBy} on ${lastAt}`
    : '';

  // Disable all inputs if cancelled
  document.querySelectorAll('#editPanel input, #editPanel select').forEach(el => {
    if (el.id === 'searchQuery') return;
    el.disabled = isCancelled;
  });
  // Booking date always readonly
  document.getElementById('f-bookingDate').disabled = false;

  // Show edit panel
  document.getElementById('searchPanel').style.display = 'none';
  document.getElementById('editPanel').style.display   = 'block';

  // Edit log
  renderEditLog();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── RECALC AMOUNTS ────────────────────────────────
function recalcAmounts() {
  if (!currentBooking) return;
  const br   = parseFloat(document.getElementById('f-br').value) || 0;
  const rr   = parseFloat(document.getElementById('f-rr').value) || 0;
  const cr   = Math.max(0, br - rr);
  const sqft = parseFloat(document.getElementById('areaDisplay').textContent) || 0;

  const brAmt = Math.round(br * sqft);
  const rrAmt = Math.round(rr * sqft);
  const crAmt = Math.round(cr * sqft);

  // Paid amounts from booking data
  const brPaid = Number(currentBooking['_brPaid']) || 0;
  const rrPaid = Number(currentBooking['_rrPaid']) || 0;
  const crPaid = Number(currentBooking['_crPaid']) || 0;

  const brBal = brAmt - brPaid;
  const rrBal = rrAmt - rrPaid;
  const crBal = crAmt - crPaid;

  document.getElementById('f-cr').value = cr.toFixed(2);

  // Totals
  document.getElementById('prev-br').textContent = '₹' + Utils.fmtNum(brAmt);
  document.getElementById('prev-rr').textContent = '₹' + Utils.fmtNum(rrAmt);
  document.getElementById('prev-cr').textContent = '₹' + Utils.fmtNum(crAmt);

  // Paid
  document.getElementById('prev-br-paid').textContent = '₹' + Utils.fmtNum(brPaid);
  document.getElementById('prev-rr-paid').textContent = '₹' + Utils.fmtNum(rrPaid);
  document.getElementById('prev-cr-paid').textContent = '₹' + Utils.fmtNum(crPaid);

  // Balance — green if 0 or negative (excess), red if positive (due)
  function setbal(id, wrapId, val) {
    const el   = document.getElementById(id);
    const wrap = document.getElementById(wrapId);
    el.textContent = val < 0 ? '−₹' + Utils.fmtNum(Math.abs(val)) + ' excess' : '₹' + Utils.fmtNum(val);
    wrap.className = 'eb-amt-line ' + (val <= 0 ? 'bal-ok' : 'bal');
  }
  setbal('prev-br-bal', 'prev-br-bal-wrap', brBal);
  setbal('prev-rr-bal', 'prev-rr-bal-wrap', rrBal);
  setbal('prev-cr-bal', 'prev-cr-bal-wrap', crBal);
}

// ── SAVE ──────────────────────────────────────────
async function saveEdit() {
  if (!currentBooking) return;

  const name  = document.getElementById('f-customerName').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const br    = parseFloat(document.getElementById('f-br').value);
  const rr    = parseFloat(document.getElementById('f-rr').value);

  if (!name)                      { Utils.toast('Customer name required', 'err'); return; }
  if (!/^[0-9]{10}$/.test(phone)) { Utils.toast('Phone must be 10 digits', 'err'); return; }
  if (isNaN(br) || br <= 0)       { Utils.toast('Valid BR rate required', 'err'); return; }
  if (isNaN(rr) || rr < 0)        { Utils.toast('Valid RR rate required', 'err'); return; }

  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.innerHTML = '<span>⏳</span> Saving…';

  try {
    const res = await API.post({
      action:       'editBooking',
      receiptNo:    currentBooking['Receipt No'],
      customerName: name,
      phone,
      aadhaar:      document.getElementById('f-aadhaar').value.trim(),
      address:      document.getElementById('f-address').value.trim(),
      referredBy:   document.getElementById('f-referredBy').value.trim(),
      bookingDate:  currentBooking['Booking Date'], // fixed — send original
      paymentMode:  document.getElementById('f-paymentMode').value,
      paymentRef:   document.getElementById('f-paymentRef').value.trim(),
      tokenAmount:  parseFloat(document.getElementById('f-tokenAmount').value) || 0,
      remarks:      document.getElementById('f-remarks').value.trim(),
      br, rr,
    });

    if (res.error) throw new Error(res.error);
    Utils.toast('✅ Booking updated successfully', 'ok');

    // Refresh booking data
    setTimeout(async () => {
      const r = await API.get({ action:'getBookingForEdit', query: currentBooking['Receipt No'] });
      if (r.mode === 'edit') { currentBooking = r.booking; loadEditForm(r.booking); }
    }, 600);

  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>💾</span> Save Changes';
  }
}

// ── EDIT LOG ──────────────────────────────────────
function renderEditLog() {
  const panel   = document.getElementById('logPanel');
  const content = document.getElementById('logContent');
  const b       = currentBooking;
  const lastBy  = b['Last Edited By'];
  const lastAt  = b['Last Edited At'];

  panel.style.display = 'block';

  if (lastBy) {
    content.innerHTML = `
      <div class="eb-log-item">
        <div class="eb-log-dot"></div>
        <div>Last edited by <strong>${lastBy}</strong> on <strong>${lastAt}</strong>.
        Full field-by-field history is in the <strong>Edit Log</strong> sheet in Google Sheets.</div>
      </div>`;
  } else {
    content.innerHTML = `<div style="color:#90a4ae;font-size:.83rem;">No edits recorded yet. History will appear here after the first save.</div>`;
  }
}
