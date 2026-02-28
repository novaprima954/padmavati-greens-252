// js/app/reserve.js
Auth.requireAuth();

let availablePlots = [];
let selectedPlotNo = null;
let pendingConvert = null;  // {resID, plotNo, customerName, phone}
let pendingCancel  = null;

document.addEventListener('DOMContentLoaded', () => {
  Header.init('reserve');

  // Default expiry: tomorrow 18:00
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById('r-expdate').value = tomorrow.toISOString().split('T')[0];
  updateExpiryHint();

  document.getElementById('r-expdate').addEventListener('change', updateExpiryHint);
  document.getElementById('r-exptime').addEventListener('change', updateExpiryHint);
  document.getElementById('reserveBtn').addEventListener('click', submitReservation);
  document.getElementById('refreshBtn').addEventListener('click', loadReservations);
  document.getElementById('confirmConvertBtn').addEventListener('click', doConvert);
  document.getElementById('confirmCancelResBtn').addEventListener('click', doCancel);

  loadAvailablePlots();
  loadReservations();

  // Auto-refresh every 2 minutes to catch expiries
  setInterval(loadReservations, 120000);
});

// ── PLOT GRID ─────────────────────────────────────
async function loadAvailablePlots() {
  try {
    const data = await API.get({ action: 'getPlots' });
    if (data.error) throw new Error(data.error);
    availablePlots = (data.plots || []).filter(p =>
      p['Status'] === 'Available' || p['Status'] === 'Reserved'
    );
    renderPlotGrid();
  } catch(e) {
    document.getElementById('resPickerStatus').textContent = 'Error loading plots';
  }
}

