// js/app/reports.js
Auth.requireAuth();

let currentReport = null;
let duesData = null;
let excessData = null;

document.addEventListener('DOMContentLoaded', () => {
  Header.init('reports');

  document.querySelectorAll('.report-card').forEach(card => {
    card.addEventListener('click', () => openReport(card.dataset.report));
  });

  document.getElementById('btnBack').addEventListener('click', () => {
    document.getElementById('reportCards').style.display = 'grid';
    document.getElementById('reportView').style.display  = 'none';
    currentReport = null;
  });

  document.getElementById('ledgerSearchBtn').addEventListener('click', () => loadLedger());
  document.getElementById('ledgerName').addEventListener('keydown', e => { if(e.key==='Enter') loadLedger(); });

  document.getElementById('duesLoadBtn').addEventListener('click', () => loadDues());
  document.getElementById('excessLoadBtn').addEventListener('click', () => loadExcess());
  document.getElementById('paymentsLoadBtn').addEventListener('click', () => loadPayments());
  document.getElementById('referredLoadBtn').addEventListener('click', () => loadReferred());
  document.getElementById('receiptsLoadBtn').addEventListener('click', () => loadReceipts());
  document.getElementById('ratecompLoadBtn').addEventListener('click', () => loadRateComp());
  document.getElementById('custLoadBtn').addEventListener('click', () => loadCustomers());
  document.getElementById('deedLoadBtn').addEventListener('click', () => loadDeed());
  document.getElementById('deedFilter').addEventListener('change', () => loadDeed());
  document.getElementById('custExportBtn').addEventListener('click', () => exportCustomersExcel());
  document.getElementById('custSort').addEventListener('change', renderCustomers);
  document.getElementById('custSplit').addEventListener('change', renderCustomers);

  // Close referred dropdown when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('#refMultiselect')) closeRefDropdown();
  });

  // Show/hide upcoming days when type changes
  document.getElementById('duesType').addEventListener('change', () => {
    const v = document.getElementById('duesType').value;
    document.getElementById('upcomingDaysGroup').style.display =
      (v==='overdue') ? 'none' : 'flex';
  });

  // Dues live filter
  document.getElementById('duesPart').addEventListener('change', renderDues);
  document.getElementById('duesType').addEventListener('change', renderDues);
  document.getElementById('upcomingDays').addEventListener('change', renderDues);

  // Excess live filter
  document.getElementById('excessFilter').addEventListener('change', renderExcess);
});

function openReport(report) {
  currentReport = report;
  document.getElementById('reportCards').style.display = 'none';
  document.getElementById('reportView').style.display  = 'block';
  document.getElementById('reportOutput').innerHTML    = '';

  document.getElementById('ledgerControls').style.display    = 'none';
  document.getElementById('duesControls').style.display      = 'none';
  document.getElementById('excessControls').style.display    = 'none';
  document.getElementById('referredControls').style.display  = 'none';
  document.getElementById('receiptsControls').style.display  = 'none';
  document.getElementById('ratecompControls').style.display  = 'none';
  document.getElementById('customersControls').style.display = 'none';
  document.getElementById('deedControls').style.display      = 'none';
  document.getElementById('custExportBtn').style.display     = 'none';

  const titles = {
    ledger:   ['Customer Ledger', 'Search by customer name to see all plots and balances'],
    dues:     ['Installment Due Report', 'All customers with outstanding installments'],
    excess:   ['Excess Payment Report', 'Customers where paid amount exceeds category total'],
    payments: ['Payment Receipt Report', 'All payment receipts filtered by date range'],
    referred:  ['Referred By Report', 'All bookings grouped by referral source'],
    receipts:  ['Receipt Number Audit', 'Cash and Bank series — gaps, cancelled and active receipts'],
    ratecomp:   ['Rate Comparison', 'Zone rate vs booked rate — discount, premium and revenue impact per plot'],
    customers:  ['Customer Summary', 'All active customers — payments received, total amount and outstanding due'],
    deed:       ['Sale Deed Eligible', 'Agreement and sale deed tracker — eligibility, status and action'],
  };
  document.getElementById('reportViewTitle').textContent = titles[report][0];
  document.getElementById('reportViewSub').textContent   = titles[report][1];

  if (report==='ledger') {
    document.getElementById('ledgerControls').style.display = 'flex';
    document.getElementById('ledgerName').focus();
  } else if (report==='dues') {
    document.getElementById('duesControls').style.display = 'block';
    loadDues();
  } else if (report==='excess') {
    document.getElementById('excessControls').style.display = 'block';
    loadExcess();
  } else if (report==='payments') {
    document.getElementById('paymentsControls').style.display = 'block';
  } else if (report==='referred') {
    document.getElementById('referredControls').style.display = 'block';
    initReferredDropdown();
  } else if (report==='receipts') {
    document.getElementById('receiptsControls').style.display = 'block';
    loadReceipts();
  } else if (report==='ratecomp') {
    document.getElementById('ratecompControls').style.display = 'block';
    initRateComp();
  } else if (report==='customers') {
    document.getElementById('customersControls').style.display = 'block';
    loadCustomers();
  } else if (report==='deed') {
    document.getElementById('deedControls').style.display = 'block';
    loadDeed();
  }
}

