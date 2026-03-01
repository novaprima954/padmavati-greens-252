// js/app/booking.js — Multi-plot booking
Auth.requireAuth();
// Block sales role from booking page
(function(){
  try {
    const s = JSON.parse(localStorage.getItem('pg_session'));
    if (s && s.role !== 'admin') window.location.replace('index.html');
  } catch(e) {}
})();

let availablePlots = [];
let plotEntries    = [];  // [{id, plotNo, br, rr, area, brAmt, rrAmt, crAmt}]
let lastBooking    = null;
let plotCounter    = 0;

document.addEventListener('DOMContentLoaded', () => {
  Header.init('booking');

  // Default booking date
  document.getElementById('f-bookdate').value = new Date().toISOString().split('T')[0];

  // Pre-fill from reservation conversion (?plotNo=&customerName=&phone=)
  const urlP = new URLSearchParams(window.location.search);
  if (urlP.get('customerName')) document.getElementById('f-name').value  = urlP.get('customerName');
  if (urlP.get('phone'))        document.getElementById('f-phone').value = urlP.get('phone');
  if (urlP.get('plotNo')) {
    // Wait for plots to load then auto-select the plot
    window._preSelectPlot = urlP.get('plotNo');
  }

  // Load available plots
  loadAvailablePlots();

  // Receipt → mode auto-detect
  const rcpt1El   = document.getElementById('f-receipt1');
  const paymodeEl = document.getElementById('f-paymode');
  rcpt1El.addEventListener('input', () => {
    const det = Utils.receiptToMode(rcpt1El.value);
    if (det && paymodeEl.value === '') { paymodeEl.value = det; }
  });
  rcpt1El.addEventListener('blur', () => {
    const det = Utils.receiptToMode(rcpt1El.value);
    if (det && paymodeEl.value && paymodeEl.value !== det)
      Utils.toast(`Receipt ${rcpt1El.value} suggests ${det} — mode is ${paymodeEl.value}`, 'err');
  });
  paymodeEl.addEventListener('change', () => {
    const det = Utils.receiptToMode(rcpt1El.value);
    if (rcpt1El.value && det && paymodeEl.value && paymodeEl.value !== det)
      Utils.toast(`Receipt suggests ${det} — mode is ${paymodeEl.value}`, 'err');
    recalcSummary();
  });

  document.getElementById('f-bookdate').addEventListener('change', recalcSummary);
  document.getElementById('f-token').addEventListener('input', () => { updateTokenSplit(); recalcSummary(); });
  // Plot selection via grid — no addPlotBtn needed
  document.getElementById('bookBtn').addEventListener('click', submitBooking);

  document.getElementById('newBookingBtn').addEventListener('click', () => {
    Utils.closeOverlay('confirmOverlay');
    resetForm();
  });

  // Plots added via grid clicks
});

async function loadAvailablePlots() {
  try {
    const data = await API.get({ action:'getPlots' });
    if (data.error) throw new Error(data.error);
    availablePlots = (data.plots || []).filter(p => p['Status'] === 'Available');
    renderPlotGrid();
  } catch(e) {
    document.getElementById('plotPickerStatus').textContent = 'Error loading plots';
    Utils.toast('Could not load plots: '+e.message, 'err');
  }
}

// Status colours
const STATUS_COLOR = { Available:'#e8f5e9', Booked:'#ffebee', Reserved:'#fff9c4' };

