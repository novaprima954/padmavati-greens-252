// js/app/bookings.js
Auth.requireAuth();

let allBookings = [];
let bookingCols = [];
let currentRole = '';

document.addEventListener('DOMContentLoaded', () => {
  Header.init('bookings');
  loadBookings();
  document.getElementById('bSearch').addEventListener('input', filterBookings);
  document.getElementById('bStatusFilter').addEventListener('change', filterBookings);
  document.getElementById('panelClose').addEventListener('click', closePanel);
  document.getElementById('panelOverlay').addEventListener('click', closePanel);
});

async function loadBookings() {
  try {
    const data = await API.get({ action:'getBookings' });
    if (data.error) throw new Error(data.error);
    allBookings = data.bookings;
    currentRole = data.role;
    buildColumns(data.role);
    filterBookings();
    document.getElementById('bookingsSubtitle').textContent =
      `${allBookings.length} total bookings`;
  } catch(e) {
    document.getElementById('bookingsTbody').innerHTML =
      `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--grey);">${e.message}</td></tr>`;
  }
}

function buildColumns(role) {
  bookingCols = role==='admin'
    ? ['Receipt No','Booking Date','Booked By Name','Customer Full Name','Phone Number',
       'Plot No','Token Amount','Payment Mode','BR Amount','RR Amount','CR Amount','Status','Action']
    : ['Receipt No','Booking Date','Booked By Name','Customer Full Name','Plot No',
       'Token Amount','Payment Mode','Status','Action'];
  document.getElementById('bookingsThead').innerHTML =
    '<tr>'+bookingCols.map(c=>`<th>${c==='Action'?'':c}</th>`).join('')+'</tr>';
}

function filterBookings() {
  const q  = document.getElementById('bSearch').value.toLowerCase();
  const st = document.getElementById('bStatusFilter').value;
  const filtered = allBookings.filter(b => {
    const mQ  = !q  || Object.values(b).some(v => String(v).toLowerCase().includes(q));
    const mSt = !st || (b['Status']||'')===st;
    return mQ && mSt;
  });
  document.getElementById('bCount').textContent = filtered.length+' records';
  renderTable(filtered);
}

function renderTable(rows) {
  const tbody = document.getElementById('bookingsTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${bookingCols.length}" style="padding:40px;text-align:center;color:var(--grey);">No bookings found</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(b => '<tr>'+bookingCols.map(col => {
    if (col==='Action') {
      let btns = `<button class="btn-view" data-receipt="${b['Receipt No']}">📂 Payments</button>`;
      if (currentRole==='admin' && b['Status']!=='Cancelled')
        btns += ` <button class="btn-cancel" data-receipt="${b['Receipt No']}">✕</button>`;
      return `<td style="white-space:nowrap;">${btns}</td>`;
    }
    if (col==='Status') return `<td>${Utils.statusBadge(b['Status']||'Active')}</td>`;
    if (['Token Amount','BR Amount','RR Amount','CR Amount'].includes(col))
      return `<td>${b[col]?'₹'+Utils.fmtNum(b[col]):'—'}</td>`;
    if (col==='Receipt No')
      return `<td><a href="status.html?receipt=${b[col]}" style="color:var(--forest);font-weight:600;text-decoration:underline;">${b[col]||'—'}</a></td>`;
    return `<td>${b[col]!==undefined&&b[col]!==''?b[col]:'—'}</td>`;
  }).join('')+'</tr>').join('');

  tbody.querySelectorAll('.btn-view').forEach(btn =>
    btn.addEventListener('click', () => openPaymentPanel(btn.dataset.receipt)));
  tbody.querySelectorAll('.btn-cancel').forEach(btn =>
    btn.addEventListener('click', () => cancelBooking(btn.dataset.receipt)));
}

