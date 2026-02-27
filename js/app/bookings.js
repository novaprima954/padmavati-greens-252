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

  // Close slide-in panel
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
    const sub = data.role==='admin'
      ? `${allBookings.length} total bookings — full admin view`
      : `${allBookings.length} bookings`;
    document.getElementById('bookingsSubtitle').textContent = sub;
  } catch(e) {
    document.getElementById('bookingsTbody').innerHTML =
      `<tr><td colspan="10" style="padding:30px;text-align:center;color:var(--grey);">${e.message}</td></tr>`;
  }
}

function buildColumns(role) {
  const isAdmin = role==='admin';
  bookingCols = isAdmin
    ? ['Receipt No','Booking Date','Booked By Name','Customer Full Name','Phone Number',
       'Plot No','Token Amount','Payment Mode','BR Amount','RR Amount','CR Amount','Status','Action']
    : ['Receipt No','Booking Date','Booked By Name','Plot No','Token Amount','Payment Mode','Status'];
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
        btns += ` <button class="btn-cancel" data-receipt="${b['Receipt No']}">✕ Cancel</button>`;
      return `<td style="white-space:nowrap;">${btns}</td>`;
    }
    if (col==='Status') return `<td>${Utils.statusBadge(b['Status']||'Active')}</td>`;
    if (['Token Amount','BR Amount','RR Amount','CR Amount'].includes(col))
      return `<td>${b[col] ? '₹'+Utils.fmtNum(b[col]) : '—'}</td>`;
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
  const panel = document.getElementById('slidePanel');
  const overlay = document.getElementById('panelOverlay');

  document.getElementById('panelReceiptNo').textContent = receiptNo;
  document.getElementById('paymentsList').innerHTML =
    '<div class="loading-block"><div class="spinner"></div>Loading…</div>';
  document.getElementById('panelBalances').innerHTML = '';

  panel.classList.add('open');
  overlay.classList.add('show');

  // Get booking details + payments
  const [bRes, pRes] = await Promise.all([
    API.get({ action:'getBookingByReceipt', receiptNo }),
    API.get({ action:'getPayments', receiptNo })
  ]);

  const booking  = bRes.booking || {};
  const payments = pRes.payments || [];

  // Balances
  const rrAmt = Number(booking['RR Amount']) || 0;
  const crAmt = Number(booking['CR Amount']) || 0;
  const tokenAmt  = Number(booking['Token Amount']) || 0;
  const tokenMode = booking['Payment Mode'] || '';
  const tokenIsRR = tokenMode !== 'Cash';

  // Sum payments (excluding token which is already in payments sheet)
  let rrPaid = tokenIsRR ? tokenAmt : 0;
  let crPaid = tokenIsRR ? 0 : tokenAmt;
  payments.forEach(p => {
    if (p['Against']==='RR') rrPaid += Number(p['Amount'])||0;
    else                      crPaid += Number(p['Amount'])||0;
  });
  const rrBal = Math.max(0, rrAmt - rrPaid);
  const crBal = Math.max(0, crAmt - crPaid);

  // Installments (based on booking date)
  const bdStr = booking['Booking Date'] || '';
  let bdDate  = null;
  if (bdStr) {
    const parts = bdStr.split('/');
    if (parts.length===3) bdDate = new Date(parts[2], parts[1]-1, parts[0]);
  }
  function addDays(d, n) {
    if (!d) return '—';
    const nd = new Date(d); nd.setDate(nd.getDate()+n);
    return nd.toLocaleDateString('en-IN');
  }

  document.getElementById('panelBalances').innerHTML = `
    <div class="bal-grid">
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
    <div class="inst-mini">
      <div class="inst-mini-title">Schedule (RR)</div>
      <div class="inst-mini-row"><span>35% · ${addDays(bdDate,30)}</span><span>₹${Utils.fmtNum(Math.round(rrAmt*.35))}</span></div>
      <div class="inst-mini-row"><span>35% · ${addDays(bdDate,60)}</span><span>₹${Utils.fmtNum(Math.round(rrAmt*.35))}</span></div>
      <div class="inst-mini-row"><span>30% · ${addDays(bdDate,90)}</span><span>₹${Utils.fmtNum(rrAmt - Math.round(rrAmt*.35)*2)}</span></div>
    </div>
    <div class="inst-mini cr-inst">
      <div class="inst-mini-title">Schedule (CR)</div>
      <div class="inst-mini-row"><span>35% · ${addDays(bdDate,30)}</span><span>₹${Utils.fmtNum(Math.round(crAmt*.35))}</span></div>
      <div class="inst-mini-row"><span>35% · ${addDays(bdDate,60)}</span><span>₹${Utils.fmtNum(Math.round(crAmt*.35))}</span></div>
      <div class="inst-mini-row"><span>30% · ${addDays(bdDate,90)}</span><span>₹${Utils.fmtNum(crAmt - Math.round(crAmt*.35)*2)}</span></div>
    </div>`;

  // Payments list
  if (!payments.length) {
    document.getElementById('paymentsList').innerHTML =
      '<div class="empty-state" style="padding:20px;"><div class="empty-icon">💳</div><p>No additional payments recorded</p></div>';
  } else {
    document.getElementById('paymentsList').innerHTML = `
      <table class="data-table" style="font-size:.8rem;">
        <thead><tr><th>Date</th><th>Receipt</th><th>Amount</th><th>Mode</th><th>Against</th><th>Ref</th><th>By</th></tr></thead>
        <tbody>${payments.map(p=>`<tr>
          <td>${p['Payment Date']||'—'}</td>
          <td>${p['Manual Receipt No']||'—'}</td>
          <td>₹${Utils.fmtNum(p['Amount'])}</td>
          <td>${p['Mode']||'—'}</td>
          <td><span class="badge ${p['Against']==='CR'?'badge-booked':'badge-avail'}">${p['Against']||'—'}</span></td>
          <td style="font-size:.72rem;">${p['Reference']||'—'}</td>
          <td style="font-size:.72rem;">${p['Inputter Name']||'—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  }

  // Add payment form (admin only or own bookings)
  document.getElementById('addPaymentForm').innerHTML = `
    <div class="card-title" style="font-size:.95rem;margin-bottom:14px;">+ Add Payment</div>
    <div class="form-row">
      <div class="fg"><label>Date</label>
        <input type="date" id="ap-date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="fg"><label>Manual Receipt No</label>
        <input type="text" id="ap-rcpt" placeholder="Receipt no."></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Amount (₹) <span class="req">*</span></label>
        <input type="number" id="ap-amt" placeholder="e.g. 50000" min="1"></div>
      <div class="fg"><label>Mode <span class="req">*</span></label>
        <select id="ap-mode">
          <option value="">Select…</option>
          <option>Cash</option><option>NEFT / RTGS</option>
          <option>UPI</option><option>Cheque</option><option>DD</option>
        </select></div>
    </div>
    <div class="fg"><label>Reference</label>
      <input type="text" id="ap-ref" placeholder="UTR / cheque no"></div>
    <div class="fg"><label>Notes</label>
      <input type="text" id="ap-notes" placeholder="Optional"></div>
    <div style="font-size:.76rem;color:var(--grey);margin-bottom:10px;">
      Cash → counted against CR &nbsp;|&nbsp; All other modes → against RR
    </div>
    <button class="btn-submit" id="ap-submit" style="padding:11px;">💾 Save Payment</button>`;

  document.getElementById('ap-submit').addEventListener('click', async () => {
    const amt  = document.getElementById('ap-amt').value;
    const mode = document.getElementById('ap-mode').value;
    if (!amt || !mode) { Utils.toast('Amount and mode required','err'); return; }

    const apBtn = document.getElementById('ap-submit');
    apBtn.disabled=true; apBtn.textContent='Saving…';

    const dateRaw = document.getElementById('ap-date').value;
    const dp = dateRaw.split('-');
    const payDate = dp.length===3 ? `${dp[2]}/${dp[1]}/${dp[0]}` : dateRaw;

    try {
      const res = await API.post({
        action:'addPayment', receiptNo,
        paymentDate: payDate,
        manualReceiptNo: document.getElementById('ap-rcpt').value.trim(),
        amount: amt, mode,
        reference: document.getElementById('ap-ref').value.trim(),
        notes: document.getElementById('ap-notes').value.trim()
      });
      if (res.error) throw new Error(res.error);
      Utils.toast(`Payment saved — against ${res.against}`,'ok');
      openPaymentPanel(receiptNo); // refresh panel
    } catch(err) {
      Utils.toast(err.message,'err');
      apBtn.disabled=false; apBtn.textContent='💾 Save Payment';
    }
  });
}

function closePanel() {
  document.getElementById('slidePanel').classList.remove('open');
  document.getElementById('panelOverlay').classList.remove('show');
}

async function cancelBooking(receiptNo) {
  const reason = prompt(`Reason for cancelling ${receiptNo} (required):`);
  if (!reason||!reason.trim()) return;
  if (!confirm(`Cancel booking ${receiptNo}?\nPlot will be released back to Available.`)) return;
  try {
    const res = await API.post({ action:'cancelBooking', receiptNo, reason:reason.trim() });
    if (res.error) throw new Error(res.error);
    Utils.toast('Booking cancelled. Plot released.','ok');
    await loadBookings();
  } catch(e) { Utils.toast(e.message,'err'); }
}