function renderPlotGrid() {
  const grid   = document.getElementById('plotPickerGrid');
  const status = document.getElementById('plotPickerStatus');
  status.textContent = availablePlots.length + ' available';

  if (!availablePlots.length) {
    grid.innerHTML = '<div style="color:var(--grey);padding:12px;">No available plots</div>';
    return;
  }

  grid.innerHTML = availablePlots.map(p => {
    const plotNo = String(p['Plot No']);
    const area   = p['Area SqFt'] || '';
    return `<div class="pgrid-cell" data-plot="${plotNo}" data-area="${area}" title="Plot ${plotNo} · ${area} SqFt">
      <div class="pgrid-no">${plotNo}</div>
      <div class="pgrid-area">${area}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.pgrid-cell').forEach(cell => {
    cell.addEventListener('click', () => togglePlotFromGrid(cell));
  });

  // Auto-select from URL param (reservation conversion)
  if (window._preSelectPlot) {
    const target = grid.querySelector(`.pgrid-cell[data-plot="${window._preSelectPlot}"]`);
    if (target) { togglePlotFromGrid(target); window._preSelectPlot = null; }
  }
}

function togglePlotFromGrid(cell) {
  const plotNo = cell.dataset.plot;
  const area   = parseFloat(cell.dataset.area)||0;
  const exists = plotEntries.find(e => e.plotNo === plotNo);

  if (exists) {
    // Deselect — remove rate card
    removePlotByNo(plotNo);
    cell.classList.remove('pgrid-selected');
  } else {
    // Select — add rate card
    const id = ++plotCounter;
    plotEntries.push({ id, plotNo, br:0, rr:0, area, brAmt:0, rrAmt:0, crAmt:0 });
    cell.classList.add('pgrid-selected');
    addRateCard(id, plotNo, area);
    updateTokenSplit();
    recalcSummary();
  }
}

function addRateCard(id, plotNo, area) {
  const container = document.getElementById('plotsContainer');
  const div = document.createElement('div');
  div.className = 'plot-entry-card';
  div.dataset.entryId = id;
  div.dataset.plotNo  = plotNo;
  div.innerHTML = `
    <div class="pec-header">
      <span class="pec-num">Plot ${plotNo} &nbsp;·&nbsp; ${area} SqFt</span>
    </div>
    <div class="form-row">
      <div class="fg"><label>BR Rate (₹/sqft) <span class="req">*</span></label>
        <input type="number" class="rate-br" data-entry-id="${id}" placeholder="e.g. 295" min="0"></div>
      <div class="fg"><label>RR Rate (₹/sqft) <span class="req">*</span></label>
        <input type="number" class="rate-rr" data-entry-id="${id}" placeholder="e.g. 170" min="0"></div>
    </div>
    <div class="pec-amounts" id="pec-amounts-${id}" style="display:none;">
      <div class="pec-amt-chip br-chip">BR ₹<span id="pec-br-${id}">0</span></div>
      <div class="pec-amt-chip rr-chip2">RR ₹<span id="pec-rr-${id}">0</span></div>
      <div class="pec-amt-chip cr-chip2">CR ₹<span id="pec-cr-${id}">0</span></div>
    </div>`;
  container.appendChild(div);

  div.querySelectorAll('.rate-br, .rate-rr').forEach(inp => {
    inp.addEventListener('input', () => { recalcEntry(id); recalcSummary(); });
  });
}

function removePlotByNo(plotNo) {
  const entry = plotEntries.find(e => e.plotNo === plotNo);
  if (!entry) return;
  plotEntries = plotEntries.filter(e => e.plotNo !== plotNo);
  const card  = document.querySelector(`.plot-entry-card[data-plot-no="${plotNo}"]`);
  if (card) card.remove();
  updateTokenSplit();
  recalcSummary();
}

function recalcEntry(id) {
  const entry = plotEntries.find(e => e.id === id);
  if (!entry) return;
  const brEl = document.querySelector(`.rate-br[data-entry-id="${id}"]`);
  const rrEl = document.querySelector(`.rate-rr[data-entry-id="${id}"]`);
  entry.br = parseFloat(brEl ? brEl.value : 0) || 0;
  entry.rr = parseFloat(rrEl ? rrEl.value : 0) || 0;
  const cr = entry.br - entry.rr;
  entry.brAmt = Math.round(entry.br * entry.area);
  entry.rrAmt = Math.round(entry.rr * entry.area);
  entry.crAmt = Math.round(cr * entry.area);

  const amtsDiv = document.getElementById(`pec-amounts-${id}`);
  if (entry.brAmt > 0) {
    amtsDiv.style.display = 'flex';
    document.getElementById(`pec-br-${id}`).textContent = Utils.fmtNum(entry.brAmt);
    document.getElementById(`pec-rr-${id}`).textContent = Utils.fmtNum(entry.rrAmt);
    document.getElementById(`pec-cr-${id}`).textContent = Utils.fmtNum(entry.crAmt);
  } else {
    amtsDiv.style.display = 'none';
  }
  recalcSummary();
}

function updateTokenSplit() {
  const total   = parseFloat(document.getElementById('f-token').value) || 0;
  const valid   = plotEntries.filter(e => e.plotNo && e.brAmt > 0);
  const splitInfo = document.getElementById('tokenSplitInfo');
  const splitFields = document.getElementById('tokenSplitFields');

  if (valid.length <= 1) { splitInfo.style.display='none'; return; }
  splitInfo.style.display = 'block';
  const perPlot = total > 0 ? Math.round(total / valid.length) : 0;
  splitFields.innerHTML = valid.map((e, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="font-size:.8rem;min-width:60px;color:var(--grey);">Plot ${e.plotNo}</span>
      <input type="number" class="token-split-inp" data-idx="${i}" value="${i===valid.length-1 ? total-perPlot*(valid.length-1) : perPlot}"
        style="width:110px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;" min="0">
    </div>`).join('');

  // Live balance check
  splitFields.querySelectorAll('.token-split-inp').forEach(inp => {
    inp.addEventListener('input', () => {
      const sum = [...splitFields.querySelectorAll('.token-split-inp')].reduce((s,i)=>s+parseFloat(i.value)||0,0);
      const diff = total - sum;
      if (Math.abs(diff) > 0.5) Utils.toast(`Token split total ₹${Utils.fmtNum(sum)} vs ₹${Utils.fmtNum(total)}`, 'err');
    });
  });
}

function getTokenSplits() {
  const valid = plotEntries.filter(e => e.plotNo && e.brAmt > 0);
  const total = parseFloat(document.getElementById('f-token').value) || 0;
  if (valid.length <= 1) return valid.map(() => total);
  const fields = document.querySelectorAll('.token-split-inp');
  if (fields.length === valid.length) {
    return [...fields].map(f => parseFloat(f.value)||0);
  }
  const perPlot = Math.round(total / valid.length);
  return valid.map((_, i) => i===valid.length-1 ? total-perPlot*(valid.length-1) : perPlot);
}

function recalcSummary() {
  const valid = plotEntries.filter(e => e.plotNo && e.brAmt > 0);
  const summaryEmpty   = document.getElementById('summaryEmpty');
  const summaryContent = document.getElementById('summaryContent');
  if (!valid.length) {
    summaryEmpty.style.display='block'; summaryContent.style.display='none'; return;
  }
  summaryEmpty.style.display='none'; summaryContent.style.display='block';

  const totalBR = valid.reduce((s,e)=>s+e.brAmt,0);
  const totalRR = valid.reduce((s,e)=>s+e.rrAmt,0);
  const totalCR = valid.reduce((s,e)=>s+e.crAmt,0);
  const token   = parseFloat(document.getElementById('f-token').value)||0;
  const mode    = document.getElementById('f-paymode').value;
  const tokRR   = mode!=='Cash' ? token : 0;
  const tokCR   = mode==='Cash' ? token : 0;

  const bdRaw  = document.getElementById('f-bookdate').value;
  const bdDate = bdRaw ? new Date(bdRaw) : new Date();
  function addD(d,n){ const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
  function fmtD(d)  { return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}); }
  const d10=fmtD(addD(bdDate,10)), d75=fmtD(addD(bdDate,75)), d165=fmtD(addD(bdDate,165));

  // Plot summary rows
  document.getElementById('plotsSummaryList').innerHTML = valid.map(e => `
    <div class="sum-plot-row">
      <div class="sum-plot-no">Plot ${e.plotNo}</div>
      <div class="sum-plot-area">${e.area} SqFt · BR ₹${e.br} · RR ₹${e.rr}</div>
      <div class="sum-plot-amts">
        <span>BR ₹${Utils.fmtNum(e.brAmt)}</span>
        <span>RR ₹${Utils.fmtNum(e.rrAmt)}</span>
        <span>CR ₹${Utils.fmtNum(e.crAmt)}</span>
      </div>
    </div>`).join('');

  document.getElementById('totalsSummary').innerHTML = `
    <div class="sum-totals">
      <div class="sum-total-row"><span>Total BR</span><strong>₹${Utils.fmtNum(totalBR)}</strong></div>
      <div class="sum-total-row"><span>Total RR</span><strong>₹${Utils.fmtNum(totalRR)}</strong></div>
      <div class="sum-total-row"><span>Total CR</span><strong>₹${Utils.fmtNum(totalCR)}</strong></div>
      <div class="sum-total-row sum-token"><span>Token</span><strong>₹${Utils.fmtNum(token)}</strong></div>
    </div>`;

  // Schedules
  if (valid.length > 0 && token >= 0) {
    const schedHTML = valid.map(e => {
      const rr1=Math.round(e.rrAmt*.35), rr2=Math.round(e.rrAmt*.35), rr3=e.rrAmt-rr1-rr2;
      const cr1=Math.round(e.crAmt*.35), cr2=Math.round(e.crAmt*.35), cr3=e.crAmt-cr1-cr2;
      const br1=Math.round(e.brAmt*.35), br2=Math.round(e.brAmt*.35), br3=e.brAmt-br1-br2;
      return `
        <div class="sum-schedule-plot">
          <div class="sum-sch-plotno">Plot ${e.plotNo}</div>
          <div class="schedule-grid" style="grid-template-columns:repeat(3,1fr);">
            <div class="inst-mini inst-br">
              <div class="inst-mini-title">BR</div>
              <div class="inst-mini-row hdr"><span>Part</span><span>Date</span><span>Amount</span></div>
              <div class="inst-mini-row"><span>1·35%</span><span>${d10}</span><span>₹${Utils.fmtNum(br1)}</span></div>
              <div class="inst-mini-row"><span>2·35%</span><span>${d75}</span><span>₹${Utils.fmtNum(br2)}</span></div>
              <div class="inst-mini-row"><span>3·30%</span><span>${d165}</span><span>₹${Utils.fmtNum(br3)}</span></div>
            </div>
            <div class="inst-mini inst-rr">
              <div class="inst-mini-title">RR</div>
              <div class="inst-mini-row hdr"><span>Part</span><span>Date</span><span>Amount</span></div>
              <div class="inst-mini-row"><span>1·35%</span><span>${d10}</span><span>₹${Utils.fmtNum(rr1)}</span></div>
              <div class="inst-mini-row"><span>2·35%</span><span>${d75}</span><span>₹${Utils.fmtNum(rr2)}</span></div>
              <div class="inst-mini-row"><span>3·30%</span><span>${d165}</span><span>₹${Utils.fmtNum(rr3)}</span></div>
            </div>
            <div class="inst-mini inst-cr">
              <div class="inst-mini-title">CR</div>
              <div class="inst-mini-row hdr"><span>Part</span><span>Date</span><span>Amount</span></div>
              <div class="inst-mini-row"><span>1·35%</span><span>${d10}</span><span>₹${Utils.fmtNum(cr1)}</span></div>
              <div class="inst-mini-row"><span>2·35%</span><span>${d75}</span><span>₹${Utils.fmtNum(cr2)}</span></div>
              <div class="inst-mini-row"><span>3·30%</span><span>${d165}</span><span>₹${Utils.fmtNum(cr3)}</span></div>
            </div>
          </div>
        </div>`;
    }).join('');
    document.getElementById('scheduleContainer').innerHTML = schedHTML;
    document.getElementById('installmentBox').style.display = 'block';
    window._pgSchedule = { valid, d10, d75, d165, token, tokRR, tokCR, totalBR, totalRR, totalCR };
  }
}

