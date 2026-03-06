// js/app/editbooking.js
Auth.requireAuth();

let currentBooking = null;

document.addEventListener('DOMContentLoaded', () => {
  // Admin only
  const sess = Auth.getSession();
  if (!sess || sess.role !== 'admin') {
    window.location.href = 'index.html';
    return;
  }

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
  document.getElementById('logPanel').style.display    = 'none';
  currentBooking = null;
}

// ── SEARCH ────────────────────────────────────────
async function doSearch() {
  const q = document.getElementById('searchQuery').value.trim();
  if (!q) { Utils.toast('Enter a search query', 'err'); return; }

  const btn = document.getElementById('searchBtn');
  btn.disabled = true; btn.textContent = 'Searching…';
  const out = document.getElementById('searchResult');
  out.innerHTML = '';

  try {
    const res = await API.get({ action:'getBookingForEdit', query: q });
    if (res.error) { out.innerHTML = `<div class="empty-state"><p>${res.error}</p></div>`; return; }

    if (res.mode === 'edit') {
      loadEditForm(res.booking);
    } else {
      // Multiple matches — show picker
      out.innerHTML = `
        <div class="ledger-pick-title">${res.bookings.length} bookings match — select one to edit:</div>
        <table class="data-table" style="margin-top:10px;">
          <thead><tr><th>Receipt No</th><th>Customer</th><th>Phone</th><th>Plot</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${res.bookings.map(b => `
              <tr>
                <td>${b['Receipt No']||'—'}</td>
                <td>${b['Customer Full Name']||'—'}</td>
                <td>${b['Phone Number']||'—'}</td>
                <td>Plot ${b['Plot No']||'—'}</td>
                <td>${b['Booking Date']||'—'}</td>
                <td><span class="status-badge" style="background:${b['Status']==='Cancelled'?'#ffcdd2':'#e8f5e9'};color:${b['Status']==='Cancelled'?'#b71c1c':'#2e7d32'}">${b['Status']||'Active'}</span></td>
                <td><button class="btn-report-search" style="padding:4px 12px;font-size:.8rem;"
                    onclick='loadEditForm(${JSON.stringify(b).replace(/'/g,"&apos;")})'>Edit</button></td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }
  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Search';
  }
}

// ── LOAD FORM ─────────────────────────────────────
function loadEditForm(booking) {
  currentBooking = booking;

  // Locked fields
  document.getElementById('lPlotNo').textContent         = booking['Plot No']          || '—';
  document.getElementById('lReceiptNo').textContent      = booking['Receipt Number 1'] || '—';
  document.getElementById('lBookingReceipt').textContent = booking['Receipt No']       || '—';
  document.getElementById('lStatus').textContent         = booking['Status']           || '—';

  // Locked if Cancelled
  const isCancelled = (booking['Status'] || '') === 'Cancelled';
  document.getElementById('saveBtn').style.display = isCancelled ? 'none' : 'inline-block';
  if (isCancelled) {
    document.getElementById('editSub').textContent = '⚠ This booking is cancelled and cannot be edited.';
    document.getElementById('editSub').style.color = 'var(--red)';
  } else {
    document.getElementById('editSub').textContent = '';
    document.getElementById('editSub').style.color = '';
  }

  document.getElementById('editTitle').textContent = `Edit Booking – ${booking['Customer Full Name'] || booking['Receipt No']}`;

  // Populate editable fields
  document.getElementById('f-customerName').value  = booking['Customer Full Name'] || '';
  document.getElementById('f-phone').value         = String(booking['Phone Number'] || '').replace(/\.0$/, '');
  document.getElementById('f-aadhaar').value       = booking['Aadhaar Number']     || '';
  document.getElementById('f-pan').value           = booking['PAN Number']         || '';
  document.getElementById('f-address').value       = booking['Address']            || '';
  document.getElementById('f-referredBy').value    = booking['Referred By']        || '';
  document.getElementById('f-paymentRef').value    = booking['Payment Reference']  || '';
  document.getElementById('f-remarks').value       = booking['Remarks']            || '';
  document.getElementById('f-tokenAmount').value   = booking['Token Amount']       || 0;

  // Booking date — convert dd/mm/yyyy → yyyy-mm-dd for input[type=date]
  const bdRaw = String(booking['Booking Date'] || '');
  const bdParts = bdRaw.split('/');
  if (bdParts.length === 3) {
    document.getElementById('f-bookingDate').value = `${bdParts[2]}-${bdParts[1].padStart(2,'0')}-${bdParts[0].padStart(2,'0')}`;
  } else {
    document.getElementById('f-bookingDate').value = bdRaw;
  }

  // Payment mode
  const modeEl = document.getElementById('f-paymentMode');
  const modeVal = booking['Payment Mode'] || 'Cash';
  [...modeEl.options].forEach(o => { o.selected = o.value === modeVal; });

  // Rates
  document.getElementById('f-br').value = booking['BR'] || '';
  document.getElementById('f-rr').value = booking['RR'] || '';
  document.getElementById('areaDisplay').textContent = booking['Area SqFt'] || '—';
  recalcAmounts();

  // Disable fields if cancelled
  document.querySelectorAll('#editForm input, #editForm select').forEach(el => {
    el.disabled = isCancelled;
  });

  // Show panels
  document.getElementById('searchPanel').style.display = 'none';
  document.getElementById('editPanel').style.display   = 'block';

  // Load edit history
  loadEditLog(booking['Receipt No']);
}

