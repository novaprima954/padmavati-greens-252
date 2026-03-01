// js/app/reserve.js
Auth.requireAuth();

let availablePlots  = [];
let selectedPlots   = [];   // [{plotNo, area, br, rr, cr, brAmt, rrAmt, crAmt}]
let pendingConvert  = null;
let pendingCancel   = null;

document.addEventListener('DOMContentLoaded', () => {
  Header.init('reserve');
  Utils.setupOverlays();

  // Default expiry: tomorrow 18:00
  const defExp = new Date(); defExp.setDate(defExp.getDate() + 2);
  document.getElementById('r-expdate').value = defExp.toISOString().split('T')[0];
  updateExpiryHint();

  document.getElementById('r-expdate').addEventListener('change', updateExpiryHint);
  document.getElementById('r-exptime').addEventListener('change', updateExpiryHint);
  document.getElementById('reserveBtn').addEventListener('click', submitReservation);
  document.getElementById('refreshBtn').addEventListener('click', loadReservations);
  document.getElementById('confirmConvertBtn').addEventListener('click', doConvert);
  document.getElementById('confirmCancelResBtn').addEventListener('click', doCancel);

  loadAvailablePlots();
  loadReservations();
  setInterval(loadReservations, 120000);
});

// ── PLOT GRID (multi-select) ──────────────────────
async function loadAvailablePlots() {
  try {
    const data = await API.get({ action: 'getPlots' });
    if (data.error) throw new Error(data.error);
    availablePlots = (data.plots || []).filter(p => p['Status'] === 'Available');
    renderPlotGrid();
  } catch(e) {
    document.getElementById('resPickerStatus').textContent = 'Error loading plots';
  }
}