// ── SUBMIT ────────────────────────────────────────
async function submitBooking() {
  const name     = document.getElementById('f-name').value.trim();
  const phone    = document.getElementById('f-phone').value.trim();
  const bookdate = document.getElementById('f-bookdate').value;
  const receipt1 = document.getElementById('f-receipt1').value.trim();
  const paymode  = document.getElementById('f-paymode').value;
  const token    = parseFloat(document.getElementById('f-token').value)||0;
  const valid    = plotEntries.filter(e => e.plotNo && e.brAmt > 0);

  const refBy = document.getElementById('f-ref').value.trim();
  if (!name)              { Utils.toast('Customer name required','err'); return; }
  if (!/^[0-9]{10}$/.test(phone)) { Utils.toast('Phone must be exactly 10 digits','err'); return; }
  if (!refBy)             { Utils.toast('Referred By is mandatory','err'); return; }
  if (!bookdate)          { Utils.toast('Booking date required','err'); return; }
  if (!receipt1)          { Utils.toast('Manual receipt number required','err'); return; }
  if (!paymode)           { Utils.toast('Payment mode required','err'); return; }
  if (!valid.length)      { Utils.toast('Select at least one plot with rates','err'); return; }

  const tokenSplits = getTokenSplits();

  const btn = document.getElementById('bookBtn');
  btn.disabled=true; btn.textContent='Saving…';

  try {
    const res = await API.post({
      action: 'createMultiBooking',
      customer: {
        customerName: name, phone,
        aadhaar:  document.getElementById('f-aadhaar').value.trim(),
        address:  document.getElementById('f-address').value.trim(),
        referredBy: document.getElementById('f-ref').value.trim(),
      },
      shared: {
        bookingDate: bookdate.split('-').reverse().join('/'),
        receiptNo1: receipt1, paymentMode: paymode,
        paymentRef: document.getElementById('f-payref').value.trim(),
        remarks:    document.getElementById('f-remarks').value.trim(),
      },
      plots: valid.map((e, i) => ({
        plotNo: e.plotNo, br: e.br, rr: e.rr,
        tokenAmount: tokenSplits[i] || 0
      }))
    });
    if (res.error) throw new Error(res.error);
    lastBooking = res;
    showConfirmation(res);
  } catch(e) {
    Utils.toast(e.message,'err');
  } finally {
    btn.disabled=false; btn.textContent='📋 Book Plot(s)';
  }
}

