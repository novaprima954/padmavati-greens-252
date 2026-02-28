// js/app/addpayment.js  — Add Payment (single or multi-plot)
Auth.requireAuth();

let customerPlots = [];   // all plots for found customer
let selectedPlots = [];   // plots selected for this payment
let allocations   = [];   // [{receiptNo, plotNo, customerName, amount, against}, ...]

document.addEventListener('DOMContentLoaded', () => {
  Header.init('addpayment');

  // Set today's date
  document.getElementById('apDate').value = new Date().toISOString().split('T')[0];

  // Step 1
  document.getElementById('apSearchBtn').addEventListener('click', searchCustomer);
  document.getElementById('apCustomerName').addEventListener('keydown', e => { if(e.key==='Enter') searchCustomer(); });

  // Step 2
  document.getElementById('apChangeCustomer').addEventListener('click', resetToStep1);
  document.getElementById('apPreviewBtn').addEventListener('click', buildPreview);

  // Receipt → mode auto-detect
  const rcptEl = document.getElementById('apManualRcpt');
  const modeEl = document.getElementById('apMode');
  rcptEl.addEventListener('input', () => {
    const det = Utils.receiptToMode(rcptEl.value);
    if (det && modeEl.value === '') { modeEl.value = det; }
  });
  rcptEl.addEventListener('blur', () => {
    const det = Utils.receiptToMode(rcptEl.value);
    if (det && modeEl.value && modeEl.value !== det)
      Utils.toast(`Receipt suggests ${det} — mode is ${modeEl.value}`, 'err');
  });
  modeEl.addEventListener('change', () => {
    const det = Utils.receiptToMode(rcptEl.value);
    if (rcptEl.value && det && modeEl.value && modeEl.value !== det)
      Utils.toast(`Receipt suggests ${det} — mode is ${modeEl.value}`, 'err');
  });

  // Step 3
  document.getElementById('apEditPayment').addEventListener('click', () => {
    show('step2'); hide('step3');
  });
  document.getElementById('apSaveBtn').addEventListener('click', savePayment);

  // Step 4
  document.getElementById('apNewPayment').addEventListener('click', () => {
    resetToStep1();
    show('step1'); hide('step2'); hide('step3'); hide('step4');
  });
});

// ── STEP 1: Search ────────────────────────────────
async function searchCustomer() {
  const name = document.getElementById('apCustomerName').value.trim();
  if (!name) { Utils.toast('Enter customer name', 'err'); return; }

  const res = document.getElementById('apCustomerResults');
  res.innerHTML = '<div class="loading-block"><div class="spinner"></div>Searching…</div>';

  try {
    const data = await API.get({ action:'getCustomerPlots', name });
    if (data.error) throw new Error(data.error);
    customerPlots = data.plots;
    renderCustomerPlots(data.plots);
  } catch(e) {
    res.innerHTML = `<div class="empty-state" style="padding:20px 0;"><p>${e.message}</p></div>`;
  }
}

function renderCustomerPlots(plots) {
  const res = document.getElementById('apCustomerResults');
  const customerName = plots[0]['Customer Full Name'];

  res.innerHTML = `
    <div class="ap-found-header">
      <span class="ap-found-name">${customerName}</span>
      <span class="ap-found-count">${plots.length} plot${plots.length>1?'s':''}</span>
    </div>
    <div class="ap-plot-select-hint">Select plots to include in this payment:</div>
    <div class="ap-plots-list" id="apPlotsList">
      ${plots.map((p,i) => {
        const rrAmt=Number(p['RR Amount'])||0, crAmt=Number(p['CR Amount'])||0;
        const rrBal=Math.max(0,rrAmt-p.rrPaid), crBal=Math.max(0,crAmt-p.crPaid);
        return `<label class="ap-plot-item" for="apl-${i}">
          <input type="checkbox" id="apl-${i}" value="${i}" checked class="ap-plot-check">
          <div class="ap-plot-info">
            <div class="ap-plot-no">Plot ${p['Plot No']}</div>
            <div class="ap-plot-receipt">${p['Receipt No']}</div>
          </div>
          <div class="ap-plot-bals">
            <span class="ap-bal-chip rr-chip">RR bal ₹${Utils.fmtNum(rrBal)}</span>
            <span class="ap-bal-chip cr-chip">CR bal ₹${Utils.fmtNum(crBal)}</span>
          </div>
        </label>`;
      }).join('')}
    </div>
    <button class="btn-submit" id="apSelectDone" style="margin-top:12px;width:auto;padding:10px 28px;">Continue →</button>`;

  document.getElementById('apSelectDone').addEventListener('click', () => {
    const checked = [...document.querySelectorAll('.ap-plot-check:checked')].map(cb => customerPlots[parseInt(cb.value)]);
    if (!checked.length) { Utils.toast('Select at least one plot', 'err'); return; }
    selectedPlots = checked;
    document.getElementById('apCustomerBanner').innerHTML = `
      <span class="ap-cust-name">${customerName}</span>
      <span class="ap-cust-plots">${checked.map(p=>'Plot '+p['Plot No']).join(' · ')}</span>`;
    show('step2'); hide('step1');
  });
}