// ── RECALC AMOUNTS ────────────────────────────────
function recalcAmounts() {
  const br   = parseFloat(document.getElementById('f-br').value) || 0;
  const rr   = parseFloat(document.getElementById('f-rr').value) || 0;
  const cr   = br - rr;
  const sqft = parseFloat(document.getElementById('areaDisplay').textContent) || 0;
  document.getElementById('f-cr').value   = cr.toFixed(2);
  document.getElementById('prev-br').textContent = '₹' + Utils.fmtNum(Math.round(br * sqft));
  document.getElementById('prev-rr').textContent = '₹' + Utils.fmtNum(Math.round(rr * sqft));
  document.getElementById('prev-cr').textContent = '₹' + Utils.fmtNum(Math.round(cr * sqft));
}

// ── SAVE ──────────────────────────────────────────
async function saveEdit() {
  if (!currentBooking) return;

  const name  = document.getElementById('f-customerName').value.trim();
  const phone = document.getElementById('f-phone').value.trim();
  const br    = parseFloat(document.getElementById('f-br').value);
  const rr    = parseFloat(document.getElementById('f-rr').value);
  const bd    = document.getElementById('f-bookingDate').value;

  if (!name)                          { Utils.toast('Customer name required', 'err'); return; }
  if (!/^[0-9]{10}$/.test(phone))     { Utils.toast('Phone must be 10 digits', 'err'); return; }
  if (isNaN(br) || br <= 0)           { Utils.toast('Valid BR rate required', 'err'); return; }
  if (isNaN(rr) || rr < 0)            { Utils.toast('Valid RR rate required', 'err'); return; }
  if (!bd)                            { Utils.toast('Booking date required', 'err'); return; }

  // Convert date back to dd/mm/yyyy for backend
  const bdParts = bd.split('-');
  const bookingDate = bdParts.length === 3
    ? `${bdParts[2]}/${bdParts[1]}/${bdParts[0]}`
    : bd;

  const btn = document.getElementById('saveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const res = await API.post({
      action:       'editBooking',
      receiptNo:    currentBooking['Receipt No'],
      customerName: name,
      phone,
      aadhaar:      document.getElementById('f-aadhaar').value.trim(),
      pan:          document.getElementById('f-pan').value.trim(),
      address:      document.getElementById('f-address').value.trim(),
      referredBy:   document.getElementById('f-referredBy').value.trim(),
      bookingDate,
      paymentMode:  document.getElementById('f-paymentMode').value,
      paymentRef:   document.getElementById('f-paymentRef').value.trim(),
      tokenAmount:  parseFloat(document.getElementById('f-tokenAmount').value) || 0,
      remarks:      document.getElementById('f-remarks').value.trim(),
      br, rr,
    });

    if (res.error) throw new Error(res.error);

    Utils.toast('✅ Booking updated successfully', 'ok');
    // Reload edit log and refresh form with saved data
    loadEditLog(currentBooking['Receipt No']);
    // Refresh booking data in form
    setTimeout(() => {
      const q = currentBooking['Receipt No'];
      API.get({ action:'getBookingForEdit', query: q }).then(r => {
        if (r.mode === 'edit') {
          currentBooking = r.booking;
          loadEditForm(r.booking);
        }
      });
    }, 800);

  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Save Changes';
  }
}

// ── EDIT LOG ──────────────────────────────────────
async function loadEditLog(receiptNo) {
  // We re-use getBookingForEdit which doesn't return log
  // Log is visible in the Edit Log sheet — show last edits via a simple read
  // For now show a placeholder — full log is in Edit Log sheet in Google Sheets
  const logPanel   = document.getElementById('logPanel');
  const logContent = document.getElementById('logContent');

  // Show panel with note
  logPanel.style.display = 'block';

  // Check if Last Edited fields exist
  const b = currentBooking;
  const lastBy = b['Last Edited By'] || null;
  const lastAt = b['Last Edited At'] || null;

  if (lastBy) {
    logContent.innerHTML = `
      <div style="font-size:.84rem;color:var(--grey);padding:8px 0;">
        Last edited by <strong style="color:var(--ink)">${lastBy}</strong> on <strong style="color:var(--ink)">${lastAt}</strong>.
        Full change history is available in the <strong>Edit Log</strong> sheet in Google Sheets.
      </div>`;
  } else {
    logContent.innerHTML = `
      <div style="font-size:.84rem;color:var(--grey);padding:8px 0;">
        No edits recorded yet. Full change history will appear in the <strong>Edit Log</strong> sheet in Google Sheets after the first save.
      </div>`;
  }
}