function showConfirmation(res) {
  const html = `
    <div class="confirm-customer">
      <strong>${res.customerName}</strong> &nbsp;·&nbsp; ${res.phone||''}
      &nbsp;·&nbsp; ${res.bookingDate}
    </div>
    <table class="data-table" style="margin-top:14px;font-size:.82rem;">
      <thead><tr><th>Receipt</th><th>Plot</th><th>Area</th><th>BR Amt</th><th>RR Amt</th><th>CR Amt</th><th>Token</th></tr></thead>
      <tbody>
        ${res.results.map(r=>`<tr>
          <td><strong>${r.receiptNo}</strong></td>
          <td>Plot ${r.plotNo}</td>
          <td>${r.areaSqft} SqFt</td>
          <td>₹${Utils.fmtNum(r.brAmt)}</td>
          <td>₹${Utils.fmtNum(r.rrAmt)}</td>
          <td>₹${Utils.fmtNum(r.crAmt)}</td>
          <td>₹${Utils.fmtNum(r.tokenAmount)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:10px;font-size:.8rem;color:var(--grey);">
      Mode: ${res.paymentMode} &nbsp;·&nbsp; Manual Receipt: ${res.receiptNo1||'—'}
    </div>`;
  document.getElementById('confirmContent').innerHTML = html;
  Utils.openOverlay('confirmOverlay');
  document.getElementById('shareWA').onclick = shareWhatsApp;
}

function shareWhatsApp() {
  if (!lastBooking) return;
  const r = lastBooking;
  const s = window._pgSchedule;
  let plotLines = r.results.map(p =>
    `📍 Plot ${p.plotNo} · ${p.areaSqft} SqFt\n`+
    `   BR ₹${Utils.fmtNum(p.brAmt)} · RR ₹${Utils.fmtNum(p.rrAmt)} · CR ₹${Utils.fmtNum(p.crAmt)}\n`+
    `   Token: ₹${Utils.fmtNum(p.tokenAmount)}`
  ).join('\n\n');

  let schedLines = '';
  if (s && s.valid) {
    schedLines = '\n\n📊 *Installment Schedule*\n';
    s.valid.forEach(e => {
      const rr1=Math.round(e.rrAmt*.35), rr2=Math.round(e.rrAmt*.35), rr3=e.rrAmt-rr1-rr2;
      const cr1=Math.round(e.crAmt*.35), cr2=Math.round(e.crAmt*.35), cr3=e.crAmt-cr1-cr2;
      schedLines +=
        `\n*Plot ${e.plotNo}*\n`+
        `RR: ₹${Utils.fmtNum(rr1)} · ${s.d10} | ₹${Utils.fmtNum(rr2)} · ${s.d75} | ₹${Utils.fmtNum(rr3)} · ${s.d165}\n`+
        `CR: ₹${Utils.fmtNum(cr1)} · ${s.d10} | ₹${Utils.fmtNum(cr2)} · ${s.d75} | ₹${Utils.fmtNum(cr3)} · ${s.d165}`;
    });
  }

  const msg =
    `🌿 *Padmavati Greens* – Booking Confirmation\n\n`+
    `👤 ${r.customerName} · 📅 ${r.bookingDate}\n`+
    `📝 Manual Receipt: ${r.receiptNo1||'—'} · Mode: ${r.paymentMode}\n\n`+
    plotLines + schedLines +
    `\n\nLayout No. 712 · Survey No. 274 · Yavatmal`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function resetForm() {
  document.getElementById('f-name').value='';
  document.getElementById('f-phone').value='';
  document.getElementById('f-aadhaar').value='';
  document.getElementById('f-address').value='';
  document.getElementById('f-ref').value='';
  document.getElementById('f-receipt1').value='';
  document.getElementById('f-payref').value='';
  document.getElementById('f-remarks').value='';
  document.getElementById('f-token').value='';
  document.getElementById('f-paymode').value='';
  document.getElementById('f-bookdate').value=new Date().toISOString().split('T')[0];
  document.getElementById('plotsContainer').innerHTML='';
  plotEntries=[]; plotCounter=0; lastBooking=null;
  addPlotRow();
  document.getElementById('summaryEmpty').style.display='block';
  document.getElementById('summaryContent').style.display='none';
}