function renderPlotGrid() {
  const grid   = document.getElementById('resPlotGrid');
  const status = document.getElementById('resPickerStatus');
  const avail  = availablePlots.filter(p => p['Status'] === 'Available');
  status.textContent = avail.length + ' available';

  if (!avail.length) {
    grid.innerHTML = '<div style="color:var(--grey);font-size:.85rem;padding:12px 0;">No available plots</div>';
    return;
  }

  grid.innerHTML = avail.map(p => {
    const plotNo = String(p['Plot No']);
    const area   = p['Area SqFt'] || '';
    return `<div class="pgrid-cell" data-plot="${plotNo}" data-area="${area}" title="Plot ${plotNo} · ${area} SqFt">
      <div class="pgrid-no">${plotNo}</div>
      <div class="pgrid-area">${area}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.pgrid-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      // Deselect previous
      grid.querySelectorAll('.pgrid-cell').forEach(c => c.classList.remove('pgrid-selected'));
      if (selectedPlotNo === cell.dataset.plot) {
        selectedPlotNo = null;
        document.getElementById('resSelectedPlot').style.display = 'none';
      } else {
        cell.classList.add('pgrid-selected');
        selectedPlotNo = cell.dataset.plot;
        const selDiv = document.getElementById('resSelectedPlot');
        selDiv.style.display = 'flex';
        selDiv.innerHTML = `<span class="res-sel-check">✓</span> Plot <strong>${cell.dataset.plot}</strong> selected &nbsp;·&nbsp; ${cell.dataset.area} SqFt`;
      }
    });
  });
}

function updateExpiryHint() {
  const d = document.getElementById('r-expdate').value;
  const t = document.getElementById('r-exptime').value || '18:00';
  const hint = document.getElementById('resExpiryHint');
  if (!d) { hint.textContent = ''; return; }
  const dp = d.split('-');
  const dt = new Date(parseInt(dp[0]), parseInt(dp[1])-1, parseInt(dp[2]),
                      parseInt(t.split(':')[0]), parseInt(t.split(':')[1]));
  const now  = new Date();
  const diff = dt - now;
  if (diff <= 0) { hint.textContent = '⚠ Expiry is in the past'; hint.style.color='var(--red)'; return; }
  const hrs  = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const days = Math.floor(hrs / 24);
  hint.style.color = 'var(--grey)';
  hint.textContent = days > 0
    ? `Plot will be held for ${days}d ${hrs%24}h from now`
    : `Plot will be held for ${hrs}h ${mins}m from now`;
}

// ── SUBMIT RESERVATION ────────────────────────────
async function submitReservation() {
  const name    = document.getElementById('r-name').value.trim();
  const phone   = document.getElementById('r-phone').value.trim();
  const expdate = document.getElementById('r-expdate').value;
  const exptime = document.getElementById('r-exptime').value || '18:00';
  const notes   = document.getElementById('r-notes').value.trim();

  if (!name)            { Utils.toast('Customer name required', 'err'); return; }
  if (!/^[0-9]{10}$/.test(phone)) { Utils.toast('Phone must be 10 digits', 'err'); return; }
  if (!selectedPlotNo)  { Utils.toast('Select a plot', 'err'); return; }
  if (!expdate)         { Utils.toast('Expiry date required', 'err'); return; }

  // Validate expiry is in future
  const dp = expdate.split('-');
  const tp = exptime.split(':');
  const expDt = new Date(parseInt(dp[0]), parseInt(dp[1])-1, parseInt(dp[2]), parseInt(tp[0]), parseInt(tp[1]));
  if (expDt <= new Date()) { Utils.toast('Expiry must be in the future', 'err'); return; }

  // Format date as dd/mm/yyyy for storage
  const expiryDateFmt = dp[2]+'/'+dp[1]+'/'+dp[0];

  const btn = document.getElementById('reserveBtn');
  btn.disabled = true; btn.textContent = 'Reserving…';

  try {
    const res = await API.post({
      action: 'createReservation',
      plotNo: selectedPlotNo,
      customerName: name,
      phone,
      expiryDate: expiryDateFmt,
      expiryTime: exptime,
      notes
    });
    if (res.error) throw new Error(res.error);

    Utils.toast(`Plot ${res.plotNo} reserved for ${res.customerName}`, 'ok');

    // Reset form
    document.getElementById('r-name').value = '';
    document.getElementById('r-phone').value = '';
    document.getElementById('r-notes').value = '';
    selectedPlotNo = null;
    document.getElementById('resSelectedPlot').style.display = 'none';
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('r-expdate').value = tomorrow.toISOString().split('T')[0];
    updateExpiryHint();

    // Reload both grid and list
    await loadAvailablePlots();
    await loadReservations();
  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '📌 Reserve Plot';
  }
}

// ── RESERVATIONS LIST ─────────────────────────────
async function loadReservations() {
  const el = document.getElementById('reservationsList');
  el.innerHTML = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';
  try {
    const data = await API.get({ action: 'getReservations' });
    if (data.error) throw new Error(data.error);
    renderReservations(data.rows);
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

function renderReservations(rows) {
  const el = document.getElementById('reservationsList');
  if (!rows.length) {
    el.innerHTML = '<div class="empty-state" style="padding:30px 0;"><div class="empty-icon">📌</div><p>No reservations yet</p></div>';
    return;
  }

  // Sort: Active first, then Expired, then Cancelled/Converted
  const order = { Active:0, Expired:1, Cancelled:2, Converted:3 };
  rows.sort((a,b) => (order[a['Status']]||9) - (order[b['Status']]||9));

  el.innerHTML = rows.map(r => {
    const status   = r['Status'] || 'Active';
    const isActive = status === 'Active';
    const expStr   = r['Expiry Date'] + ' ' + (r['Expiry Time'] || '');
    const expiry   = parseResDate(expStr);
    const timeLeft = expiry ? getTimeLeft(expiry) : '—';
    const urgent   = isActive && expiry && (expiry - new Date()) < 3600000; // < 1 hour

    const statusCls = {
      Active: 'res-status-active', Expired: 'res-status-expired',
      Cancelled: 'res-status-cancelled', Converted: 'res-status-converted'
    }[status] || '';

    return `<div class="res-card ${isActive?'res-card-active':''} ${urgent?'res-card-urgent':''}">
      <div class="res-card-head">
        <div class="res-card-plot">Plot ${r['Plot No']}</div>
        <span class="res-status-badge ${statusCls}">${status}</span>
      </div>
      <div class="res-card-customer">${r['Customer Name']} &nbsp;·&nbsp; ${r['Phone']||''}</div>
      <div class="res-card-meta">
        Reserved by ${r['Reserved By']||'—'} &nbsp;·&nbsp; ${r['Reserved At']||''}
      </div>
      <div class="res-card-expiry ${urgent?'res-expiry-urgent':''}">
        ⏱ Expires: ${r['Expiry Date']} ${r['Expiry Time']||''}
        ${isActive ? `<span class="res-timeleft">${timeLeft}</span>` : ''}
      </div>
      ${r['Notes'] ? `<div class="res-card-notes">${r['Notes']}</div>` : ''}
      ${!isActive && r['Released At'] ? `<div class="res-card-meta" style="margin-top:4px;">${status} · ${r['Released At']} by ${r['Released By']||'—'}</div>` : ''}
      ${isActive ? `
        <div class="res-card-actions">
          <button class="btn-convert" data-id="${r['Reservation ID']}" data-plot="${r['Plot No']}"
            data-name="${r['Customer Name']}" data-phone="${r['Phone']||''}">
            📋 Convert to Booking
          </button>
          <button class="btn-cancel-res" data-id="${r['Reservation ID']}" data-plot="${r['Plot No']}"
            data-name="${r['Customer Name']}">
            ✕ Cancel
          </button>
        </div>` : ''}
    </div>`;
  }).join('');

  // Wire buttons
  el.querySelectorAll('.btn-convert').forEach(btn => {
    btn.addEventListener('click', () => openConvertModal({
      resID: btn.dataset.id, plotNo: btn.dataset.plot,
      customerName: btn.dataset.name, phone: btn.dataset.phone
    }));
  });
  el.querySelectorAll('.btn-cancel-res').forEach(btn => {
    btn.addEventListener('click', () => openCancelModal({
      resID: btn.dataset.id, plotNo: btn.dataset.plot, customerName: btn.dataset.name
    }));
  });
}

// ── CONVERT ───────────────────────────────────────
function openConvertModal(info) {
  pendingConvert = info;
  document.getElementById('convertInfo').innerHTML = `
    <div class="res-modal-info">
      <span class="res-modal-plot">Plot ${info.plotNo}</span>
      <span class="res-modal-customer">${info.customerName}</span>
      <span class="res-modal-phone">${info.phone}</span>
    </div>`;
  Utils.openOverlay('convertOverlay');
}

async function doConvert() {
  if (!pendingConvert) return;
  const btn = document.getElementById('confirmConvertBtn');
  btn.disabled = true; btn.textContent = 'Processing…';

  try {
    const res = await API.post({ action: 'convertReservation', resID: pendingConvert.resID });
    if (res.error) throw new Error(res.error);

    Utils.closeOverlay('convertOverlay');

    // Redirect to booking page with pre-filled params
    const params = new URLSearchParams({
      plotNo:       res.plotNo,
      customerName: res.customerName,
      phone:        res.phone
    });
    window.location.href = 'booking.html?' + params.toString();
  } catch(e) {
    Utils.toast(e.message, 'err');
    btn.disabled = false; btn.textContent = '✅ Continue to Booking';
  }
}

// ── CANCEL ────────────────────────────────────────
function openCancelModal(info) {
  pendingCancel = info;
  document.getElementById('cancelResInfo').innerHTML = `
    <div class="res-modal-info">
      <span class="res-modal-plot">Plot ${info.plotNo}</span>
      <span class="res-modal-customer">${info.customerName}</span>
    </div>`;
  Utils.openOverlay('cancelResOverlay');
}

async function doCancel() {
  if (!pendingCancel) return;
  const btn = document.getElementById('confirmCancelResBtn');
  btn.disabled = true; btn.textContent = 'Cancelling…';

  try {
    const res = await API.post({ action: 'cancelReservation', resID: pendingCancel.resID });
    if (res.error) throw new Error(res.error);
    Utils.toast('Reservation cancelled — plot released', 'ok');
    Utils.closeOverlay('cancelResOverlay');
    await loadAvailablePlots();
    await loadReservations();
  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '✕ Cancel Reservation';
    pendingCancel = null;
  }
}

// ── Helpers ───────────────────────────────────────
function parseResDate(str) {
  if (!str || str.trim() === '') return null;
  const parts = str.trim().split(' ');
  const dp    = parts[0].split('/');
  if (dp.length === 3) {
    const tp = (parts[1] || '23:59').split(':');
    return new Date(parseInt(dp[2]), parseInt(dp[1])-1, parseInt(dp[0]),
                    parseInt(tp[0]||23), parseInt(tp[1]||59));
  }
  const d = new Date(str); return isNaN(d) ? null : d;
}

function getTimeLeft(expiry) {
  const diff = expiry - new Date();
  if (diff <= 0) return 'Expired';
  const hrs  = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs%24}h left`;
  if (hrs > 0)  return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}