// ── LEDGER ────────────────────────────────────────
async function loadLedger(phone) {
  const name = document.getElementById('ledgerName').value.trim();
  if (!name) { Utils.toast('Enter a customer name','err'); return; }

  const out = document.getElementById('reportOutput');
  out.innerHTML = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';

  try {
    const params = { action:'getReportLedger', name };
    if (phone) params.phone = phone;
    const data = await API.get(params);
    if (data.error) throw new Error(data.error);

    if (data.mode === 'pick') {
      // Multiple distinct customers — show picker
      renderLedgerPicker(data.customers, name);
    } else {
      renderLedger(data);
    }
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><div class="empty-icon">📒</div><p>${e.message}</p></div>`;
  }
}

function renderLedgerPicker(customers, name) {
  const out = document.getElementById('reportOutput');
  document.getElementById('reportViewSub').textContent = customers.length + ' customers found — select one';
  out.innerHTML = `
    <div class="ledger-pick-title">${customers.length} customers match "${name}" — select one to view their ledger:</div>
    ${customers.map((cu,i) => `
      <div class="ap-cust-row" style="cursor:pointer;" data-phone="${cu.phone}">
        <div class="ap-cust-row-info">
          <div class="ap-cust-row-name">${cu.name}</div>
          <div class="ap-cust-row-phone">${cu.phone} &nbsp;·&nbsp; ${cu.plotCount} plot${cu.plotCount>1?'s':''}</div>
        </div>
        <button class="btn-select-cust" data-phone="${cu.phone}">View Ledger →</button>
      </div>`).join('')}`;

  out.querySelectorAll('.btn-select-cust').forEach(btn => {
    btn.addEventListener('click', () => loadLedger(btn.dataset.phone));
  });
}

function renderLedger(data) {
  const { customerName, phone, rows, totals } = data;
  document.getElementById('reportViewSub').textContent =
    `${customerName} · ${phone||''} · ${rows.length} plot${rows.length>1?'s':''}`;

  const pctLabel = ['1 · 35%','2 · 35%','3 · 30%'];

  function instTable(insts, catKey) {
    // catKey: 'rr', 'cr', 'br'
    const cls = {rr:'inst-rr', cr:'inst-cr', br:'inst-br'}[catKey];
    const lbl = catKey.toUpperCase();
    // Compute excess for this category
    const catAmt  = insts.reduce((s,inst) => s + inst[catKey].gross, 0);
    const catPaid = insts.reduce((s,inst) => s + inst[catKey].paid,  0);
    const catExcess = catPaid - catAmt; // positive = excess

    return `<div class="inst-mini ${cls}">
      <div class="inst-mini-title">${lbl} Schedule</div>
      <div class="inst-mini-row hdr"><span>Part</span><span>Due Date</span><span>Total</span><span>Paid</span><span>Due</span></div>
      ${insts.map((inst,i) => {
        const d = inst[catKey];
        const nc = d.due===0 ? 'net-clear' : 'net-due';
        return `<div class="inst-mini-row">
          <span>${pctLabel[i]}</span>
          <span>${inst.dueDate}</span>
          <span>₹${Utils.fmtNum(d.gross)}</span>
          <span style="color:#2e7d32;">₹${Utils.fmtNum(d.paid)}</span>
          <span class="${nc}">₹${Utils.fmtNum(d.due)}</span>
        </div>`;
      }).join('')}
      ${catExcess > 0 ? `<div class="inst-mini-row inst-excess-row">
        <span colspan="2" style="font-weight:700;color:#6a1b9a;">⚠ Excess</span>
        <span></span><span></span>
        <span style="color:#6a1b9a;font-weight:700;">−₹${Utils.fmtNum(catExcess)}</span>
      </div>` : ''}
    </div>`;
  }

  function payHistTable(payments) {
    if (!payments || !payments.length) return '<div style="color:var(--grey);font-size:.8rem;padding:8px 0;">No payments recorded</div>';
    return `<table class="sch-table" style="font-size:.78rem;">
      <thead><tr><th>Date</th><th>Manual Rcpt</th><th>Amount</th><th>Mode</th><th>Against</th><th>Ref</th><th>Notes</th><th>By</th></tr></thead>
      <tbody>
        ${payments.map(p=>`<tr>
          <td>${p.date||'—'}</td>
          <td>${p.receipt||'—'}</td>
          <td><strong>₹${Utils.fmtNum(p.amount)}</strong></td>
          <td>${p.mode}</td>
          <td><span class="badge ${p.against==='CR'?'badge-booked':'badge-avail'}" style="font-size:.65rem;">${p.against}</span></td>
          <td style="font-size:.7rem;">${p.ref||'—'}</td>
          <td style="font-size:.7rem;color:var(--grey);">${p.notes||''}</td>
          <td style="font-size:.7rem;">${p.by||'—'}</td>
        </tr>`).join('')}
        <tr style="background:var(--mist);font-weight:700;">
          <td colspan="2">Total Paid</td>
          <td>₹${Utils.fmtNum(payments.reduce((s,p)=>s+p.amount,0))}</td>
          <td colspan="5"></td>
        </tr>
      </tbody>
    </table>`;
  }

  let html = `
    <div class="ledger-header">
      <div class="ledger-name">${customerName}</div>
      <div class="ledger-sub">${phone||''} · ${rows.length} plot${rows.length>1?'s':''} · ${rows.filter(r=>r.status==='Active').length} active</div>
    </div>`;

  rows.forEach(r => {
    html += `
      <div class="ledger-plot-card">
        <div class="lpc-head">
          <div>
            <span class="lpc-plot">Plot ${r.plotNo}</span>
            <span class="lpc-receipt">${r.receipt}</span>
            ${r.manualReceipt ? `<span class="lpc-receipt" style="margin-left:4px;background:#e8f5e9;color:#2e7d32;">Rcpt #${r.manualReceipt}</span>` : ''}
          </div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span style="font-size:.75rem;color:var(--grey);">${r.bookingDate||''} · ${r.area?r.area+' SqFt':''}</span>
            ${Utils.statusBadge(r.status)}
          </div>
        </div>
        <div class="lpc-rates-bar">
          <span class="lpc-rate-chip lpc-rate-br">BR ₹${r.brRate}/sqft</span>
          <span class="lpc-rate-chip lpc-rate-rr">RR ₹${r.rrRate}/sqft</span>
          <span class="lpc-rate-chip lpc-rate-cr">CR ₹${r.crRate}/sqft</span>
        </div>

        <!-- Balance summary -->
        <div class="lpc-bal-row">
          <div class="lpc-bal-cell lpc-br">
            <div class="lpc-bal-label">BR</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(r.brAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(r.brPaid)}</div>
            <div class="lpc-bal-due ${r.brBal>0?'due-red':r.brBal<0?'due-excess':'due-green'}">${Utils.fmtBal(r.brBal)}</div>
            ${r.brBal<0?`<div style="font-size:.68rem;color:#6a1b9a;font-weight:700;">Excess ₹${Utils.fmtNum(Math.abs(r.brBal))}</div>`:''}
          </div>
          <div class="lpc-bal-cell lpc-rr">
            <div class="lpc-bal-label">RR</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(r.rrAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(r.rrPaid)}</div>
            <div class="lpc-bal-due ${r.rrBal>0?'due-red':r.rrBal<0?'due-excess':'due-green'}">${Utils.fmtBal(r.rrBal)}</div>
            ${r.rrBal<0?`<div style="font-size:.68rem;color:#6a1b9a;font-weight:700;">Excess ₹${Utils.fmtNum(Math.abs(r.rrBal))}</div>`:''}
          </div>
          <div class="lpc-bal-cell lpc-cr">
            <div class="lpc-bal-label">CR</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(r.crAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(r.crPaid)}</div>
            <div class="lpc-bal-due ${r.crBal>0?'due-red':r.crBal<0?'due-excess':'due-green'}">${Utils.fmtBal(r.crBal)}</div>
            ${r.crBal<0?`<div style="font-size:.68rem;color:#6a1b9a;font-weight:700;">Excess ₹${Utils.fmtNum(Math.abs(r.crBal))}</div>`:''}
          </div>
        </div>

        <!-- Installment schedule — BR, RR, CR each with paid/due per part -->
        <div class="lpc-schedule">
          <div class="lpc-sch-title">Installment Schedule (Total · Paid · Due per part)</div>
          <div class="schedule-grid" style="grid-template-columns:repeat(3,1fr);">
            ${instTable(r.installments,'br')}
            ${instTable(r.installments,'rr')}
            ${instTable(r.installments,'cr')}
          </div>
        </div>

        <!-- Payment history -->
        <div class="lpc-schedule" style="border-top:1px solid var(--border);">
          <div class="lpc-sch-title">Payment History (${r.payments?r.payments.length:0} entries)</div>
          ${payHistTable(r.payments)}
        </div>
      </div>`;
  });

  // Grand total
  if (rows.length > 1) {
    html += `
      <div class="ledger-total-card">
        <div class="ltc-title">Grand Total — ${customerName}</div>
        <div class="lpc-bal-row">
          <div class="lpc-bal-cell lpc-br">
            <div class="lpc-bal-label">BR Total</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(totals.brAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(totals.brPaid)}</div>
            <div class="lpc-bal-due ${totals.brBal>0?'due-red':totals.brBal<0?'due-excess':'due-green'}">${Utils.fmtBal(totals.brBal)}</div>
          </div>
          <div class="lpc-bal-cell lpc-rr">
            <div class="lpc-bal-label">RR Total</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(totals.rrAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(totals.rrPaid)}</div>
            <div class="lpc-bal-due ${totals.rrBal>0?'due-red':totals.rrBal<0?'due-excess':'due-green'}">${Utils.fmtBal(totals.rrBal)}</div>
          </div>
          <div class="lpc-bal-cell lpc-cr">
            <div class="lpc-bal-label">CR Total</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(totals.crAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(totals.crPaid)}</div>
            <div class="lpc-bal-due ${totals.crBal>0?'due-red':totals.crBal<0?'due-excess':'due-green'}">${Utils.fmtBal(totals.crBal)}</div>
          </div>
        </div>
      </div>`;
  }

  document.getElementById('reportOutput').innerHTML = html;
}

// ── DUES ──────────────────────────────────────────
async function loadDues() {
  const out = document.getElementById('reportOutput');
  out.innerHTML = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';
  try {
    const data = await API.get({ action:'getReportDues' });
    if (data.error) throw new Error(data.error);
    duesData = data.dues;
    renderDues();
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><p>${e.message}</p></div>`;
  }
}