// ── Payment Panel ─────────────────────────────────
async function openPaymentPanel(receiptNo) {
  const panel   = document.getElementById('slidePanel');
  const overlay = document.getElementById('panelOverlay');

  // Reset
  document.getElementById('panelTitle').textContent    = 'Loading…';
  document.getElementById('panelSubtitle').textContent = receiptNo;
  document.getElementById('panelBalances').innerHTML   = '<div class="loading-block"><div class="spinner"></div></div>';
  document.getElementById('paymentsList').innerHTML    = '';
  document.getElementById('addPaymentForm').innerHTML  = '';

  panel.classList.add('open');
  overlay.classList.add('show');

  const [bRes, pRes] = await Promise.all([
    API.get({ action:'getBookingByReceipt', receiptNo }),
    API.get({ action:'getPayments', receiptNo })
  ]);

  const booking  = bRes.booking  || {};
  const payments = pRes.payments || [];

  // Panel title = Customer Name + Plot No
  document.getElementById('panelTitle').textContent    = booking['Customer Full Name'] || receiptNo;
  document.getElementById('panelSubtitle').textContent = `Plot ${booking['Plot No']||'—'} · ${receiptNo}`;

  renderPanelBody(booking, payments, receiptNo);
}

function renderPanelBody(booking, payments, receiptNo) {
  const rrAmt = Number(booking['RR Amount']) || 0;
  const crAmt = Number(booking['CR Amount']) || 0;
  const brAmt = Number(booking['BR Amount']) || 0;
  const sess  = Auth.getSession();

  // Sum from Payments sheet only
  let rrPaid=0, crPaid=0;
  payments.forEach(p => {
    if (p['Against']==='RR') rrPaid += Number(p['Amount'])||0;
    else                      crPaid += Number(p['Amount'])||0;
  });
  const brPaid = rrPaid + crPaid;
  const rrBal  = Math.max(0, rrAmt - rrPaid);
  const crBal  = Math.max(0, crAmt - crPaid);
  const brBal  = Math.max(0, brAmt - brPaid);

  // Schedule dates
  const bdDate = parseDateIN(booking['Booking Date'] || '');
  const d10  = fmtDate(addDays(bdDate, 10));
  const d75  = fmtDate(addDays(bdDate, 75));
  const d165 = fmtDate(addDays(bdDate, 165));

  // Gross part amounts
  const rr1=Math.round(rrAmt*.35), rr2=Math.round(rrAmt*.35), rr3=rrAmt-rr1-rr2;
  const cr1=Math.round(crAmt*.35), cr2=Math.round(crAmt*.35), cr3=crAmt-cr1-cr2;
  const br1=Math.round(brAmt*.35), br2=Math.round(brAmt*.35), br3=brAmt-br1-br2;

  // Net due with spill-over (payments fill Part1 first)
  const rrNets = Utils.calcNetDue([{gross:rr1},{gross:rr2},{gross:rr3}], rrPaid);
  const crNets = Utils.calcNetDue([{gross:cr1},{gross:cr2},{gross:cr3}], crPaid);
  const brNets = Utils.calcNetDue([{gross:br1},{gross:br2},{gross:br3}], brPaid);

  document.getElementById('panelBalances').innerHTML = `
    <div class="bal-grid-3">
      <div class="bal-section bal-br">
        <div class="bal-head">BR</div>
        <div class="bal-row"><span>Total</span><span>₹${Utils.fmtNum(brAmt)}</span></div>
        <div class="bal-row"><span>Paid</span><span>₹${Utils.fmtNum(brPaid)}</span></div>
        <div class="bal-row bal-outstanding"><span>Balance</span><span>₹${Utils.fmtNum(brBal)}</span></div>
      </div>
      <div class="bal-section bal-rr">
        <div class="bal-head">RR</div>
        <div class="bal-row"><span>Total</span><span>₹${Utils.fmtNum(rrAmt)}</span></div>
        <div class="bal-row"><span>Paid</span><span>₹${Utils.fmtNum(rrPaid)}</span></div>
        <div class="bal-row bal-outstanding"><span>Balance</span><span>₹${Utils.fmtNum(rrBal)}</span></div>
      </div>
      <div class="bal-section bal-cr">
        <div class="bal-head">CR</div>
        <div class="bal-row"><span>Total</span><span>₹${Utils.fmtNum(crAmt)}</span></div>
        <div class="bal-row"><span>Paid</span><span>₹${Utils.fmtNum(crPaid)}</span></div>
        <div class="bal-row bal-outstanding"><span>Balance</span><span>₹${Utils.fmtNum(crBal)}</span></div>
      </div>
    </div>
    <div class="schedule-grid">
      <div class="inst-mini inst-br">
        <div class="inst-mini-title">BR Schedule</div>
        <div class="inst-mini-row hdr"><span>Part</span><span>Due Date</span><span>Amount</span><span>Net Due</span></div>
        <div class="inst-mini-row"><span>1 · 35%</span><span>${d10}</span><span>₹${Utils.fmtNum(br1)}</span><span class="${brNets[0].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(brNets[0].netDue)}</span></div>
        <div class="inst-mini-row"><span>2 · 35%</span><span>${d75}</span><span>₹${Utils.fmtNum(br2)}</span><span class="${brNets[1].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(brNets[1].netDue)}</span></div>
        <div class="inst-mini-row"><span>3 · 30%</span><span>${d165}</span><span>₹${Utils.fmtNum(br3)}</span><span class="${brNets[2].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(brNets[2].netDue)}</span></div>
      </div>
      <div class="inst-mini inst-rr">
        <div class="inst-mini-title">RR Schedule</div>
        <div class="inst-mini-row hdr"><span>Part</span><span>Due Date</span><span>Amount</span><span>Net Due</span></div>
        <div class="inst-mini-row"><span>1 · 35%</span><span>${d10}</span><span>₹${Utils.fmtNum(rr1)}</span><span class="${rrNets[0].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(rrNets[0].netDue)}</span></div>
        <div class="inst-mini-row"><span>2 · 35%</span><span>${d75}</span><span>₹${Utils.fmtNum(rr2)}</span><span class="${rrNets[1].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(rrNets[1].netDue)}</span></div>
        <div class="inst-mini-row"><span>3 · 30%</span><span>${d165}</span><span>₹${Utils.fmtNum(rr3)}</span><span class="${rrNets[2].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(rrNets[2].netDue)}</span></div>
      </div>
      <div class="inst-mini inst-cr">
        <div class="inst-mini-title">CR Schedule</div>
        <div class="inst-mini-row hdr"><span>Part</span><span>Due Date</span><span>Amount</span><span>Net Due</span></div>
        <div class="inst-mini-row"><span>1 · 35%</span><span>${d10}</span><span>₹${Utils.fmtNum(cr1)}</span><span class="${crNets[0].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(crNets[0].netDue)}</span></div>
        <div class="inst-mini-row"><span>2 · 35%</span><span>${d75}</span><span>₹${Utils.fmtNum(cr2)}</span><span class="${crNets[1].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(crNets[1].netDue)}</span></div>
        <div class="inst-mini-row"><span>3 · 30%</span><span>${d165}</span><span>₹${Utils.fmtNum(cr3)}</span><span class="${crNets[2].netDue===0?'net-clear':'net-due'}">₹${Utils.fmtNum(crNets[2].netDue)}</span></div>
      </div>
    </div>`;

  // Payment history
  const phEl = document.getElementById('paymentsList');
  if (!payments.length) {
    phEl.innerHTML = '<div style="font-size:.8rem;color:var(--grey);padding:12px 0;">No payments recorded yet</div>';
  } else {
    phEl.innerHTML = `
      <table class="data-table" style="font-size:.78rem;">
        <thead><tr><th>Date</th><th>Receipt</th><th>Amount</th><th>Mode</th><th>Against</th><th>Ref</th><th>By</th><th>Notes</th></tr></thead>
        <tbody>${payments.map(p=>`<tr>
          <td>${p['Payment Date']||'—'}</td>
          <td>${p['Manual Receipt No']||'—'}</td>
          <td><strong>₹${Utils.fmtNum(p['Amount'])}</strong></td>
          <td>${p['Mode']||'—'}</td>
          <td><span class="badge ${p['Against']==='CR'?'badge-booked':'badge-avail'}">${p['Against']||'—'}</span></td>
          <td style="font-size:.7rem;">${p['Reference']||'—'}</td>
          <td style="font-size:.7rem;">${p['Inputter Name']||'—'}</td>
          <td style="font-size:.7rem;color:var(--grey);">${p['Notes']||''}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  }

  // Add payment form
  renderAddPaymentForm('addPaymentForm', receiptNo);
}