// ── STEP 2 → STEP 3: Preview ──────────────────────
function buildPreview() {
  const totalAmt = parseFloat(document.getElementById('apTotalAmount').value);
  const mode     = document.getElementById('apMode').value;
  if (!totalAmt || totalAmt <= 0) { Utils.toast('Enter a valid amount', 'err'); return; }
  if (!mode)                      { Utils.toast('Select payment mode', 'err'); return; }

  const against = mode === 'Cash' ? 'CR' : 'RR';
  const amtKey  = against === 'CR' ? 'CR Amount' : 'RR Amount';
  const paidKey = against === 'CR' ? 'crPaid'    : 'rrPaid';

  // Build per-plot installment slots: [{plotIdx, part, gross, paid_so_far, dueDate}]
  // Group by due date, equal split within same date
  const slots = [];
  selectedPlots.forEach((p, idx) => {
    const amt = Number(p[amtKey]) || 0;
    const p1 = Math.round(amt * .35), p2 = Math.round(amt * .35), p3 = amt - p1 - p2;
    const bd = parseDateIN(p['Booking Date']);
    const dates = [addDays(bd, 10), addDays(bd, 75), addDays(bd, 165)];
    const grossParts = [p1, p2, p3];
    grossParts.forEach((g, pi) => {
      slots.push({
        plotIdx: idx, plotNo: p['Plot No'], receiptNo: p['Receipt No'],
        customerName: p['Customer Full Name'],
        part: pi+1, gross: g,
        dueDate: dates[pi], dueDateStr: fmtDate(dates[pi]),
        paidSoFar: 0  // will compute below
      });
    });
  });

  // Compute cumulative paid per plot for this category using spill-over
  selectedPlots.forEach((p, idx) => {
    const totalPaid = Number(p[paidKey]) || 0;
    const plotSlots = slots.filter(s => s.plotIdx === idx);
    let rem = totalPaid;
    plotSlots.forEach(s => {
      const absorbed = Math.min(rem, s.gross);
      s.paidSoFar = absorbed;
      rem -= absorbed;
    });
  });

  // Sort slots by due date, then plot index (tiebreaker)
  slots.sort((a, b) => {
    const dt = (a.dueDate||new Date(0)) - (b.dueDate||new Date(0));
    if (dt !== 0) return dt;
    return a.plotIdx - b.plotIdx;
  });

  // Distribute payment across slots with equal-split for same dates
  let remaining = totalAmt;
  const groups = groupByDate(slots);
  groups.forEach(group => {
    if (remaining <= 0) return;
    // Total remaining due across this group
    const groupDue = group.reduce((s, sl) => s + Math.max(0, sl.gross - sl.paidSoFar), 0);
    if (groupDue <= 0) return;
    const toDistribute = Math.min(remaining, groupDue);
    remaining -= toDistribute;
    // Equal split proportionally within group
    group.forEach(sl => {
      const slDue = Math.max(0, sl.gross - sl.paidSoFar);
      sl.allocated = slDue > 0 ? Math.round(toDistribute * slDue / groupDue) : 0;
    });
    // Fix rounding
    const allocTotal = group.reduce((s, sl) => s + (sl.allocated||0), 0);
    const diff = Math.round(toDistribute) - allocTotal;
    const firstWithAlloc = group.find(sl => (sl.allocated||0) > 0);
    if (firstWithAlloc && diff !== 0) firstWithAlloc.allocated += diff;
  });
  // Remaining unmatched (over-payment)
  if (remaining > 0) {
    const lastSlot = slots[slots.length - 1];
    if (lastSlot) lastSlot.allocated = (lastSlot.allocated||0) + Math.round(remaining);
  }

  // Build allocations per plot (sum across parts)
  const plotAlloc = {};
  slots.forEach(s => {
    if (!plotAlloc[s.plotIdx]) plotAlloc[s.plotIdx] = { plotNo:s.plotNo, receiptNo:s.receiptNo, customerName:s.customerName, amount:0, against };
    plotAlloc[s.plotIdx].amount += (s.allocated||0);
  });
  allocations = Object.values(plotAlloc).filter(a => a.amount > 0);

  renderPreview(allocations, slots, totalAmt, against, mode);
  show('step3'); hide('step2');
}

