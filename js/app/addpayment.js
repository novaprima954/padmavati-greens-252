// js/app/addpayment.js — Add Payment (single or multi-plot)
Auth.requireAuth();

let allCustomers   = [];   // all distinct customers [{name, phone, plots:[]}]
let selectedCustomer = null; // one chosen customer
let allocations    = [];   // final per-installment allocations
let totalPayAmt    = 0;
let payAgainst     = '';   // 'CR' or 'RR'

document.addEventListener('DOMContentLoaded', () => {
  Header.init('addpayment');
  document.getElementById('apDate').value = new Date().toISOString().split('T')[0];

  // Live search — debounced
  let timer = null;
  const nameEl = document.getElementById('apCustomerName');
  nameEl.addEventListener('input', () => {
    clearTimeout(timer);
    const v = nameEl.value.trim();
    if (v.length < 2) { document.getElementById('apCustomerResults').innerHTML = ''; return; }
    timer = setTimeout(searchCustomers, 400);
  });
  nameEl.addEventListener('keydown', e => { if(e.key==='Enter') { clearTimeout(timer); searchCustomers(); } });
  document.getElementById('apSearchBtn').addEventListener('click', () => { clearTimeout(timer); searchCustomers(); });

  // Step 2
  document.getElementById('apChangeCustomer').addEventListener('click', resetToStep1);

  // Receipt → mode auto-detect
  const rcptEl = document.getElementById('apManualRcpt');
  const modeEl = document.getElementById('apMode');
  rcptEl.addEventListener('input', () => {
    const det = Utils.receiptToMode(rcptEl.value);
    if (det && !modeEl.value) modeEl.value = det;
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

  document.getElementById('apPreviewBtn').addEventListener('click', buildPreview);
  document.getElementById('apEditPayment').addEventListener('click', () => { show('step2'); hide('step3'); });
  document.getElementById('apSaveBtn').addEventListener('click', savePayment);
  document.getElementById('apNewPayment').addEventListener('click', () => { resetToStep1(); });
});

// ── STEP 1: Search & pick customer ───────────────
async function searchCustomers() {
  const name = document.getElementById('apCustomerName').value.trim();
  if (!name) return;
  const res = document.getElementById('apCustomerResults');
  res.innerHTML = '<div class="loading-block"><div class="spinner"></div>Searching…</div>';
  try {
    const data = await API.get({ action:'getCustomerPlots', name });
    if (data.error) throw new Error(data.error);

    // Group plots by unique customer (name + phone)
    const map = new Map();
    data.plots.forEach(p => {
      const key = (p['Customer Full Name']||'').toLowerCase().trim() + '|' + (p['Phone Number']||'');
      if (!map.has(key)) map.set(key, { name: p['Customer Full Name'], phone: p['Phone Number']||'', plots: [] });
      map.get(key).plots.push(p);
    });
    allCustomers = [...map.values()];
    renderCustomerList(allCustomers);
  } catch(e) {
    res.innerHTML = `<div class="empty-state" style="padding:16px 0;"><p>${e.message}</p></div>`;
  }
}

function renderCustomerList(customers) {
  const res = document.getElementById('apCustomerResults');
  if (!customers.length) { res.innerHTML = '<div class="empty-state" style="padding:16px 0;"><p>No customers found</p></div>'; return; }

  res.innerHTML = `
    <div class="ap-cust-list-title">${customers.length} customer${customers.length>1?'s':''} found — select one:</div>
    ${customers.map((cu, i) => `
      <div class="ap-cust-row" data-idx="${i}">
        <div class="ap-cust-row-info">
          <div class="ap-cust-row-name">${cu.name}</div>
          <div class="ap-cust-row-phone">${cu.phone} &nbsp;·&nbsp; ${cu.plots.length} plot${cu.plots.length>1?'s':''}</div>
        </div>
        <div class="ap-cust-row-plots">${cu.plots.map(p=>`<span class="ap-mini-plot">Plot ${p['Plot No']}</span>`).join('')}</div>
        <button class="btn-select-cust" data-idx="${i}">Select →</button>
      </div>`).join('')}`;

  res.querySelectorAll('.btn-select-cust').forEach(btn => {
    btn.addEventListener('click', () => selectCustomer(allCustomers[parseInt(btn.dataset.idx)]));
  });
}

function selectCustomer(customer) {
  selectedCustomer = customer;
  // Show plot checkboxes for this customer
  const res = document.getElementById('apCustomerResults');
  res.innerHTML = `
    <div class="ap-found-header">
      <span class="ap-found-name">${customer.name}</span>
      <span class="ap-found-count">${customer.phone}</span>
      <button class="btn-back-sm" id="apChangeCust2">← Back</button>
    </div>
    <div class="ap-plot-select-hint">Select plots to include in this payment:</div>
    <div class="ap-plots-list">
      ${customer.plots.map((p,i) => {
        const rrAmt = Number(p['RR Amount'])||0, crAmt = Number(p['CR Amount'])||0;
        const rrBal = Math.max(0, rrAmt - p.rrPaid), crBal = Math.max(0, crAmt - p.crPaid);
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

  document.getElementById('apChangeCust2').addEventListener('click', () => {
    selectedCustomer = null;
    renderCustomerList(allCustomers);
  });

  document.getElementById('apSelectDone').addEventListener('click', () => {
    const checked = [...document.querySelectorAll('.ap-plot-check:checked')]
      .map(cb => selectedCustomer.plots[parseInt(cb.value)]);
    if (!checked.length) { Utils.toast('Select at least one plot', 'err'); return; }
    selectedCustomer.selectedPlots = checked;

    document.getElementById('apCustomerBanner').innerHTML = `
      <span class="ap-cust-name">${customer.name}</span>
      <span class="ap-cust-plots">${checked.map(p=>'Plot '+p['Plot No']).join(' · ')}</span>`;
    show('step2'); hide('step1');
  });
}

// ── STEP 2 → STEP 3: Build preview ───────────────
function buildPreview() {
  const totalAmt = parseFloat(document.getElementById('apTotalAmount').value);
  const mode     = document.getElementById('apMode').value;
  if (!totalAmt || totalAmt <= 0) { Utils.toast('Enter a valid amount', 'err'); return; }
  if (!mode)                      { Utils.toast('Select payment mode', 'err'); return; }

  payAgainst  = mode === 'Cash' ? 'CR' : 'RR';
  totalPayAmt = totalAmt;
  const amtKey  = payAgainst === 'CR' ? 'CR Amount' : 'RR Amount';
  const paidKey = payAgainst === 'CR' ? 'crPaid'    : 'rrPaid';
  const plots   = selectedCustomer.selectedPlots;

  // Build installment slots per plot
  // slot: {plotNo, receiptNo, customerName, part, gross, alreadyPaid, netDue, dueDate, dueDateMs}
  const slots = [];
  plots.forEach(p => {
    const totalAmt_p = Number(p[amtKey]) || 0;
    const paid       = Number(p[paidKey]) || 0;
    const p1 = Math.round(totalAmt_p * .35);
    const p2 = Math.round(totalAmt_p * .35);
    const p3 = totalAmt_p - p1 - p2;
    const bd = parseDateIN(p['Booking Date']);
    const grossParts = [p1, p2, p3];
    const offsets    = [10, 75, 165];

    // Apply spill-over to find already-paid per part
    const nets = Utils.calcNetDue(grossParts.map(g => ({gross:g})), paid);

    grossParts.forEach((gross, i) => {
      const dueDate  = addDays(bd, offsets[i]);
      const dueDateMs = dueDate ? dueDate.getTime() : 0;
      slots.push({
        plotNo:       p['Plot No'],
        receiptNo:    p['Receipt No'],
        customerName: p['Customer Full Name'],
        bookingDate:  p['Booking Date'],
        part:         i + 1,
        gross,
        alreadyPaid:  gross - nets[i].netDue,
        netDue:       nets[i].netDue,
        dueDate,
        dueDateMs,
        dueDateStr:   fmtDate(dueDate),
        allocated:    0
      });
    });
  });

  // Filter out fully paid slots
  const openSlots = slots.filter(s => s.netDue > 0);

  // Sort: by dueDate asc, then by bookingDate asc (older booking first), then plotNo
  openSlots.sort((a, b) => {
    if (a.dueDateMs !== b.dueDateMs) return a.dueDateMs - b.dueDateMs;
    const bdA = parseDateIN(a.bookingDate), bdB = parseDateIN(b.bookingDate);
    const bdMs = (bdA ? bdA.getTime() : 0) - (bdB ? bdB.getTime() : 0);
    if (bdMs !== 0) return bdMs;
    return String(a.plotNo).localeCompare(String(b.plotNo));
  });

  // Distribute with equal-split for same-date groups
  let remaining = totalAmt;
  let i = 0;
  while (i < openSlots.length && remaining > 0.5) {
    // Collect all slots with same due date
    const sameDateSlots = [openSlots[i]];
    let j = i + 1;
    while (j < openSlots.length && openSlots[j].dueDateMs === openSlots[i].dueDateMs) {
      sameDateSlots.push(openSlots[j]); j++;
    }
    // Total due in this date group
    const groupDue = sameDateSlots.reduce((s, sl) => s + sl.netDue, 0);
    const toGroup  = Math.min(remaining, groupDue);
    remaining -= toGroup;

    if (sameDateSlots.length === 1) {
      // Single plot for this date — just allocate
      sameDateSlots[0].allocated = toGroup;
    } else {
      // Equal split across same-date slots, capped at each slot's netDue
      const perSlot = toGroup / sameDateSlots.length;
      let leftover = 0;
      sameDateSlots.forEach(sl => {
        const give = Math.min(sl.netDue, perSlot + leftover);
        const actual = Math.min(give, sl.netDue);
        leftover = give - actual;
        sl.allocated = Math.round(actual);
      });
      // Assign any leftover from capping to first slot that can absorb it
      if (leftover > 0.5) {
        const absorber = sameDateSlots.find(sl => sl.allocated < sl.netDue);
        if (absorber) absorber.allocated += Math.round(leftover);
      }
      // Fix rounding so group total is exact
      const allocTotal = sameDateSlots.reduce((s, sl) => s + sl.allocated, 0);
      const diff = Math.round(toGroup) - allocTotal;
      if (diff !== 0) sameDateSlots[0].allocated += diff;
    }
    i = j;
  }

  allocations = openSlots;
  renderPreview(openSlots, totalAmt, mode);
  show('step3'); hide('step2');
}

function renderPreview(slots, totalAmt, mode) {
  const against = payAgainst;
  document.getElementById('apDistSummary').innerHTML = `
    <div class="dist-sum-row"><span>Total payment</span><strong>₹${Utils.fmtNum(totalAmt)}</strong></div>
    <div class="dist-sum-row"><span>Mode</span><strong>${mode}</strong></div>
    <div class="dist-sum-row"><span>Against</span><strong><span class="badge ${against==='CR'?'badge-booked':'badge-avail'}">${against}</span></strong></div>
    <div class="dist-sum-row"><span>Installments covered</span><strong>${slots.filter(s=>s.allocated>0).length}</strong></div>`;

  // Explanation text
  const explainDiv = document.getElementById('apDistExplain');
  if (explainDiv) {
    const sameDateGroups = [...new Set(slots.map(s=>s.dueDateStr))];
    let expText = `Payments are applied to the earliest due installment first (oldest booking date gets priority). `;
    if (sameDateGroups.length < slots.length) expText += `When multiple plots share the same due date, the payment is split equally between them.`;
    explainDiv.textContent = expText;
  }

  // Build table — group by plot, show installment rows
  const byPlot = {};
  slots.forEach(s => {
    if (!byPlot[s.plotNo]) byPlot[s.plotNo] = { plotNo:s.plotNo, receiptNo:s.receiptNo, customerName:s.customerName, slots:[] };
    byPlot[s.plotNo].slots.push(s);
  });

  let tableHTML = `
    <div class="dist-table-title">
      Distribution breakdown
      <span style="font-size:.72rem;color:var(--grey);font-weight:400;"> — edit amounts if needed (total must equal ₹${Utils.fmtNum(totalAmt)})</span>
    </div>
    <table class="data-table dist-alloc-table">
      <thead>
        <tr>
          <th>Plot</th><th>Installment</th><th>Due Date</th>
          <th>Inst. Amount</th><th>Already Paid</th><th>Net Due</th>
          <th style="width:130px;">Allocating (₹)</th>
        </tr>
      </thead>
      <tbody id="distAllocBody">`;

  let rowIdx = 0;
  Object.values(byPlot).forEach(plot => {
    plot.slots.forEach(s => {
      const pctLabels = ['Part 1 (35%)','Part 2 (35%)','Part 3 (30%)'];
      tableHTML += `<tr class="${s.allocated>0?'row-upcoming':''}">
        <td><strong>Plot ${s.plotNo}</strong></td>
        <td>${pctLabels[s.part-1]}</td>
        <td>${s.dueDateStr}</td>
        <td>₹${Utils.fmtNum(s.gross)}</td>
        <td style="color:${s.alreadyPaid>0?'#2e7d32':'var(--grey)};">₹${Utils.fmtNum(s.alreadyPaid)}</td>
        <td class="${s.netDue>0?'amt-due':'amt-ok'}">₹${Utils.fmtNum(s.netDue)}</td>
        <td><input type="number" class="alloc-input" data-row="${rowIdx}" value="${s.allocated}" min="0"
          style="width:120px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:.85rem;"></td>
      </tr>`;
      rowIdx++;
    });
  });

  tableHTML += `
    <tr class="total-row" id="distTotalRow">
      <td colspan="6"><strong>Total allocated</strong></td>
      <td id="distTotalAmt"><strong>—</strong></td>
    </tr>
  </tbody></table>`;

  document.getElementById('apDistTable').innerHTML = tableHTML;

  // Wire up input changes
  document.querySelectorAll('.alloc-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.row);
      allocations[idx].allocated = parseFloat(inp.value)||0;
      updateTotalDisplay(totalAmt);
    });
  });

  updateTotalDisplay(totalAmt);
}

function updateTotalDisplay(totalAmt) {
  const allocated = allocations.reduce((s,a) => s + (a.allocated||0), 0);
  const diff      = Math.round((totalAmt - allocated) * 100) / 100;
  const ok        = Math.abs(diff) < 1;
  const el        = document.getElementById('distTotalAmt');
  if (el) el.innerHTML = `<strong class="${ok?'bal-ok':'bal-err'}">₹${Utils.fmtNum(allocated)} ${ok?'✓':('— ₹'+Utils.fmtNum(Math.abs(diff))+' '+(diff>0?'unallocated':'over'))}</strong>`;
  const btn = document.getElementById('apSaveBtn');
  if (btn) { btn.disabled = !ok; btn.style.opacity = ok?'1':'0.5'; }
}

// ── STEP 3 → STEP 4: Save ────────────────────────
async function savePayment() {
  const totalAmt  = parseFloat(document.getElementById('apTotalAmount').value);
  const allocated = allocations.reduce((s,a) => s + (a.allocated||0), 0);
  if (Math.abs(totalAmt - allocated) >= 1) { Utils.toast('Allocation must equal payment amount', 'err'); return; }

  // Aggregate per receiptNo (sum across parts)
  const byReceipt = {};
  allocations.filter(a => a.allocated > 0).forEach(a => {
    if (!byReceipt[a.receiptNo]) byReceipt[a.receiptNo] = { receiptNo:a.receiptNo, plotNo:a.plotNo, customerName:a.customerName, amount:0, against:payAgainst };
    byReceipt[a.receiptNo].amount += a.allocated;
  });
  const finalAllocs = Object.values(byReceipt);

  const btn = document.getElementById('apSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const res = await API.post({
      action: 'addMultiPayment',
      allocations: finalAllocs,
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
    <div class="confirm-banner">Payment saved — ${res.saved.length} plot${res.saved.length>1?'s':''} updated</div>
    <table class="data-table" style="margin-top:16px;font-size:.82rem;">
      <thead><tr><th>Plot</th><th>Receipt</th><th>Amount</th><th>Against</th></tr></thead>
      <tbody>
        ${res.saved.map(s=>`<tr>
          <td>Plot ${s.plotNo}</td>
          <td style="font-weight:600;color:var(--forest);">${s.receiptNo}</td>
          <td><strong>₹${Utils.fmtNum(s.amount)}</strong></td>
          <td><span class="badge ${s.against==='CR'?'badge-booked':'badge-avail'}">${s.against}</span></td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="2"><strong>Total</strong></td>
          <td><strong>₹${Utils.fmtNum(res.totalSaved)}</strong></td><td></td>
        </tr>
      </tbody>
    </table>`;
}

// ── Helpers ───────────────────────────────────────
function resetToStep1() {
  allCustomers = []; selectedCustomer = null; allocations = [];
  ['apCustomerName','apTotalAmount','apManualRcpt','apReference','apNotes'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('apMode').value = '';
  document.getElementById('apCustomerResults').innerHTML = '';
  document.getElementById('apDate').value = new Date().toISOString().split('T')[0];
  show('step1'); hide('step2'); hide('step3'); hide('step4');
}
function show(id) { const el=document.getElementById(id); if(el) el.style.display='block'; }
function hide(id) { const el=document.getElementById(id); if(el) el.style.display='none'; }
function parseDateIN(str) {
  if (!str) return null;
  const p = String(str).split('/');
  if (p.length===3) return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
  const d = new Date(str); return isNaN(d)?null:d;
}
function addDays(d,n)  { if(!d) return null; const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function fmtDate(d)    { if(!d) return '—'; return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}); }