function renderDues() {
  if (!duesData) return;
  const typeVal   = document.getElementById('duesType').value;
  const daysVal   = parseInt(document.getElementById('upcomingDays').value) || 30;
  const partVal   = document.getElementById('duesPart').value;

  const filtered = duesData.filter(d => {
    const partOk = partVal==='all' || String(d.part)===partVal;
    let typeOk = false;
    if (typeVal==='overdue')  typeOk = d.isOverdue;
    else if (typeVal==='upcoming') typeOk = !d.isOverdue && d.daysFromToday <= daysVal;
    else typeOk = d.isOverdue || (!d.isOverdue && d.daysFromToday <= daysVal);
    return partOk && typeOk;
  });

  const out = document.getElementById('reportOutput');
  if (!filtered.length) {
    out.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No installments matching the selected filter</p></div>';
    document.getElementById('reportViewSub').textContent = '0 results';
    return;
  }

  document.getElementById('reportViewSub').textContent = `${filtered.length} installment${filtered.length>1?'s':''} found`;

  // Group by customer
  const byCustomer = {};
  filtered.forEach(d => {
    const key = d.customerName+'|'+d.phone;
    if (!byCustomer[key]) byCustomer[key] = { name:d.customerName, phone:d.phone, items:[] };
    byCustomer[key].items.push(d);
  });

  let html = `
    <div class="table-wrap">
      <table class="data-table dues-table">
        <thead>
          <tr>
            <th>Customer</th><th>Plot</th><th>Receipt</th>
            <th>Installment</th><th>Due Date</th><th>Status</th>
            <th>BR Due</th><th>RR Due</th><th>CR Due</th>
          </tr>
        </thead>
        <tbody>`;

  filtered.sort((a,b) => a.daysFromToday - b.daysFromToday).forEach(d => {
    const statusLabel = d.isOverdue
      ? `<span class="due-badge overdue">Overdue ${Math.abs(d.daysFromToday)}d</span>`
      : `<span class="due-badge upcoming">Due in ${d.daysFromToday}d</span>`;
    html += `<tr class="${d.isOverdue?'row-overdue':'row-upcoming'}">
      <td><strong>${d.customerName}</strong><br><small>${d.phone||''}</small></td>
      <td>Plot ${d.plotNo}</td>
      <td><a href="status.html?receipt=${d.receipt}" style="color:var(--forest);font-weight:600;">${d.receipt}</a></td>
      <td>${d.label}</td>
      <td>${d.dueDate}</td>
      <td>${statusLabel}</td>
      <td class="${d.brDue>0?'amt-due':'amt-ok'}">₹${Utils.fmtNum(d.brDue)}</td>
      <td class="${d.rrDue>0?'amt-due':'amt-ok'}">₹${Utils.fmtNum(d.rrDue)}</td>
      <td class="${d.crDue>0?'amt-due':'amt-ok'}">₹${Utils.fmtNum(d.crDue)}</td>
    </tr>`;
  });

  // Summary totals
  const totalBR = filtered.reduce((s,d)=>s+d.brDue,0);
  const totalRR = filtered.reduce((s,d)=>s+d.rrDue,0);
  const totalCR = filtered.reduce((s,d)=>s+d.crDue,0);
  html += `<tr class="total-row">
    <td colspan="6"><strong>Total Outstanding (${filtered.length} installments)</strong></td>
    <td><strong>₹${Utils.fmtNum(totalBR)}</strong></td>
    <td><strong>₹${Utils.fmtNum(totalRR)}</strong></td>
    <td><strong>₹${Utils.fmtNum(totalCR)}</strong></td>
  </tr>`;

  html += '</tbody></table></div>';
  out.innerHTML = html;
}