function groupByDate(slots) {
  const map = new Map();
  slots.forEach(s => {
    const key = s.dueDateStr || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  });
  return [...map.values()];
}

function renderPreview(allocs, slots, totalAmt, against, mode) {
  const distSummary = document.getElementById('apDistSummary');
  const distTable   = document.getElementById('apDistTable');
  const distFooter  = document.getElementById('apDistFooter');

  distSummary.innerHTML = `
    <div class="dist-sum-row">
      <span>Total payment</span><strong>₹${Utils.fmtNum(totalAmt)}</strong>
    </div>
    <div class="dist-sum-row">
      <span>Mode</span><strong>${mode}</strong>
    </div>
    <div class="dist-sum-row">
      <span>Against</span>
      <strong><span class="badge ${against==='CR'?'badge-booked':'badge-avail'}">${against}</span></strong>
    </div>
    <div class="dist-sum-row">
      <span>Split across</span><strong>${allocs.length} plot${allocs.length>1?'s':''}</strong>
    </div>`;

  // Editable allocation table
  distTable.innerHTML = `
    <div class="dist-table-title">Allocation per plot <span style="font-size:.72rem;color:var(--grey);font-weight:400;">(edit amounts if needed — total must equal ₹${Utils.fmtNum(totalAmt)})</span></div>
    <table class="data-table dist-alloc-table">
      <thead><tr><th>Plot</th><th>Receipt</th><th>Against</th><th style="width:160px;">Amount (₹)</th><th>RR/CR Balance</th></tr></thead>
      <tbody id="distAllocBody"></tbody>
    </table>
    <div class="dist-total-row" id="distTotalRow"></div>`;

  renderAllocBody(allocs, totalAmt, against);
  updateDistFooter(allocs, totalAmt);
}

function renderAllocBody(allocs, totalAmt, against) {
  const tbody = document.getElementById('distAllocBody');
  if (!tbody) return;
  tbody.innerHTML = allocs.map((a, i) => {
    const p = selectedPlots.find(pl => pl['Receipt No'] === a.receiptNo);
    const rrBal = p ? Math.max(0, (Number(p['RR Amount'])||0) - p.rrPaid) : 0;
    const crBal = p ? Math.max(0, (Number(p['CR Amount'])||0) - p.crPaid) : 0;
    const bal   = against === 'CR' ? crBal : rrBal;
    return `<tr>
      <td><strong>Plot ${a.plotNo}</strong></td>
      <td style="font-size:.75rem;">${a.receiptNo}</td>
      <td><span class="badge ${against==='CR'?'badge-booked':'badge-avail'}">${against}</span></td>
      <td><input type="number" class="alloc-input" data-idx="${i}" value="${a.amount}" min="0" style="width:140px;padding:6px 10px;border:1.5px solid var(--border);border-radius:6px;font-size:.88rem;"></td>
      <td style="font-size:.8rem;color:${bal>0?'var(--red)':'#2e7d32'};">₹${Utils.fmtNum(bal)}</td>
    </tr>`;
  }).join('');

  // Live update on edit
  tbody.querySelectorAll('.alloc-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.idx);
      allocations[idx].amount = parseFloat(inp.value) || 0;
      updateDistFooter(allocations, totalAmt);
    });
  });
}

