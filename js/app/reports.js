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
    ledger: ['Customer Ledger', 'Search by customer name to see all plots and balances'],
    dues:   ['Installment Due Report', 'All customers with outstanding installments'],
    excess: ['Excess Payment Report', 'Customers where paid amount exceeds category total'],
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
  }
}

// ── LEDGER ────────────────────────────────────────
async function loadLedger() {
  const name = document.getElementById('ledgerName').value.trim();
  if (!name) { Utils.toast('Enter a customer name','err'); return; }

  const out = document.getElementById('reportOutput');
  out.innerHTML = '<div class="loading-block"><div class="spinner"></div>Loading…</div>';

  try {
    const data = await API.get({ action:'getReportLedger', name });
    if (data.error) throw new Error(data.error);
    renderLedger(data);
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><div class="empty-icon">📒</div><p>${e.message}</p></div>`;
  }
}

function renderLedger(data) {
  const { customerName, rows, totals } = data;

  let html = `
    <div class="ledger-header">
      <div class="ledger-name">${customerName}</div>
      <div class="ledger-sub">${rows.length} plot${rows.length>1?'s':''} · ${rows.filter(r=>r.status==='Active').length} active</div>
    </div>`;

  rows.forEach((r, idx) => {
    const bd     = parseDateIN(r.bookingDateRaw);
    const d10    = fmtDate(addDays(bd,10));
    const d75    = fmtDate(addDays(bd,75));
    const d165   = fmtDate(addDays(bd,165));
    const br1=Math.round(r.brAmt*.35), br2=Math.round(r.brAmt*.35), br3=r.brAmt-br1-br2;
    const rr1=Math.round(r.rrAmt*.35), rr2=Math.round(r.rrAmt*.35), rr3=r.rrAmt-rr1-rr2;
    const cr1=Math.round(r.crAmt*.35), cr2=Math.round(r.crAmt*.35), cr3=r.crAmt-cr1-cr2;

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

        <!-- Balance row -->
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

        <!-- Installment schedule -->
        <div class="lpc-schedule">
          <div class="lpc-sch-title">Installment Schedule</div>
          <table class="sch-table">
            <thead><tr><th>Part</th><th>Due Date</th><th>BR</th><th>RR</th><th>CR</th></tr></thead>
            <tbody>
              <tr><td>1 · 35%</td><td>${d10}</td><td>₹${Utils.fmtNum(br1)}</td><td>₹${Utils.fmtNum(rr1)}</td><td>₹${Utils.fmtNum(cr1)}</td></tr>
              <tr><td>2 · 35%</td><td>${d75}</td><td>₹${Utils.fmtNum(br2)}</td><td>₹${Utils.fmtNum(rr2)}</td><td>₹${Utils.fmtNum(cr2)}</td></tr>
              <tr><td>3 · 30%</td><td>${d165}</td><td>₹${Utils.fmtNum(br3)}</td><td>₹${Utils.fmtNum(rr3)}</td><td>₹${Utils.fmtNum(cr3)}</td></tr>
            </tbody>
          </table>
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

// ── Date helpers ──────────────────────────────────
function parseDateIN(str) {
  if (!str) return null;
  const p=String(str).split('/');
  if (p.length===3) return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0]));
  const d=new Date(str); return isNaN(d)?null:d;
}
function addDays(d,n)  { if(!d) return null; const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function fmtDate(d)    { if(!d) return '—'; return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}); }