function renderAddPaymentForm(containerId, receiptNo) {
  document.getElementById(containerId).innerHTML = `
    <div class="card-title" style="font-size:.95rem;margin-bottom:14px;">+ Add Payment</div>
    <div class="form-row">
      <div class="fg"><label>Date</label>
        <input type="date" id="ap-date-${containerId}" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="fg"><label>Manual Receipt No</label>
        <input type="text" id="ap-rcpt-${containerId}" placeholder="Receipt no."></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Amount (₹) <span class="req">*</span></label>
        <input type="number" id="ap-amt-${containerId}" placeholder="e.g. 50000" min="1"></div>
      <div class="fg"><label>Mode <span class="req">*</span></label>
        <select id="ap-mode-${containerId}">
          <option value="">Select…</option>
          <option>Cash</option><option>NEFT / RTGS</option>
          <option>UPI</option><option>Cheque</option><option>DD</option>
        </select></div>
    </div>
    <div class="fg"><label>Reference</label>
      <input type="text" id="ap-ref-${containerId}" placeholder="UTR / cheque no"></div>
    <div class="fg"><label>Notes</label>
      <input type="text" id="ap-notes-${containerId}" placeholder="Optional"></div>
    <div class="pay-hint">Cash → CR &nbsp;|&nbsp; All other modes → RR</div>
    <button class="btn-submit" id="ap-submit-${containerId}" style="padding:11px;">💾 Save Payment</button>`;

  // Receipt number → auto-set mode
  const apRcpt = document.getElementById(`ap-rcpt-${containerId}`);
  const apMode = document.getElementById(`ap-mode-${containerId}`);
  apRcpt.addEventListener('input', () => {
    const det = Utils.receiptToMode(apRcpt.value);
    if (det && apMode.value === '') { apMode.value = det; }
  });
  apRcpt.addEventListener('blur', () => {
    const det = Utils.receiptToMode(apRcpt.value);
    if (det && apMode.value && apMode.value !== det)
      Utils.toast(`Receipt suggests ${det} — mode is ${apMode.value}`, 'err');
  });
  apMode.addEventListener('change', () => {
    const det = Utils.receiptToMode(apRcpt.value);
    if (apRcpt.value && det && apMode.value && apMode.value !== det)
      Utils.toast(`Receipt suggests ${det} — mode is ${apMode.value}`, 'err');
  });

  document.getElementById(`ap-submit-${containerId}`).addEventListener('click', async () => {
    const amt  = document.getElementById(`ap-amt-${containerId}`).value;
    const mode = document.getElementById(`ap-mode-${containerId}`).value;
    if (!amt||!mode) { Utils.toast('Amount and mode required','err'); return; }
    const btn = document.getElementById(`ap-submit-${containerId}`);
    btn.disabled=true; btn.textContent='Saving…';
    try {
      const res = await API.post({
        action:'addPayment', receiptNo,
        paymentDate:      document.getElementById(`ap-date-${containerId}`).value,
        manualReceiptNo:  document.getElementById(`ap-rcpt-${containerId}`).value.trim(),
        amount: amt, mode,
        reference: document.getElementById(`ap-ref-${containerId}`).value.trim(),
        notes:     document.getElementById(`ap-notes-${containerId}`).value.trim()
      });
      if (res.error) throw new Error(res.error);
      Utils.toast(`Payment saved — against ${res.against}`, 'ok');
      openPaymentPanel(receiptNo); // refresh
    } catch(err) {
      Utils.toast(err.message,'err');
      btn.disabled=false; btn.textContent='💾 Save Payment';
    }
  });
}

function closePanel() {
  document.getElementById('slidePanel').classList.remove('open');
  document.getElementById('panelOverlay').classList.remove('show');
}

async function cancelBooking(receiptNo) {
  const reason = prompt(`Reason for cancelling ${receiptNo}:`);
  if (!reason||!reason.trim()) return;
  if (!confirm(`Cancel ${receiptNo}? Plot will be released.`)) return;
  try {
    const res = await API.post({ action:'cancelBooking', receiptNo, reason:reason.trim() });
    if (res.error) throw new Error(res.error);
    Utils.toast('Booking cancelled.','ok');
    await loadBookings();
  } catch(e) { Utils.toast(e.message,'err'); }
}

// ── Date helpers ──────────────────────────────────
function parseDateIN(str) {
  if (!str) return null;
  const p = String(str).split('/');
  if (p.length===3) return new Date(p[2], p[1]-1, p[0]);
  const d = new Date(str);
  return isNaN(d) ? null : d;
}
function addDays(d, n) {
  if (!d) return null;
  const nd = new Date(d); nd.setDate(nd.getDate()+n); return nd;
}
function fmtDate(d) {
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' });
}