function updateDistFooter(allocs, totalAmt) {
  const allocated = allocs.reduce((s, a) => s + (a.amount||0), 0);
  const diff      = Math.round((totalAmt - allocated) * 100) / 100;
  const ok        = Math.abs(diff) < 1;
  const footer    = document.getElementById('distTotalRow');
  const saveBtn   = document.getElementById('apSaveBtn');
  if (!footer) return;
  footer.innerHTML = `
    <span>Allocated: <strong>₹${Utils.fmtNum(allocated)}</strong></span>
    <span>Total: <strong>₹${Utils.fmtNum(totalAmt)}</strong></span>
    <span class="${ok?'bal-ok':'bal-err'}">${ok ? '✓ Balanced' : `Difference: ₹${Utils.fmtNum(Math.abs(diff))} ${diff>0?'unallocated':'over-allocated'}`}</span>`;
  saveBtn.disabled = !ok;
  saveBtn.style.opacity = ok ? '1' : '0.5';
}

// ── STEP 3 → STEP 4: Save ────────────────────────
async function savePayment() {
  const totalAmt = parseFloat(document.getElementById('apTotalAmount').value);
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  if (Math.abs(totalAmt - allocated) >= 1) {
    Utils.toast('Allocation total must equal payment amount', 'err'); return;
  }

  const btn = document.getElementById('apSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const res = await API.post({
      action: 'addMultiPayment',
      allocations,
      shared: {
        paymentDate:     document.getElementById('apDate').value,
        manualReceiptNo: document.getElementById('apManualRcpt').value.trim(),
        mode:            document.getElementById('apMode').value,
        reference:       document.getElementById('apReference').value.trim(),
        notes:           document.getElementById('apNotes').value.trim(),
      }
    });
    if (res.error) throw new Error(res.error);
    renderConfirmation(res);
    show('step4'); hide('step3');
  } catch(e) {
    Utils.toast(e.message, 'err');
    btn.disabled = false; btn.textContent = '💾 Save Payment';
  }
}

function renderConfirmation(res) {
  document.getElementById('apConfirmation').innerHTML = `
    <div class="confirm-banner">Payment saved successfully — ${res.saved.length} plot${res.saved.length>1?'s':''} updated</div>
    <table class="data-table" style="margin-top:16px;font-size:.82rem;">
      <thead><tr><th>Plot</th><th>Receipt</th><th>Amount</th><th>Against</th></tr></thead>
      <tbody>
        ${res.saved.map(s => `<tr>
          <td>Plot ${s.plotNo}</td>
          <td><a href="status.html?receipt=${s.receiptNo}" style="color:var(--forest);font-weight:600;">${s.receiptNo}</a></td>
          <td><strong>₹${Utils.fmtNum(s.amount)}</strong></td>
          <td><span class="badge ${s.against==='CR'?'badge-booked':'badge-avail'}">${s.against}</span></td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="2"><strong>Total</strong></td>
          <td><strong>₹${Utils.fmtNum(res.totalSaved)}</strong></td>
          <td></td>
        </tr>
      </tbody>
    </table>`;
}

// ── Helpers ───────────────────────────────────────
function resetToStep1() {
  customerPlots = []; selectedPlots = []; allocations = [];
  document.getElementById('apCustomerName').value = '';
  document.getElementById('apCustomerResults').innerHTML = '';
  document.getElementById('apTotalAmount').value = '';
  document.getElementById('apMode').value = '';
  document.getElementById('apManualRcpt').value = '';
  document.getElementById('apReference').value = '';
  document.getElementById('apNotes').value = '';
  show('step1'); hide('step2'); hide('step3'); hide('step4');
}

function show(id) { document.getElementById(id).style.display = 'block'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

function parseDateIN(str) {
  if (!str) return null;
  const p = String(str).split('/');
  if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  const d = new Date(str); return isNaN(d) ? null : d;
}
function addDays(d, n) { if(!d) return null; const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function fmtDate(d)    { if(!d) return '—'; return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}); }