function renderPlotGrid() {
  const grid   = document.getElementById('resPlotGrid');
  const status = document.getElementById('resPickerStatus');
  status.textContent = availablePlots.length + ' available';

  if (!availablePlots.length) {
    grid.innerHTML = '<div style="color:var(--grey);font-size:.85rem;padding:12px 0;">No available plots</div>';
    return;
  }

  grid.innerHTML = availablePlots.map(p => {
    const plotNo = String(p['Plot No']);
    const area   = p['Area SqFt'] || '';
    const sel    = selectedPlots.find(s => s.plotNo === plotNo);
    return `<div class="pgrid-cell${sel?' pgrid-selected':''}" data-plot="${plotNo}" data-area="${area}"
      title="Plot ${plotNo} · ${area} SqFt">
      <div class="pgrid-no">${plotNo}</div>
      <div class="pgrid-area">${area}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.pgrid-cell').forEach(cell => {
    cell.addEventListener('click', () => togglePlot(cell));
  });
}

function togglePlot(cell) {
  const plotNo = cell.dataset.plot;
  const area   = parseFloat(cell.dataset.area) || 0;
  const exists = selectedPlots.findIndex(s => s.plotNo === plotNo);

  if (exists >= 0) {
    // Deselect
    selectedPlots.splice(exists, 1);
    cell.classList.remove('pgrid-selected');
    const card = document.querySelector(`.res-rate-card[data-plot="${plotNo}"]`);
    if (card) card.remove();
  } else {
    // Select
    selectedPlots.push({ plotNo, area, br:0, rr:0, cr:0, brAmt:0, rrAmt:0, crAmt:0 });
    cell.classList.add('pgrid-selected');
    addRateCard(plotNo, area);
  }
}

function addRateCard(plotNo, area) {
  const container = document.getElementById('resPlotRates');

  // Insert card in sorted order by plotNo
  const card = document.createElement('div');
  card.className = 'card res-rate-card';
  card.dataset.plot = plotNo;
  card.style.marginTop = '14px';
  card.innerHTML = `
    <div class="pec-header">
      <span class="pec-num">Plot ${plotNo} &nbsp;·&nbsp; ${area} SqFt</span>
    </div>
    <div class="form-row">
      <div class="fg">
        <label>BR Rate (₹/sqft) <span class="req">*</span></label>
        <input type="number" class="res-br" data-plot="${plotNo}" placeholder="e.g. 295" min="0">
      </div>
      <div class="fg">
        <label>RR Rate (₹/sqft) <span class="req">*</span></label>
        <input type="number" class="res-rr" data-plot="${plotNo}" placeholder="e.g. 170" min="0">
      </div>
      <div class="fg">
        <label>CR Rate (auto)</label>
        <div class="res-cr-display" id="res-cr-${plotNo}">—</div>
      </div>
    </div>
    <div class="res-amounts" id="res-amounts-${plotNo}" style="display:none;">
      <div class="pec-amt-chip br-chip">BR ₹<span id="res-bramt-${plotNo}">0</span></div>
      <div class="pec-amt-chip rr-chip2">RR ₹<span id="res-rramt-${plotNo}">0</span></div>
      <div class="pec-amt-chip cr-chip2">CR ₹<span id="res-cramt-${plotNo}">0</span></div>
    </div>`;
  container.appendChild(card);

  // Wire rate inputs
  card.querySelectorAll('.res-br, .res-rr').forEach(inp => {
    inp.addEventListener('input', () => recalcRate(plotNo, area));
  });
}

function recalcRate(plotNo, area) {
  const brEl = document.querySelector(`.res-br[data-plot="${plotNo}"]`);
  const rrEl = document.querySelector(`.res-rr[data-plot="${plotNo}"]`);
  const br   = parseFloat(brEl?.value) || 0;
  const rr   = parseFloat(rrEl?.value) || 0;
  const cr   = Math.max(0, br - rr);

  const brAmt = Math.round(br * area);
  const rrAmt = Math.round(rr * area);
  const crAmt = Math.round(cr * area);

  // Update display
  const crDisp = document.getElementById(`res-cr-${plotNo}`);
  if (crDisp) crDisp.textContent = cr > 0 ? `₹${cr}/sqft` : '—';

  const amtDiv = document.getElementById(`res-amounts-${plotNo}`);
  if (amtDiv && brAmt > 0) {
    amtDiv.style.display = 'flex';
    document.getElementById(`res-bramt-${plotNo}`).textContent = Utils.fmtNum(brAmt);
    document.getElementById(`res-rramt-${plotNo}`).textContent = Utils.fmtNum(rrAmt);
    document.getElementById(`res-cramt-${plotNo}`).textContent = Utils.fmtNum(crAmt);
  } else if (amtDiv) {
    amtDiv.style.display = 'none';
  }

  // Update selectedPlots entry
  const entry = selectedPlots.find(s => s.plotNo === plotNo);
  if (entry) { entry.br=br; entry.rr=rr; entry.cr=cr; entry.brAmt=brAmt; entry.rrAmt=rrAmt; entry.crAmt=crAmt; }
}

function updateExpiryHint() {
  const d = document.getElementById('r-expdate').value;
  const t = document.getElementById('r-exptime').value || '18:00';
  const hint = document.getElementById('resExpiryHint');
  if (!d) { hint.textContent = ''; return; }
  const dp = d.split('-');
  const dt = new Date(+dp[0], +dp[1]-1, +dp[2], +t.split(':')[0], +t.split(':')[1]);
  const diff = dt - new Date();
  if (diff <= 0) { hint.textContent = '⚠ Expiry is in the past'; hint.style.color='var(--red)'; return; }
  const hrs=Math.floor(diff/3600000), days=Math.floor(hrs/24), mins=Math.floor((diff%3600000)/60000);
  hint.style.color='var(--grey)';
  hint.textContent = days>0 ? `Plot(s) held for ${days}d ${hrs%24}h from now` : `Plot(s) held for ${hrs}h ${mins}m from now`;
}

// ── SUBMIT ────────────────────────────────────────
async function submitReservation() {
  const name    = document.getElementById('r-name').value.trim();
  const phone   = document.getElementById('r-phone').value.trim();
  const address = document.getElementById('r-address').value.trim();
  const notes   = document.getElementById('r-notes').value.trim();
  const expdate = document.getElementById('r-expdate').value;
  const exptime = document.getElementById('r-exptime').value || '18:00';

  if (!name)                           { Utils.toast('Customer name required','err'); return; }
  if (!/^[0-9]{10}$/.test(phone))      { Utils.toast('Phone must be 10 digits','err'); return; }
  if (!selectedPlots.length)           { Utils.toast('Select at least one plot','err'); return; }
  if (!expdate)                        { Utils.toast('Expiry date required','err'); return; }

  // Validate all plots have BR entered
  for (const p of selectedPlots) {
    if (!p.br) { Utils.toast(`Enter BR rate for Plot ${p.plotNo}`,'err'); return; }
    if (p.rr > p.br) { Utils.toast(`RR cannot exceed BR for Plot ${p.plotNo}`,'err'); return; }
  }

  const dp = expdate.split('-');
  const tp = exptime.split(':');
  const expDt = new Date(+dp[0], +dp[1]-1, +dp[2], +tp[0], +tp[1]);
  if (expDt <= new Date()) { Utils.toast('Expiry must be in the future','err'); return; }
  const expiryDateFmt = dp[2]+'/'+dp[1]+'/'+dp[0];

  const btn = document.getElementById('reserveBtn');
  btn.disabled = true; btn.textContent = 'Reserving…';

  try {
    const res = await API.post({
      action: 'createReservation',
      plots: selectedPlots.map(p => ({ plotNo:p.plotNo, area:p.area, br:p.br, rr:p.rr, cr:p.cr, brAmt:p.brAmt, rrAmt:p.rrAmt, crAmt:p.crAmt })),
      customerName: name, phone, address, notes,
      expiryDate: expiryDateFmt, expiryTime: exptime
    });
    if (res.error) throw new Error(res.error);
    Utils.toast(`${res.count} plot(s) reserved for ${name}`, 'ok');
    resetForm();
    await loadAvailablePlots();
    await loadReservations();
  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled=false; btn.textContent='📌 Reserve Plot(s)';
  }
}

function resetForm() {
  ['r-name','r-phone','r-address','r-notes'].forEach(id => { document.getElementById(id).value=''; });
  selectedPlots = [];
  document.getElementById('resPlotRates').innerHTML = '';
  const defExp2 = new Date(); defExp2.setDate(defExp2.getDate() + 2);
  document.getElementById('r-expdate').value = defExp2.toISOString().split('T')[0];
  document.getElementById('r-exptime').value = '18:00';
  updateExpiryHint();
}

// ── RESERVATIONS LIST ─────────────────────────────
async function loadReservations() {
  const el = document.getElementById('reservationsList');
  el.innerHTML = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';
  try {
    const data = await API.get({ action:'getReservations' });
    if (data.error) throw new Error(data.error);
    renderReservations(data.rows);
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

function resListClickHandler(e) {
  const convertBtn = e.target.closest('.btn-convert');
  const cancelBtn  = e.target.closest('.btn-cancel-res');
  if (convertBtn) {
    openConvertModal({
      resID:        convertBtn.dataset.id,
      plotNo:       convertBtn.dataset.plot,
      customerName: convertBtn.dataset.name,
      phone:        convertBtn.dataset.phone,
      address:      convertBtn.dataset.address || ''
    });
  } else if (cancelBtn) {
    openCancelModal({
      resID:        cancelBtn.dataset.id,
      plotNo:       cancelBtn.dataset.plot,
      customerName: cancelBtn.dataset.name
    });
  }
}

function renderReservations(rows) {
  const el = document.getElementById('reservationsList');
  if (!rows || !rows.length) {
    el.innerHTML = '<div class="empty-state" style="padding:30px 0;"><div class="empty-icon">📌</div><p>No reservations yet</p></div>';
    return;
  }

  const order = { Active:0, Expired:1, Cancelled:2, Converted:99 };
  rows.sort((a,b) => (order[a['Status']]||9)-(order[b['Status']]||9));

  // Group by Reservation ID (multi-plot reservations share same ID prefix)
  // Each row IS one reservation (one plot per row from the sheet)
  el.innerHTML = rows.map(r => {
    const status   = String(r['Status']||'').trim() || 'Active';
    const isActive = status==='Active';
    const expStr   = String(r['Expiry Date']||'').trim() + ' ' + String(r['Expiry Time']||'').trim();
    const expiry   = parseResDate(expStr.trim());
    const timeLeft = expiry ? getTimeLeft(expiry) : '—';
    const urgent   = isActive && expiry && (expiry - new Date()) < 3600000;

    const stCls = { Active:'res-status-active', Expired:'res-status-expired',
                    Cancelled:'res-status-cancelled', Converted:'res-status-converted' }[status]||'';

    // Rate summary if present
    const brAmt = Number(r['BR Amount'])||0, rrAmt = Number(r['RR Amount'])||0, crAmt = Number(r['CR Amount'])||0;
    // Rate chips
    const rateRow = brAmt>0 ? `<div class="res-card-rates">
      <span class="pec-amt-chip br-chip" style="font-size:.65rem;">BR ₹${Utils.fmtNum(brAmt)}</span>
      <span class="pec-amt-chip rr-chip2" style="font-size:.65rem;">RR ₹${Utils.fmtNum(rrAmt)}</span>
      <span class="pec-amt-chip cr-chip2" style="font-size:.65rem;">CR ₹${Utils.fmtNum(crAmt)}</span>
    </div>` : '';

    // Installment schedule — only if we have amounts
    let scheduleRow = '';
    if (brAmt > 0) {
      const bd = resFieldToDate(r['Reserved At']) || new Date();
      function addD(d,n){ const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
      function fmtD(d){ return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}); }
      const d10=fmtD(addD(bd,10)), d75=fmtD(addD(bd,75)), d165=fmtD(addD(bd,165));
      const br1=Math.round(brAmt*.35), br2=Math.round(brAmt*.35), br3=brAmt-br1-br2;
      const rr1=Math.round(rrAmt*.35), rr2=Math.round(rrAmt*.35), rr3=rrAmt-rr1-rr2;
      const cr1=Math.round(crAmt*.35), cr2=Math.round(crAmt*.35), cr3=crAmt-cr1-cr2;
      scheduleRow = `<div class="res-schedule">
        <div class="res-sch-title">Installment Schedule</div>
        <table class="res-sch-table">
          <thead><tr><th>Part</th><th>Due Date</th><th>BR</th><th>RR</th><th>CR</th></tr></thead>
          <tbody>
            <tr><td>1 · 35%</td><td>${d10}</td><td>₹${Utils.fmtNum(br1)}</td><td>₹${Utils.fmtNum(rr1)}</td><td>₹${Utils.fmtNum(cr1)}</td></tr>
            <tr><td>2 · 35%</td><td>${d75}</td><td>₹${Utils.fmtNum(br2)}</td><td>₹${Utils.fmtNum(rr2)}</td><td>₹${Utils.fmtNum(cr2)}</td></tr>
            <tr><td>3 · 30%</td><td>${d165}</td><td>₹${Utils.fmtNum(br3)}</td><td>₹${Utils.fmtNum(rr3)}</td><td>₹${Utils.fmtNum(cr3)}</td></tr>
          </tbody>
        </table>
      </div>`;
    }

    return `<div class="res-card ${isActive?'res-card-active':''} ${urgent?'res-card-urgent':''}">
      <div class="res-card-head">
        <div class="res-card-plot">Plot ${r['Plot No']}</div>
        <span class="res-status-badge ${stCls}">${status}</span>
      </div>
      <div class="res-card-customer">${r['Customer Name']||'—'} &nbsp;·&nbsp; ${r['Phone']||''}</div>
      ${rateRow}
      <div class="res-card-meta">Reserved by ${r['Reserved By']||'—'} &nbsp;·&nbsp; ${fmtResDate(r['Reserved At'])}</div>
      <div class="res-card-expiry ${urgent?'res-expiry-urgent':''}">
        ⏱ Expires: ${fmtResDate(String(r['Expiry Date']||'').trim() + ' ' + String(r['Expiry Time']||'').trim())}
        ${isActive?`<span class="res-timeleft">${timeLeft}</span>`:''}
      </div>
      ${scheduleRow}
      ${r['Notes']?`<div class="res-card-notes">${r['Notes']}</div>`:''}
      ${!isActive&&r['Released At']?`<div class="res-card-meta" style="margin-top:4px;">${status} · ${fmtResDate(r['Released At'])} by ${r['Released By']||'—'}</div>`:''}
      ${isActive?`<div class="res-card-actions">
        <button class="btn-convert"
          data-id="${r['Reservation ID']}" data-plot="${r['Plot No']}"
          data-name="${(r['Customer Name']||'').replace(/"/g,'&quot;')}"
          data-phone="${r['Phone']||''}"
          data-address="${(r['Address']||'').replace(/"/g,'&quot;')}">
          📋 Convert to Booking
        </button>
        <button class="btn-cancel-res"
          data-id="${r['Reservation ID']}" data-plot="${r['Plot No']}"
          data-name="${(r['Customer Name']||'').replace(/"/g,'&quot;')}">
          ✕ Cancel
        </button>
      </div>`:''}
    </div>`;
  }).join('');

  // Use event delegation — one listener on container, handles all dynamic buttons
  el.removeEventListener('click', resListClickHandler);
  el.addEventListener('click', resListClickHandler);
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
  btn.disabled=true; btn.textContent='Processing…';
  try {
    const res = await API.post({ action:'convertReservation', resID:pendingConvert.resID });
    if (res.error) throw new Error(res.error);
    Utils.closeOverlay('convertOverlay');
    const params = new URLSearchParams({
      plotNo:       pendingConvert.plotNo,
      customerName: pendingConvert.customerName,
      phone:        pendingConvert.phone,
      address:      pendingConvert.address||''
    });
    window.location.href = 'booking.html?' + params.toString();
  } catch(e) {
    Utils.toast(e.message,'err');
    btn.disabled=false; btn.textContent='✅ Continue to Booking';
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
  btn.disabled=true; btn.textContent='Cancelling…';
  try {
    const res = await API.post({ action:'cancelReservation', resID:pendingCancel.resID });
    if (res.error) throw new Error(res.error);
    Utils.toast('Reservation cancelled — plot released','ok');
    Utils.closeOverlay('cancelResOverlay');
    pendingCancel = null;
    await loadAvailablePlots();
    await loadReservations();
  } catch(e) {
    Utils.toast(e.message,'err');
    btn.disabled=false; btn.textContent='✕ Cancel Reservation';
  }
}

// ── Helpers ───────────────────────────────────────
function parseResDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s || s==='') return null;
  // dd/mm/yyyy HH:MM
  const parts = s.split(' ');
  const dp = parts[0].split('/');
  if (dp.length===3 && dp[2].length===4) {
    const tp = (parts[1]||'23:59').split(':');
    return new Date(+dp[2], +dp[1]-1, +dp[0], +(tp[0]||23), +(tp[1]||59));
  }
  // ISO string or any other format — let Date parse it
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Format any date value (ISO string, Date object, dd/mm/yyyy) → dd/mm/yyyy HH:MM
function fmtResDate(val) {
  if (!val) return '—';
  const d = parseResDate(String(val));
  if (!d) return String(val);
  return d.toLocaleDateString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric'})
       + ' ' + d.toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit',hour12:false});
}

// Extract just a Date object from any reservation date field
function resFieldToDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  // dd/mm/yyyy ...
  const dp = s.split(' ')[0].split('/');
  if (dp.length===3 && dp[2].length===4) return new Date(+dp[2],+dp[1]-1,+dp[0]);
  return new Date(s);
}
function getTimeLeft(expiry) {
  const diff=expiry-new Date(); if (diff<=0) return 'Expired';
  const hrs=Math.floor(diff/3600000),days=Math.floor(hrs/24),mins=Math.floor((diff%3600000)/60000);
  if (days>0) return `${days}d ${hrs%24}h left`;
  if (hrs>0)  return `${hrs}h ${mins}m left`;
  return `${mins}m left`;
}
