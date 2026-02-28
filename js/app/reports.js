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

  document.getElementById('ledgerSearchBtn').addEventListener('click', loadLedger);
  document.getElementById('ledgerName').addEventListener('keydown', e => { if(e.key==='Enter') loadLedger(); });

  document.getElementById('duesLoadBtn').addEventListener('click', () => loadDues());
  document.getElementById('excessLoadBtn').addEventListener('click', () => loadExcess());
  document.getElementById('paymentsLoadBtn').addEventListener('click', () => loadPayments());

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

  document.getElementById('ledgerControls').style.display  = 'none';
  document.getElementById('duesControls').style.display    = 'none';
  document.getElementById('excessControls').style.display  = 'none';

  const titles = {
    ledger:   ['Customer Ledger', 'Search by customer name to see all plots and balances'],
    dues:     ['Installment Due Report', 'All customers with outstanding installments'],
    excess:   ['Excess Payment Report', 'Customers where paid amount exceeds category total'],
    payments: ['Payment Receipt Report', 'All payment receipts filtered by date range'],
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
    return `<div class="inst-mini ${cls}">
      <div class="inst-mini-title">${lbl} Schedule</div>
      <div class="inst-mini-row hdr"><span>Part</span><span>Due</span><span>Total</span><span>Paid</span><span>Due</span></div>
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
    </div>`;
  }

  function payHistTable(payments) {
    if (!payments || !payments.length) return '<div style="color:var(--grey);font-size:.8rem;padding:8px 0;">No payments recorded</div>';
    return `<table class="sch-table" style="font-size:.78rem;">
      <thead><tr><th>Date</th><th>Manual Rcpt</th><th>Amount</th><th>Mode</th><th>Against</th><th>Ref</th><th>Notes</th><th>By</th></tr></thead>
      <tbody>
        ${payments.map(p=>`<tr>
          <td>${p.date}</td>
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
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-size:.75rem;color:var(--grey);">${r.bookingDate||''} · ${r.area?r.area+' SqFt':''}</span>
            ${Utils.statusBadge(r.status)}
          </div>
        </div>

        <!-- Balance summary -->
        <div class="lpc-bal-row">
          <div class="lpc-bal-cell lpc-br">
            <div class="lpc-bal-label">BR</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(r.brAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(r.brPaid)}</div>
            <div class="lpc-bal-due ${r.brBal>0?'due-red':'due-green'}">Bal ₹${Utils.fmtNum(r.brBal)}</div>
          </div>
          <div class="lpc-bal-cell lpc-rr">
            <div class="lpc-bal-label">RR</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(r.rrAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(r.rrPaid)}</div>
            <div class="lpc-bal-due ${r.rrBal>0?'due-red':'due-green'}">Bal ₹${Utils.fmtNum(r.rrBal)}</div>
          </div>
          <div class="lpc-bal-cell lpc-cr">
            <div class="lpc-bal-label">CR</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(r.crAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(r.crPaid)}</div>
            <div class="lpc-bal-due ${r.crBal>0?'due-red':'due-green'}">Bal ₹${Utils.fmtNum(r.crBal)}</div>
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
            <div class="lpc-bal-due ${totals.brBal>0?'due-red':'due-green'}">Bal ₹${Utils.fmtNum(totals.brBal)}</div>
          </div>
          <div class="lpc-bal-cell lpc-rr">
            <div class="lpc-bal-label">RR Total</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(totals.rrAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(totals.rrPaid)}</div>
            <div class="lpc-bal-due ${totals.rrBal>0?'due-red':'due-green'}">Bal ₹${Utils.fmtNum(totals.rrBal)}</div>
          </div>
          <div class="lpc-bal-cell lpc-cr">
            <div class="lpc-bal-label">CR Total</div>
            <div class="lpc-bal-total">₹${Utils.fmtNum(totals.crAmt)}</div>
            <div class="lpc-bal-sub">Paid ₹${Utils.fmtNum(totals.crPaid)}</div>
            <div class="lpc-bal-due ${totals.crBal>0?'due-red':'due-green'}">Bal ₹${Utils.fmtNum(totals.crBal)}</div>
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
      <td>${r.paymentDate}</td>
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