// ── EXCESS ────────────────────────────────────────
async function loadExcess() {
  const out = document.getElementById('reportOutput');
  out.innerHTML = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';
  try {
    const data = await API.get({ action:'getReportExcess' });
    if (data.error) throw new Error(data.error);
    excessData = data.results;
    renderExcess();
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div><p>${e.message}</p></div>`;
  }
}

function renderExcess() {
  if (!excessData) return;
  const filterVal = document.getElementById('excessFilter').value;

  const filtered = excessData.filter(r => {
    if (filterVal==='any') return true;
    if (filterVal==='BR')  return r.brExcess > 0;
    if (filterVal==='RR')  return r.rrExcess > 0;
    if (filterVal==='CR')  return r.crExcess > 0;
    return true;
  });

  const out = document.getElementById('reportOutput');
  document.getElementById('reportViewSub').textContent = `${filtered.length} booking${filtered.length!==1?'s':''} with excess payments`;

  if (!filtered.length) {
    out.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No excess payments found for the selected filter</p></div>';
    return;
  }

  let html = `<div class="table-wrap"><table class="data-table">
    <thead><tr>
      <th>Customer</th><th>Plot</th><th>Receipt</th>
      <th>BR Total</th><th>BR Paid</th><th>BR Excess/Short</th>
      <th>RR Total</th><th>RR Paid</th><th>RR Excess/Short</th>
      <th>CR Total</th><th>CR Paid</th><th>CR Excess/Short</th>
      <th>Action Needed</th>
    </tr></thead><tbody>`;

  filtered.forEach(r => {
    function excessCell(total, paid, excess) {
      if (excess > 0)  return `<td class="amt-excess">+₹${Utils.fmtNum(excess)} <span class="excess-tag">Excess</span></td>`;
      if (excess < 0)  return `<td class="amt-due">−₹${Utils.fmtNum(Math.abs(excess))} <span class="short-tag">Short</span></td>`;
      return `<td class="amt-ok">✓ Nil</td>`;
    }

    // Suggest action
    const actions = [];
    if (r.crExcess > 0 && r.rrBal > 0) actions.push(`Return ₹${Utils.fmtNum(r.crExcess)} CR → Apply to RR`);
    else if (r.crExcess > 0)            actions.push(`Return ₹${Utils.fmtNum(r.crExcess)} CR`);
    if (r.rrExcess > 0 && r.crBal > 0) actions.push(`Return ₹${Utils.fmtNum(r.rrExcess)} RR → Apply to CR`);
    else if (r.rrExcess > 0)            actions.push(`Return ₹${Utils.fmtNum(r.rrExcess)} RR`);
    if (r.brExcess > 0)                 actions.push(`Refund/Adjust ₹${Utils.fmtNum(r.brExcess)} BR`);

    html += `<tr>
      <td><strong>${r.customerName}</strong><br><small>${r.phone||''}</small></td>
      <td>Plot ${r.plotNo}</td>
      <td><a href="status.html?receipt=${r.receipt}" style="color:var(--forest);font-weight:600;">${r.receipt}</a></td>
      <td>₹${Utils.fmtNum(r.brAmt)}</td><td>₹${Utils.fmtNum(r.brPaid)}</td>${excessCell(r.brAmt,r.brPaid,r.brExcess)}
      <td>₹${Utils.fmtNum(r.rrAmt)}</td><td>₹${Utils.fmtNum(r.rrPaid)}</td>${excessCell(r.rrAmt,r.rrPaid,r.rrExcess)}
      <td>₹${Utils.fmtNum(r.crAmt)}</td><td>₹${Utils.fmtNum(r.crPaid)}</td>${excessCell(r.crAmt,r.crPaid,r.crExcess)}
      <td style="font-size:.75rem;color:var(--forest);">${actions.join('<br>')}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  out.innerHTML = html;
}

// ── PAYMENT RECEIPTS ─────────────────────────────
async function loadPayments() {
  const dateFrom = document.getElementById('pyDateFrom').value;
  const dateTo   = document.getElementById('pyDateTo').value;
  const out      = document.getElementById('reportOutput');
  out.innerHTML  = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';
  try {
    const data = await API.get({ action:'getReportPayments', dateFrom, dateTo });
    if (data.error) throw new Error(data.error);
    renderPayments(data);
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><p>${e.message}</p></div>`;
  }
}

function renderPayments(data) {
  const { rows, totalAmt, dateFrom, dateTo } = data;
  const out = document.getElementById('reportOutput');
  const subtitle = dateFrom && dateTo
    ? `${rows.length} payments · ${dateFrom} to ${dateTo}`
    : `${rows.length} payments (all time)`;
  document.getElementById('reportViewSub').textContent = subtitle;

  if (!rows.length) {
    out.innerHTML = '<div class="empty-state"><div class="empty-icon">🧾</div><p>No payments found for this date range</p></div>';
    return;
  }

  // Group totals by mode and against
  const byMode = {}, byAgainst = { CR:0, RR:0 };
  rows.forEach(r => {
    byMode[r.mode] = (byMode[r.mode]||0) + r.amount;
    if (r.against==='CR') byAgainst.CR += r.amount;
    else                   byAgainst.RR += r.amount;
  });

  let html = `
    <div class="py-summary">
      <div class="py-sum-card">
        <div class="py-sum-label">Total Collected</div>
        <div class="py-sum-val">₹${Utils.fmtNum(totalAmt)}</div>
      </div>
      <div class="py-sum-card py-cr">
        <div class="py-sum-label">Against CR</div>
        <div class="py-sum-val">₹${Utils.fmtNum(byAgainst.CR)}</div>
      </div>
      <div class="py-sum-card py-rr">
        <div class="py-sum-label">Against RR</div>
        <div class="py-sum-val">₹${Utils.fmtNum(byAgainst.RR)}</div>
      </div>
      ${Object.entries(byMode).map(([m,a])=>`
      <div class="py-sum-card py-mode">
        <div class="py-sum-label">${m}</div>
        <div class="py-sum-val">₹${Utils.fmtNum(a)}</div>
      </div>`).join('')}
    </div>
    <div class="table-wrap">
      <table class="data-table" style="font-size:.8rem;">
        <thead><tr>
          <th>Payment Date</th><th>Manual Receipt</th><th>Amount</th>
          <th>Mode</th><th>Reference</th><th>Against</th>
          <th>Customer</th><th>Plot</th><th>Notes</th><th>By</th>
        </tr></thead>
        <tbody>`;

  rows.forEach(r => {
    html += `<tr>
      <td>${r.paymentDate||'—'}</td>
      <td>${r.manualReceipt||'—'}</td>
      <td><strong>₹${Utils.fmtNum(r.amount)}</strong></td>
      <td>${r.mode}</td>
      <td style="font-size:.72rem;">${r.reference||'—'}</td>
      <td><span class="badge ${r.against==='CR'?'badge-booked':'badge-avail'}">${r.against}</span></td>
      <td>${r.customerName||'—'}</td>
      <td>Plot ${r.plotNumber||'—'}</td>
      <td style="font-size:.72rem;color:var(--grey);">${r.notes||''}</td>
      <td style="font-size:.72rem;">${r.inputterName||'—'}</td>
    </tr>`;
  });

  // Total row
  html += `<tr class="total-row">
    <td colspan="2"><strong>Total (${rows.length} payments)</strong></td>
    <td><strong>₹${Utils.fmtNum(totalAmt)}</strong></td>
    <td colspan="7"></td>
  </tr>`;

  html += '</tbody></table></div>';
  out.innerHTML = html;
}

// ── Date helpers ──────────────────────────────────
function parseDateIN(str) {
  if (!str) return null;
  const p=String(str).split('/');
  if (p.length===3) return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
  const d=new Date(str); return isNaN(d)?null:d;
}
function addDays(d,n)  { if(!d) return null; const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function fmtDate(d)    { if(!d) return '—'; return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}); }


// ── REFERRED BY REPORT ────────────────────────────
let _referredAll = [];
let _referredSelected = new Set();

async function initReferredDropdown() {
  const res = await API.get({ action:'getReportReferred' });
  if (res.error) { Utils.toast(res.error, 'err'); return; }
  _referredAll = res.referrers || [];
  _referredSelected = new Set(_referredAll); // select all by default
  renderRefOptions();
  updateRefTrigger();
}

function renderRefOptions() {
  const container = document.getElementById('refOptions');
  container.innerHTML = _referredAll.map(r => `
    <label class="ref-option">
      <input type="checkbox" value="${r}" ${_referredSelected.has(r)?'checked':''}
             onchange="onRefCheckChange(this)">
      <span>${r}</span>
    </label>`).join('');
  // Sync select-all state
  document.getElementById('refSelectAll').checked =
    _referredSelected.size === _referredAll.length;
}

function onRefCheckChange(cb) {
  if (cb.checked) _referredSelected.add(cb.value);
  else            _referredSelected.delete(cb.value);
  document.getElementById('refSelectAll').checked =
    _referredSelected.size === _referredAll.length;
  updateRefTrigger();
}

function toggleAllReferrers(cb) {
  if (cb.checked) _referredAll.forEach(r => _referredSelected.add(r));
  else            _referredSelected.clear();
  renderRefOptions();
  updateRefTrigger();
}

function updateRefTrigger() {
  const label = document.getElementById('refTriggerLabel');
  const n = _referredSelected.size, total = _referredAll.length;
  if (n === 0) {
    label.innerHTML = '<span style="color:var(--grey)">Select referrers…</span>';
  } else if (n === total) {
    label.innerHTML = '<span class="ref-tag">All (' + total + ')</span>';
  } else {
    const tags = [..._referredSelected].slice(0,3).map(r =>
      `<span class="ref-tag">${r}</span>`).join('');
    const more = n > 3 ? `<span class="ref-tag" style="background:var(--grey)">+${n-3}</span>` : '';
    label.innerHTML = '<div class="ref-tag-wrap">' + tags + more + '</div>';
  }
}

function toggleRefDropdown() {
  const list = document.getElementById('refList');
  list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function closeRefDropdown() {
  document.getElementById('refList').style.display = 'none';
}

async function loadReferred() {
  if (_referredSelected.size === 0) {
    Utils.toast('Select at least one referrer', 'err'); return;
  }
  const out = document.getElementById('reportOutput');
  out.innerHTML = '<div class="loading-state">Loading…</div>';
  closeRefDropdown();

  const referrers = [..._referredSelected].join('||');
  const res = await API.get({ action:'getReportReferred', referrers });
  if (res.error) { out.innerHTML = `<div class="empty-state"><p>${res.error}</p></div>`; return; }

  const grouped = res.grouped || {};
  const keys = Object.keys(grouped);
  if (!keys.length) { out.innerHTML = '<div class="empty-state"><p>No bookings found for selected referrers.</p></div>'; return; }

  // Summary totals
  let grandTotal = 0, grandPaid = 0, grandBal = 0, grandCount = 0;
  keys.forEach(rf => {
    grouped[rf].forEach(r => {
      grandTotal += r.brAmt; grandPaid += r.brPaid; grandBal += r.brBal; grandCount++;
    });
  });

  let html = `
    <div class="report-summary-bar" style="margin-bottom:20px;">
      <div class="rsb-item"><span>Referrers</span><strong>${keys.length}</strong></div>
      <div class="rsb-item"><span>Bookings</span><strong>${grandCount}</strong></div>
      <div class="rsb-item"><span>Total BR</span><strong>₹${Utils.fmtNum(grandTotal)}</strong></div>
      <div class="rsb-item"><span>Total Paid</span><strong>₹${Utils.fmtNum(grandPaid)}</strong></div>
      <div class="rsb-item"><span>Total Balance</span><strong style="color:var(--red)">₹${Utils.fmtNum(grandBal)}</strong></div>
    </div>`;

  keys.forEach(rf => {
    const rows = grouped[rf];
    const secTotal = rows.reduce((s,r) => s + r.brAmt, 0);
    const secPaid  = rows.reduce((s,r) => s + r.brPaid, 0);
    const secBal   = rows.reduce((s,r) => s + r.brBal, 0);

    html += `<div class="referred-section">
      <div class="referred-section-header">
        <span>🤝 ${rf}</span>
        <span class="ref-count">${rows.length} booking${rows.length>1?'s':''} &nbsp;·&nbsp; BR ₹${Utils.fmtNum(secTotal)} &nbsp;·&nbsp; Paid ₹${Utils.fmtNum(secPaid)} &nbsp;·&nbsp; Bal ₹${Utils.fmtNum(secBal)}</span>
      </div>
      <table class="data-table" style="border-radius:0 0 var(--r) var(--r);overflow:hidden;">
        <thead><tr>
          <th>Customer</th><th>Phone</th><th>Plot</th>
          <th>Booking Date</th><th>BR Amt</th><th>Paid</th><th>Balance</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr class="referred-customer-row"
                data-name="${encodeURIComponent(r.customerName)}"
                data-phone="${encodeURIComponent(r.phone)}"
                onclick="goToLedger(this)">
              <td><strong>${r.customerName}</strong></td>
              <td>${r.phone||'—'}</td>
              <td>Plot ${r.plotNo}</td>
              <td>${r.bookingDate||'—'}</td>
              <td>₹${Utils.fmtNum(r.brAmt)}</td>
              <td>₹${Utils.fmtNum(r.brPaid)}</td>
              <td style="color:${r.brBal>0?'var(--red)':'var(--forest)'}">
                ${r.brBal>0?'₹'+Utils.fmtNum(r.brBal):'✓ Paid'}
              </td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td colspan="4" style="font-weight:700;text-align:right;padding:8px 12px;">Subtotal</td>
          <td style="font-weight:700;padding:8px 12px;">₹${Utils.fmtNum(secTotal)}</td>
          <td style="font-weight:700;padding:8px 12px;">₹${Utils.fmtNum(secPaid)}</td>
          <td style="font-weight:700;padding:8px 12px;color:${secBal>0?'var(--red)':'var(--forest)'}">₹${Utils.fmtNum(secBal)}</td>
        </tr></tfoot>
      </table>
    </div>`;
  });

  out.innerHTML = html;
}

function goToLedger(row) {
  const name  = decodeURIComponent(row.dataset.name);
  const phone = decodeURIComponent(row.dataset.phone);
  // Navigate to reports page with ledger pre-loaded
  sessionStorage.setItem('pg_ledger_jump', JSON.stringify({ name, phone }));
  openReport('ledger');
  // Trigger auto-load after UI settles
  setTimeout(() => {
    document.getElementById('ledgerName').value = name;
    loadLedger(phone);
  }, 50);
}


// ── RECEIPT NUMBER AUDIT ──────────────────────────
async function loadReceipts() {
  const out    = document.getElementById('reportOutput');
  const series = document.getElementById('receiptSeriesFilter').value;
  out.innerHTML = '<div class="loading-state">Loading…</div>';

  const res = await API.get({ action:'getReportReceipts', series });
  if (res.error) { out.innerHTML = `<div class="empty-state"><p>${res.error}</p></div>`; return; }

  let html = '';

  function renderSeries(label, icon, data) {
    if (!data || !data.rows.length) {
      return `<div class="referred-section">
        <div class="referred-section-header" style="background:var(--grey);">
          <span>${icon} ${label} Series</span>
          <span class="ref-count">No receipts recorded</span>
        </div>
      </div>`;
    }

    const { rows, gaps } = data;
    const active    = rows.filter(r => r.status === 'Active');
    const cancelled = rows.filter(r => r.status !== 'Active');
    const totalAmt  = active.reduce((s,r) => s + r.amount, 0);
    const minR = Math.min(...rows.map(r => r.receiptNo));
    const maxR = Math.max(...rows.map(r => r.receiptNo));
    const range = maxR - minR + 1;

    // Build map: receiptNo → array of rows (multiple plots per receipt)
    const issued = new Map();
    rows.forEach(r => {
      if (!issued.has(r.receiptNo)) issued.set(r.receiptNo, []);
      issued.get(r.receiptNo).push(r);
    });

    // Build full sequence including gaps
    const allNums = [];
    for (let n = minR; n <= maxR; n++) allNums.push(n);

    let tbl = `
      <div class="referred-section">
        <div class="referred-section-header">
          <span>${icon} ${label} Series</span>
          <span class="ref-count">
            Range ${minR}–${maxR} &nbsp;·&nbsp;
            ${active.length} active &nbsp;·&nbsp;
            ${cancelled.length} cancelled &nbsp;·&nbsp;
            <span style="color:#ffcdd2">${gaps.length} missing</span>
            &nbsp;·&nbsp; ₹${Utils.fmtNum(totalAmt)}
          </span>
        </div>`;

    // Summary chips
    tbl += `<div style="padding:10px 14px;background:#f9fafb;border-left:1px solid var(--sage);border-right:1px solid var(--sage);display:flex;gap:12px;flex-wrap:wrap;">
      <div class="rsb-item"><span>Total in Range</span><strong>${range}</strong></div>
      <div class="rsb-item"><span>Issued</span><strong>${rows.length}</strong></div>
      <div class="rsb-item"><span>Active</span><strong style="color:var(--forest)">${active.length}</strong></div>
      <div class="rsb-item"><span>Cancelled</span><strong style="color:var(--grey)">${cancelled.length}</strong></div>
      <div class="rsb-item"><span>Missing</span><strong style="color:var(--red)">${gaps.length}</strong></div>
      <div class="rsb-item"><span>Total Amount</span><strong>₹${Utils.fmtNum(totalAmt)}</strong></div>
    </div>`;

    tbl += `<table class="data-table" style="border-radius:0;border-top:none;">
      <thead><tr>
        <th>Receipt No</th><th>Status</th><th>Date</th>
        <th>Amount</th><th>Mode</th><th>Customer</th>
        <th>Plot</th><th>Booking Receipt</th><th>Notes</th>
      </tr></thead>
      <tbody>`;

    allNums.forEach(n => {
      if (issued.has(n)) {
        const entries = issued.get(n);
        const totalRowAmt = entries.reduce((s,r) => s + r.amount, 0);
        entries.forEach((r, idx) => {
          const isCancelled = r.status !== 'Active';
          const isFirst = idx === 0;
          const isLast  = idx === entries.length - 1;
          const multiStyle = entries.length > 1
            ? (isFirst ? 'border-bottom:none;' : isLast ? 'border-top:1px dashed #e0e0e0;' : 'border-top:1px dashed #e0e0e0;border-bottom:none;')
            : '';
          const rowStyle = (isCancelled ? 'background:#f5f5f5;color:#999;text-decoration:line-through;' : '') + multiStyle;

          tbl += `<tr style="${rowStyle}">
            ${isFirst ? `<td rowspan="${entries.length}" style="vertical-align:middle;font-weight:700;${entries.length>1?'background:#f0f4f8;':''}">${r.receiptNo}${entries.length>1?`<br><span style="font-size:.68rem;color:var(--grey);font-weight:400;text-decoration:none;">${entries.length} plots<br>₹${Utils.fmtNum(totalRowAmt)}</span>`:''}</td>` : ''}
            <td><span class="status-badge" style="background:${isCancelled?'#eee':'#e8f5e9'};color:${isCancelled?'#999':'#2e7d32'}">${r.status}</span></td>
            <td>${r.date||'—'}</td>
            <td>${r.amount?'₹'+Utils.fmtNum(r.amount):'—'}</td>
            <td>${r.mode||'—'}</td>
            <td>${r.customer||'—'}</td>
            <td><strong>${r.plot||'—'}</strong></td>
            <td style="font-size:.78rem;color:var(--grey)">${r.bookingReceipt||'—'}</td>
            <td style="font-size:.78rem;color:var(--grey)">${r.notes||'—'}</td>
          </tr>`;
        });
      } else {
        // Gap row
        tbl += `<tr style="background:#fff3f3;">
          <td><strong style="color:var(--red)">${n}</strong></td>
          <td><span class="status-badge" style="background:#ffcdd2;color:#b71c1c;">⚠ Missing</span></td>
          <td colspan="7" style="color:#b71c1c;font-size:.84rem;font-style:italic;">
            Receipt not recorded — possibly skipped or unaccounted
          </td>
        </tr>`;
      }
    });

    tbl += `</tbody></table></div>`;
    return tbl;
  }

  if (series === 'all' || series === 'Cash') html += renderSeries('Cash', '💵', res.cash);
  if (series === 'all' || series === 'Bank') html += renderSeries('Bank', '🏦', res.bank);

  out.innerHTML = html || '<div class="empty-state"><p>No receipt data found.</p></div>';
}


// ── RATE COMPARISON REPORT ────────────────────────
async function initRateComp() {
  // Load with no filters to get meta (zones, bookedBys)
  const res = await API.get({ action:'getReportRateComparison' });
  if (res.error) { Utils.toast(res.error,'err'); return; }

  // Populate zone dropdown
  const zoneEl = document.getElementById('rcZoneFilter');
  zoneEl.innerHTML = '<option value="all">All Zones</option>' +
    (res.meta.zones||[]).map(z => `<option value="${z}">₹${Utils.fmtNum(z)}/sqft</option>`).join('');

  // Populate booked by dropdown
  const byEl = document.getElementById('rcBookedByFilter');
  byEl.innerHTML = '<option value="all">All Executives</option>' +
    (res.meta.bookedBys||[]).map(b => `<option value="${b}">${b}</option>`).join('');

  renderRateComp(res);
}

async function loadRateComp() {
  const zone     = document.getElementById('rcZoneFilter').value;
  const bookedBy = document.getElementById('rcBookedByFilter').value;
  const pctMin   = document.getElementById('rcPctMin').value;
  const pctMax   = document.getElementById('rcPctMax').value;
  const out = document.getElementById('reportOutput');
  out.innerHTML = '<div class="loading-state">Loading…</div>';
  const res = await API.get({ action:'getReportRateComparison', zone, bookedBy, pctMin, pctMax });
  if (res.error) { out.innerHTML = `<div class="empty-state"><p>${res.error}</p></div>`; return; }
  renderRateComp(res);
}

function renderRateComp(res) {
  const out = document.getElementById('reportOutput');
  const { rows, scatter, totals, meta } = res;

  if (!rows || !rows.length) {
    out.innerHTML = '<div class="empty-state"><p>No booked plots with rate data found.</p></div>';
    return;
  }

  // ── Scatter band summary ──
  const totalScatter = scatter.reduce((s,b) => s+b.count, 0);
  let scatterHtml = `
    <div class="rc-scatter-wrap">
      <div class="rc-scatter-title">Pricing Band Summary <span style="font-weight:400;font-size:.8rem;color:var(--grey);">(all booked plots, before filters)</span></div>
      <div class="rc-bands">`;
  scatter.forEach(b => {
    const pct = Math.round(b.count / totalScatter * 100);
    scatterHtml += `
        <div class="rc-band">
          <div class="rc-band-bar-wrap">
            <div class="rc-band-bar" style="height:${Math.max(pct*2,6)}px;background:${b.color};"></div>
          </div>
          <div class="rc-band-count" style="color:${b.color}">${b.count}</div>
          <div class="rc-band-label">${b.label}</div>
          <div class="rc-band-pct">${pct}%</div>
        </div>`;
  });
  scatterHtml += `</div></div>`;

  // ── Revenue impact summary cards ──
  const impactColor = totals.revenueImpact >= 0 ? 'var(--forest)' : 'var(--red)';
  const impactIcon  = totals.revenueImpact >= 0 ? '▲' : '▼';
  let summaryHtml = `
    <div class="rc-summary-bar">
      <div class="rsb-item">
        <span>Plots Shown</span>
        <strong>${rows.length} <span style="font-weight:400;font-size:.78rem;color:var(--grey);">of ${meta.totalBooked}</span></strong>
      </div>
      <div class="rsb-item">
        <span>Total at Zone Rate</span>
        <strong>₹${Utils.fmtNum(totals.zoneAmt)}</strong>
      </div>
      <div class="rsb-item">
        <span>Total at Booked Rate</span>
        <strong>₹${Utils.fmtNum(totals.bookedAmt)}</strong>
      </div>
      <div class="rsb-item">
        <span>Revenue Impact</span>
        <strong style="color:${impactColor}">${impactIcon} ₹${Utils.fmtNum(Math.abs(totals.revenueImpact))}</strong>
      </div>
    </div>`;

  // ── Table ──
  let tableHtml = `
    <table class="data-table" style="margin-top:0;">
      <thead><tr>
        <th>Plot No</th>
        <th>Area (SqFt)</th>
        <th>Zone Rate</th>
        <th>Booked Rate (BR)</th>
        <th>Diff (₹/sqft)</th>
        <th>% Change</th>
        <th>Zone Total</th>
        <th>Booked Total</th>
        <th>Revenue Impact</th>
        <th>Customer</th>
        <th>Date</th>
      </tr></thead>
      <tbody>`;

  rows.forEach(r => {
    const pct = r.pctDiff;
    let pctColor, pctBg;
    if      (pct < -10) { pctColor='#b71c1c'; pctBg='#ffebee'; }
    else if (pct < -5)  { pctColor='#e53935'; pctBg='#fff3e0'; }
    else if (pct < 0)   { pctColor='#ff8f00'; pctBg='#fff8e1'; }
    else if (pct === 0) { pctColor='#2e7d32'; pctBg='#f1f8e9'; }
    else if (pct <= 5)  { pctColor='#388e3c'; pctBg='#e8f5e9'; }
    else                { pctColor='#1b5e20'; pctBg='#c8e6c9'; }

    const impSign  = r.revenueImpact >= 0 ? '+' : '';
    const impColor = r.revenueImpact >= 0 ? 'var(--forest)' : 'var(--red)';
    const diffSign = r.diff >= 0 ? '+' : '';
    const pctSign  = pct >= 0 ? '+' : '';

    tableHtml += `<tr>
      <td><strong>Plot ${r.plotNo}</strong></td>
      <td>${Utils.fmtNum(r.sqft)}</td>
      <td>₹${Utils.fmtNum(r.zoneRate)}</td>
      <td>₹${Utils.fmtNum(r.bookedRate)}</td>
      <td style="color:${impColor};font-weight:600;">${diffSign}₹${Utils.fmtNum(Math.abs(r.diff))}</td>
      <td><span class="rc-pct-badge" style="background:${pctBg};color:${pctColor};">${pctSign}${pct.toFixed(2)}%</span></td>
      <td>₹${Utils.fmtNum(r.zoneAmt)}</td>
      <td>₹${Utils.fmtNum(r.bookedAmt)}</td>
      <td style="color:${impColor};font-weight:600;">${impSign}₹${Utils.fmtNum(Math.abs(r.revenueImpact))}</td>
      <td>
          <strong>${r.customerName||'—'}</strong>
          ${r.phone ? '<div style="font-size:.72rem;color:var(--grey);">'+r.phone+'</div>' : ''}
        </td>
      <td style="font-size:.82rem;">${r.bookingDate||'—'}</td>
    </tr>`;
  });

  // Totals footer
  const tImpSign  = totals.revenueImpact >= 0 ? '+' : '';
  const tImpColor = totals.revenueImpact >= 0 ? 'var(--forest)' : 'var(--red)';
  tableHtml += `</tbody>
    <tfoot><tr>
      <td colspan="6" style="font-weight:700;text-align:right;padding:9px 12px;">Totals (filtered)</td>
      <td style="font-weight:700;">₹${Utils.fmtNum(totals.zoneAmt)}</td>
      <td style="font-weight:700;">₹${Utils.fmtNum(totals.bookedAmt)}</td>
      <td style="font-weight:700;color:${tImpColor};">${tImpSign}₹${Utils.fmtNum(Math.abs(totals.revenueImpact))}</td>
      <td colspan="2"></td>
    </tr></tfoot>
    </table>`;

  out.innerHTML = scatterHtml + summaryHtml + tableHtml;
}

// ── CUSTOMER SUMMARY REPORT ───────────────────────
let _custRows = [];

async function loadCustomers() {
  const btn = document.getElementById('custLoadBtn');
  const out = document.getElementById('reportOutput');
  btn.disabled = true; btn.textContent = 'Loading…';
  out.innerHTML = '<div class="loading-state">Loading customer data…</div>';

  try {
    const res = await API.get({ action: 'getReportCustomers' });
    if (res.error) throw new Error(res.error);
    _custRows = res.rows || [];
    document.getElementById('custExportBtn').style.display = _custRows.length ? 'inline-block' : 'none';
    renderCustomers();
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Load Report';
  }
}

function sortedCustomers() {
  const sort = document.getElementById('custSort').value;
  const rows = [..._custRows];
  if (sort === 'name_asc')   rows.sort((a,b) => a.customerName.localeCompare(b.customerName));
  if (sort === 'name_desc')  rows.sort((a,b) => b.customerName.localeCompare(a.customerName));
  if (sort === 'paid_asc')   rows.sort((a,b) => a.paidTotal - b.paidTotal);
  if (sort === 'paid_desc')  rows.sort((a,b) => b.paidTotal - a.paidTotal);
  if (sort === 'due_asc')    rows.sort((a,b) => a.due - b.due);
  if (sort === 'due_desc')   rows.sort((a,b) => b.due - a.due);
  return rows;
}

function renderCustomers() {
  const out   = document.getElementById('reportOutput');
  const split = document.getElementById('custSplit').value;
  const rows  = sortedCustomers();

  if (!rows.length) {
    out.innerHTML = '<div class="empty-state"><p>No active bookings found.</p></div>';
    return;
  }

  // Totals
  let totAmt = 0, totPaid = 0, totDue = 0;
  let totBR = 0, totRR = 0, totCR = 0;
  let totPaidCR = 0, totPaidRR = 0;
  rows.forEach(r => {
    totAmt  += r.totalAmt;  totPaid += r.paidTotal; totDue  += r.due;
    totBR   += r.brAmt;     totRR   += r.rrAmt;     totCR   += r.crAmt;
    totPaidCR += r.paidCR;  totPaidRR += r.paidRR;
  });

  const showAmtSplit = split === 'amount' || split === 'both';
  const showDueSplit = split === 'due'    || split === 'both';

  // Summary cards
  const summHtml = `
    <div class="cust-summary-strip">
      <div class="cust-sum-card"><span>Total Customers</span><strong>${rows.length}</strong></div>
      <div class="cust-sum-card"><span>Total Amount</span><strong>₹${Utils.fmtNum(totAmt)}</strong></div>
      <div class="cust-sum-card" style="border-color:var(--forest);"><span>Total Received</span><strong style="color:var(--forest);">₹${Utils.fmtNum(totPaid)}</strong></div>
      <div class="cust-sum-card" style="border-color:var(--red);"><span>Total Due</span><strong style="color:var(--red);">₹${Utils.fmtNum(totDue)}</strong></div>
      ${showAmtSplit ? `
        <div class="cust-sum-card" style="border-color:#1565c0;">
          <span>BR (Full Value)</span><strong style="color:#1565c0;">₹${Utils.fmtNum(totBR)}</strong>
        </div>
        <div class="cust-sum-card" style="border-color:#1565c0;">
          <span>RR (Bank)</span><strong style="color:#1565c0;">₹${Utils.fmtNum(totRR)}</strong>
        </div>
        <div class="cust-sum-card" style="border-color:#e65100;">
          <span>CR (Cash)</span><strong style="color:#e65100;">₹${Utils.fmtNum(totCR)}</strong>
        </div>` : ''}
      ${showDueSplit ? `
        <div class="cust-sum-card" style="border-color:#1565c0;">
          <span>RR Paid</span><strong style="color:#1565c0;">₹${Utils.fmtNum(totPaidRR)}</strong>
        </div>
        <div class="cust-sum-card" style="border-color:#e65100;">
          <span>CR Paid</span><strong style="color:#e65100;">₹${Utils.fmtNum(totPaidCR)}</strong>
        </div>
        <div class="cust-sum-card" style="border-color:var(--red);">
          <span>RR Due</span><strong style="color:var(--red);">₹${Utils.fmtNum(totRR - totPaidRR)}</strong>
        </div>
        <div class="cust-sum-card" style="border-color:var(--red);">
          <span>CR Due</span><strong style="color:var(--red);">₹${Utils.fmtNum(totCR - totPaidCR)}</strong>
        </div>` : ''}
    </div>`;

  // Build table header
  let thBase = `<th>#</th><th>Customer Name</th><th>Plot</th><th>Mobile</th><th>Booking Date</th>`;
  let thAmt  = showAmtSplit
    ? `<th>BR Amount</th><th>RR Amount</th><th>CR Amount</th>`
    : `<th>Total Amount</th>`;
  let thPaid = `<th>CR Received</th><th>RR Received</th><th>Total Received</th>`;
  let thDue  = showDueSplit
    ? `<th>CR Due</th><th>RR Due</th><th>Total Due</th>`
    : `<th>Total Due</th>`;

  let tableHtml = `
    <table class="data-table" id="custTable">
      <thead><tr>${thBase}${thAmt}${thPaid}${thDue}</tr></thead>
      <tbody>`;

  rows.forEach((r, idx) => {
    const dueCls = r.due > 0 ? 'color:var(--red);font-weight:700;' : 'color:var(--forest);font-weight:700;';
    const crDue  = Math.max(0, r.crAmt - r.paidCR);
    const rrDue  = Math.max(0, r.rrAmt - r.paidRR);

    let tdAmt = showAmtSplit
      ? `<td>₹${Utils.fmtNum(r.brAmt)}</td><td>₹${Utils.fmtNum(r.rrAmt)}</td><td>₹${Utils.fmtNum(r.crAmt)}</td>`
      : `<td><strong>₹${Utils.fmtNum(r.totalAmt)}</strong></td>`;
    let tdPaid = `<td>₹${Utils.fmtNum(r.paidCR)}</td><td>₹${Utils.fmtNum(r.paidRR)}</td><td><strong>₹${Utils.fmtNum(r.paidTotal)}</strong></td>`;
    let tdDue  = showDueSplit
      ? `<td style="${dueCls}">₹${Utils.fmtNum(crDue)}</td><td style="${dueCls}">₹${Utils.fmtNum(rrDue)}</td><td style="${dueCls}">₹${Utils.fmtNum(r.due)}</td>`
      : `<td style="${dueCls}">₹${Utils.fmtNum(r.due)}</td>`;

    tableHtml += `<tr>
      <td style="color:var(--grey);font-size:.78rem;">${idx+1}</td>
      <td><strong>${r.customerName}</strong><br><span style="font-size:.74rem;color:var(--grey);">${r.receiptNo}</span></td>
      <td>Plot ${r.plotNo}</td>
      <td>${r.phone||'—'}</td>
      <td style="font-size:.82rem;">${r.bookingDate||'—'}</td>
      ${tdAmt}${tdPaid}${tdDue}
    </tr>`;
  });

  // Footer totals
  let tfAmt = showAmtSplit
    ? `<td>₹${Utils.fmtNum(totBR)}</td><td>₹${Utils.fmtNum(totRR)}</td><td>₹${Utils.fmtNum(totCR)}</td>`
    : `<td>₹${Utils.fmtNum(totAmt)}</td>`;
  let tfPaid = `<td>₹${Utils.fmtNum(totPaidCR)}</td><td>₹${Utils.fmtNum(totPaidRR)}</td><td>₹${Utils.fmtNum(totPaid)}</td>`;
  let tfDue  = showDueSplit
    ? `<td>₹${Utils.fmtNum(totCR - totPaidCR)}</td><td>₹${Utils.fmtNum(totRR - totPaidRR)}</td><td>₹${Utils.fmtNum(totDue)}</td>`
    : `<td>₹${Utils.fmtNum(totDue)}</td>`;

  tableHtml += `</tbody>
    <tfoot><tr>
      <td colspan="5" style="font-weight:700;text-align:right;padding:9px 12px;">TOTAL (${rows.length} customers)</td>
      ${tfAmt}${tfPaid}${tfDue}
    </tr></tfoot>
    </table>`;

  out.innerHTML = summHtml + tableHtml;
}

// ── EXCEL EXPORT ──────────────────────────────────
function exportCustomersExcel() {
  const split = document.getElementById('custSplit').value;
  const rows  = sortedCustomers();
  if (!rows.length) { Utils.toast('No data to export', 'err'); return; }

  const showAmtSplit = split === 'amount' || split === 'both';
  const showDueSplit = split === 'due'    || split === 'both';

  const headers = ['#','Customer Name','Receipt No','Plot No','Mobile','Booking Date'];
  if (showAmtSplit) {
    headers.push('BR Amount','RR Amount','CR Amount');
  } else {
    headers.push('Total Amount');
  }
  headers.push('CR Received','RR Received','Total Received');
  if (showDueSplit) {
    headers.push('CR Due','RR Due','Total Due');
  } else {
    headers.push('Total Due');
  }

  const dataRows = rows.map((r, i) => {
    const crDue = Math.max(0, r.crAmt - r.paidCR);
    const rrDue = Math.max(0, r.rrAmt - r.paidRR);
    const row = [i+1, r.customerName, r.receiptNo, 'Plot ' + r.plotNo, r.phone, r.bookingDate];
    if (showAmtSplit) {
      row.push(r.brAmt, r.rrAmt, r.crAmt);
    } else {
      row.push(r.totalAmt);
    }
    row.push(r.paidCR, r.paidRR, r.paidTotal);
    if (showDueSplit) {
      row.push(crDue, rrDue, r.due);
    } else {
      row.push(r.due);
    }
    return row;
  });

  // Totals row
  let totAmt=0,totPaid=0,totDue=0,totBR=0,totRR=0,totCR=0,totPaidCR=0,totPaidRR=0;
  rows.forEach(r => {
    totAmt+=r.totalAmt; totPaid+=r.paidTotal; totDue+=r.due;
    totBR+=r.brAmt; totRR+=r.rrAmt; totCR+=r.crAmt;
    totPaidCR+=r.paidCR; totPaidRR+=r.paidRR;
  });
  const totRow = ['','TOTAL','','','',''];
  if (showAmtSplit) totRow.push(totBR, totRR, totCR); else totRow.push(totAmt);
  totRow.push(totPaidCR, totPaidRR, totPaid);
  if (showDueSplit) totRow.push(totCR-totPaidCR, totRR-totPaidRR, totDue); else totRow.push(totDue);
  dataRows.push(totRow);

  // Build CSV with BOM for Excel UTF-8
  const bom  = '\uFEFF';
  const csv  = bom + [headers, ...dataRows]
    .map(row => row.map(v => '"' + String(v??'').replace(/"/g,'""') + '"').join(','))
    .join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const ts   = new Date().toLocaleDateString('en-IN').replace(/\//g,'-');
  a.href     = url;
  a.download = `PG_Customer_Summary_${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  Utils.toast('Excel file downloaded', 'ok');
}

// ── SALE DEED ELIGIBLE REPORT ─────────────────────
let _deedPending = null; // { receiptNo, type, customerName, plotNo }

async function loadDeed() {
  const btn    = document.getElementById('deedLoadBtn');
  const out    = document.getElementById('reportOutput');
  const filter = document.getElementById('deedFilter').value;
  btn.disabled = true; btn.textContent = 'Loading…';
  out.innerHTML = '<div class="loading-state">Loading…</div>';

  try {
    const res = await API.get({ action: 'getReportDeedEligible', filter });
    if (res.error) throw new Error(res.error);
    renderDeed(res.rows, filter);
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Load Report';
  }
}

function renderDeed(rows, filter) {
  const out = document.getElementById('reportOutput');
  if (!rows.length) {
    out.innerHTML = '<div class="empty-state"><p>No records found for the selected filter.</p></div>';
    return;
  }

  // Summary counts
  const agElig  = rows.filter(r => r.agEligible && !r.agDone).length;
  const agDone  = rows.filter(r => r.agDone).length;
  const sdElig  = rows.filter(r => r.sdEligible && !r.sdDone).length;
  const sdDone  = rows.filter(r => r.sdDone).length;

  let html = `
    <div class="deed-summary-strip">
      <div class="deed-sum-card" style="border-color:#1565c0;">
        <span>Agreement Eligible</span><strong style="color:#1565c0;">${agElig}</strong>
      </div>
      <div class="deed-sum-card" style="border-color:var(--forest);">
        <span>Agreement Done</span><strong style="color:var(--forest);">${agDone}</strong>
      </div>
      <div class="deed-sum-card" style="border-color:#e65100;">
        <span>Deed Eligible</span><strong style="color:#e65100;">${sdElig}</strong>
      </div>
      <div class="deed-sum-card" style="border-color:#6a1b9a;">
        <span>Deed Completed</span><strong style="color:#6a1b9a;">${sdDone}</strong>
      </div>
      <div class="deed-sum-card">
        <span>Total Rows</span><strong>${rows.length}</strong>
      </div>
    </div>

    <table class="data-table" id="deedTable">
      <thead><tr>
        <th>#</th>
        <th>Customer</th>
        <th>Plot</th>
        <th>Mobile</th>
        <th>Booking Date</th>
        <th>BR Amount</th>
        <th>BR Paid</th>
        <th>Difference</th>
        <th>BR Inst 1 (35%)</th>
        <th>Agreement</th>
        <th>Sale Deed</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>`;

  rows.forEach((r, idx) => {
    const brPct     = r.brAmt > 0 ? Math.round(r.paidBR / r.brAmt * 100) : 0;
    const rrI1Pct   = r.rrInst1 > 0 ? Math.round(r.paidRR / r.rrInst1 * 100) : 0;

    // Agreement status chip
    const agChip = r.agDone
      ? `<div class="deed-chip deed-chip-done">✅ Done<br><span>${r.agNumber||'—'}</span><br><span>${r.agDate||'—'}</span></div>`
      : r.agEligible
        ? `<div class="deed-chip deed-chip-eligible">🟡 Eligible</div>`
        : `<div class="deed-chip deed-chip-none">⏳ Not yet</div>`;

    // Sale deed status chip
    const sdChip = r.sdDone
      ? `<div class="deed-chip deed-chip-done" style="border-color:#6a1b9a;background:#f3e5f5;">✅ Done<br><span>${r.sdNumber||'—'}</span><br><span>${r.sdDate||'—'}</span></div>`
      : r.sdEligible
        ? `<div class="deed-chip deed-chip-eligible" style="border-color:#e65100;background:#fff3e0;color:#e65100;">🟠 Eligible</div>`
        : `<div class="deed-chip deed-chip-none">⏳ Not yet</div>`;

    // Actions — admin only
    const isAdmin = (Auth.getSession()||{}).role === 'admin';
    let actions = '';
    if (isAdmin && !r.agDone && r.agEligible) {
      actions += `<button class="btn-inline-sm btn-recon" style="margin-bottom:4px;" onclick="openAgModal('${r.receiptNo}','${r.customerName.replace(/'/g,"\\'")}','${r.plotNo}')">✍ Agreement</button><br>`;
    }
    if (isAdmin && r.agDone) {
      actions += `<button class="btn-inline-sm" style="background:#fff3e0;color:#e65100;border:1px solid #ffcc80;margin-bottom:4px;" onclick="undoDeed('${r.receiptNo}','agreement','${r.customerName.replace(/'/g,"\\'")}','${r.plotNo}')">↩ Undo Ag.</button><br>`;
    }
    if (isAdmin && !r.sdDone && r.sdEligible) {
      actions += `<button class="btn-inline-sm" style="background:#f3e5f5;color:#6a1b9a;border:1px solid #ce93d8;margin-bottom:4px;" onclick="openSdModal('${r.receiptNo}','${r.customerName.replace(/'/g,"\\'")}','${r.plotNo}')">📜 Sale Deed</button><br>`;
    }
    if (isAdmin && r.sdDone) {
      actions += `<button class="btn-inline-sm" style="background:#fce4ec;color:#880e4f;border:1px solid #f48fb1;" onclick="undoDeed('${r.receiptNo}','saledeed','${r.customerName.replace(/'/g,"\\'")}','${r.plotNo}')">↩ Undo Deed</button>`;
    }
    if (!actions) actions = '<span style="font-size:.75rem;color:var(--grey);">—</span>';

    // Row highlight
    const rowBg = r.sdDone ? 'background:#f8f0ff;' : r.agDone ? 'background:#f0fff4;' : '';

    html += `<tr style="${rowBg}">
      <td style="color:var(--grey);font-size:.78rem;">${idx+1}</td>
      <td>
        <strong>${r.customerName}</strong>
        <div style="font-size:.72rem;color:var(--grey);">${r.receiptNo}</div>
      </td>
      <td><strong>Plot ${r.plotNo}</strong></td>
      <td style="font-size:.82rem;">${r.phone||'—'}</td>
      <td style="font-size:.82rem;">${r.bookingDate||'—'}</td>
      <td>
        ₹${Utils.fmtNum(r.brAmt)}
        <div class="deed-progress-bar"><div style="width:${Math.min(brPct,100)}%;background:${brPct>=100?'var(--forest)':brPct>=99?'#f57f17':'#1565c0'};"></div></div>
        <div style="font-size:.68rem;color:var(--grey);">${brPct}% paid</div>
      </td>
      <td style="color:${brPct>=99?'var(--forest)':'var(--ink)'};">
        <strong>₹${Utils.fmtNum(r.paidBR)}</strong>
        ${brPct>=100?'<div style="font-size:.68rem;color:var(--forest);">✅ Full</div>':brPct>=99?'<div style="font-size:.68rem;color:#f57f17;">≥99%</div>':''}
      </td>
      <td>${(() => {
        const diff = r.brDiff;
        if (diff > 0)  return '<span style="color:#e53935;font-weight:700;">−₹' + Utils.fmtNum(diff) + '</span><div style="font-size:.68rem;color:#e53935;">Due</div>';
        if (diff < 0)  return '<span style="color:#6a1b9a;font-weight:700;">+₹' + Utils.fmtNum(Math.abs(diff)) + '</span><div style="font-size:.68rem;color:#6a1b9a;">Excess</div>';
        return '<span style="color:var(--forest);font-weight:700;">✅ Settled</span>';
      })()}</td>
      <td style="font-size:.82rem;">₹${Utils.fmtNum(r.rrInst1)}</td>
      <td>${agChip}</td>
      <td>${sdChip}</td>
      <td style="white-space:nowrap;">${actions}</td>
    </tr>`;
  });

  html += `</tbody></table>`;
  out.innerHTML = html;

  // Wire up modal save buttons
  document.getElementById('agSaveBtn').onclick = saveAgreement;
  document.getElementById('sdSaveBtn').onclick  = saveSaleDeed;
}

// ── MODALS ────────────────────────────────────────
function openAgModal(receiptNo, customerName, plotNo) {
  _deedPending = { receiptNo, customerName, plotNo };
  document.getElementById('agModalTitle').textContent = `✍ Agreement — ${customerName} · Plot ${plotNo}`;
  document.getElementById('agModalMeta').textContent  = `Receipt: ${receiptNo}`;
  document.getElementById('agNumber').value = '';
  document.getElementById('agDate').value   = '';
  Utils.openOverlay('agModal');
  setTimeout(() => document.getElementById('agNumber').focus(), 100);
}

function openSdModal(receiptNo, customerName, plotNo) {
  _deedPending = { receiptNo, customerName, plotNo };
  document.getElementById('sdModalTitle').textContent = `📜 Sale Deed — ${customerName} · Plot ${plotNo}`;
  document.getElementById('sdModalMeta').textContent  = `Receipt: ${receiptNo}`;
  document.getElementById('sdNumber').value = '';
  document.getElementById('sdDate').value   = '';
  Utils.openOverlay('sdModal');
  setTimeout(() => document.getElementById('sdNumber').focus(), 100);
}

async function saveAgreement() {
  const number = document.getElementById('agNumber').value.trim();
  const date   = document.getElementById('agDate').value;
  if (!number) { Utils.toast('Agreement number required', 'err'); return; }
  if (!date)   { Utils.toast('Agreement date required', 'err'); return; }

  const btn = document.getElementById('agSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const dp = date.split('-');
    const fmtDate = dp.length === 3 ? `${dp[2]}/${dp[1]}/${dp[0]}` : date;
    const res = await API.post({
      action: 'saveDeedStatus',
      receiptNo: _deedPending.receiptNo,
      type: 'agreement',
      number,
      date: fmtDate,
    });
    if (res.error) throw new Error(res.error);
    Utils.closeOverlay('agModal');
    Utils.toast('✅ Agreement marked done', 'ok');
    loadDeed();
  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function saveSaleDeed() {
  const number = document.getElementById('sdNumber').value.trim();
  const date   = document.getElementById('sdDate').value;
  if (!number) { Utils.toast('Sale deed number required', 'err'); return; }
  if (!date)   { Utils.toast('Sale deed date required', 'err'); return; }

  const btn = document.getElementById('sdSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    const dp = date.split('-');
    const fmtDate = dp.length === 3 ? `${dp[2]}/${dp[1]}/${dp[0]}` : date;
    const res = await API.post({
      action: 'saveDeedStatus',
      receiptNo: _deedPending.receiptNo,
      type: 'saledeed',
      number,
      date: fmtDate,
    });
    if (res.error) throw new Error(res.error);
    Utils.closeOverlay('sdModal');
    Utils.toast('✅ Sale Deed marked done', 'ok');
    loadDeed();
  } catch(e) {
    Utils.toast(e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function undoDeed(receiptNo, type, customerName, plotNo) {
  const label = type === 'agreement' ? 'Agreement' : 'Sale Deed';
  if (!confirm(`Undo ${label} for ${customerName} · Plot ${plotNo}?`)) return;
  try {
    const res = await API.post({
      action: 'saveDeedStatus',
      receiptNo,
      type: type === 'agreement' ? 'agreement_undo' : 'saledeed_undo',
    });
    if (res.error) throw new Error(res.error);
    Utils.toast(`↩ ${label} undone`, 'ok');
    loadDeed();
  } catch(e) {
    Utils.toast(e.message, 'err');
  }
}
