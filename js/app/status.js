// js/app/status.js
Auth.requireAuth();

document.addEventListener('DOMContentLoaded', () => {
  Header.init('status');
  const placeholders = {
    name:  'e.g. Ramesh Sharma',
    phone: 'e.g. 9876543210',
    plot:  'e.g. 12B'
  };
  document.getElementById('searchType').addEventListener('change', () => {
    document.getElementById('receiptInput').placeholder =
      placeholders[document.getElementById('searchType').value] || '';
    document.getElementById('receiptInput').value = '';
  });
  document.getElementById('lookupBtn').addEventListener('click', doSearch);
  document.getElementById('receiptInput').addEventListener('keydown', e => { if(e.key==='Enter') doSearch(); });

  const r = new URLSearchParams(window.location.search).get('receipt');
  if (r) { document.getElementById('receiptInput').value=r; doSearch(); }
});

async function doSearch() {
  const type  = document.getElementById('searchType').value;
  const query = document.getElementById('receiptInput').value.trim();
  if (!query) { Utils.toast('Please enter a search value','err'); return; }

  const card  = document.getElementById('receiptCard');
  const multi = document.getElementById('multiResults');
  const hint  = document.getElementById('statusHint');
  card.classList.remove('show');
  multi.style.display='none';
  hint.style.display='none';

  {
    multi.innerHTML='<div class="loading-block"><div class="spinner"></div>Searching…</div>';
    multi.style.display='block';
    try {
      const data = await API.get({ action:'getBookings' });
      if (data.error) throw new Error(data.error);
      const q = query.toLowerCase();
      const matches = data.bookings.filter(b =>
        type==='name'  ? (b['Customer Full Name']||'').toLowerCase().includes(q) :
        type==='phone' ? (b['Phone Number']||'').includes(q) :
        type==='plot'  ? String(b['Plot No']||'').toLowerCase()===q : false
      );
      if (!matches.length) {
        multi.innerHTML=`<div class="empty-state"><div class="empty-icon">🔍</div><p>No bookings found for "${query}"</p></div>`;
        return;
      }
      if (matches.length===1) {
        multi.style.display='none';
        const receipt = matches[0]['Receipt No'];
        card.innerHTML='<div class="loading-block"><div class="spinner"></div></div>';
        card.classList.add('show');
        const [bRes, pRes] = await Promise.all([
          API.get({ action:'getBookingByReceipt', receiptNo:receipt }),
          API.get({ action:'getPayments', receiptNo:receipt })
        ]);
        if (!bRes.error) renderFullReceipt(bRes.booking, bRes.limited, pRes.payments||[]);
        return;
      }
      multi.innerHTML=`
        <div style="font-size:.82rem;color:var(--grey);margin-bottom:10px;">${matches.length} bookings found — tap to view</div>
        ${matches.map(b=>`
          <div class="multi-result-item" data-receipt="${b['Receipt No']}">
            <div class="mri-left">
              <div class="mri-name">${b['Customer Full Name']||'—'}</div>
              <div class="mri-sub">Plot ${b['Plot No']} · ${b['Booking Date']||''}</div>
            </div>
            <div class="mri-right">
              <div class="mri-receipt">${b['Receipt No']}</div>
              <span class="badge">${b['Status']||'Active'}</span>
            </div>
          </div>`).join('')}`;
      multi.querySelectorAll('.multi-result-item').forEach(item => {
        item.addEventListener('click', async () => {
          multi.style.display='none';
          card.innerHTML='<div class="loading-block"><div class="spinner"></div></div>';
          card.classList.add('show');
          const receipt = item.dataset.receipt;
          const [bRes, pRes] = await Promise.all([
            API.get({ action:'getBookingByReceipt', receiptNo:receipt }),
            API.get({ action:'getPayments', receiptNo:receipt })
          ]);
          if (bRes.error) { Utils.toast(bRes.error,'err'); card.classList.remove('show'); return; }
          renderFullReceipt(bRes.booking, bRes.limited, pRes.payments||[]);
        });
      });
    } catch(e) {
      Utils.toast(e.message,'err');
      multi.style.display='none';
      hint.style.display='block';
    }
  }
}

function renderFullReceipt(b, limited, payments) {
  const card   = document.getElementById('receiptCard');
  const isCxl  = (b['Status']||'').toLowerCase()==='cancelled';

  const rrAmt  = Number(b['RR Amount'])||0;
  const crAmt  = Number(b['CR Amount'])||0;
  const brAmt  = Number(b['BR Amount'])||0;

  // Balances — sum only from Payments sheet
  let rrPaid=0, crPaid=0;
  payments.forEach(p => {
    if (p['Against']==='RR') rrPaid += Number(p['Amount'])||0;
    else                      crPaid += Number(p['Amount'])||0;
  });
  const brPaid = rrPaid+crPaid;
  const rrBal  = Math.max(0, rrAmt-rrPaid);
  const crBal  = Math.max(0, crAmt-crPaid);
  const brBal  = Math.max(0, brAmt-brPaid);

  // Schedule dates
  const bdDate = parseDateIN(b['Booking Date']);
  const d10    = fmtDate(addDays(bdDate,10));
  const d75    = fmtDate(addDays(bdDate,75));
  const d165   = fmtDate(addDays(bdDate,165));

  const rr1=Math.round(rrAmt*.35), rr2=Math.round(rrAmt*.35), rr3=rrAmt-rr1-rr2;
  const cr1=Math.round(crAmt*.35), cr2=Math.round(crAmt*.35), cr3=crAmt-cr1-cr2;
  const br1=Math.round(brAmt*.35), br2=Math.round(brAmt*.35), br3=brAmt-br1-br2;

  // Net due with spill-over
  const rrNets = Utils.calcNetDue([{gross:rr1},{gross:rr2},{gross:rr3}], rrPaid);
  const crNets = Utils.calcNetDue([{gross:cr1},{gross:cr2},{gross:cr3}], crPaid);
  const brNets = Utils.calcNetDue([{gross:br1},{gross:br2},{gross:br3}], brPaid);

  const sess = Auth.getSession();

  let html = `
    <div class="rc-head">
      <div>
        <div class="rc-tag">Booking Receipt · Padmavati Greens</div>
        <h3>${b['Receipt No']}</h3>
        <p>${b['Booking Date']||''}${b['Booking Time']?' at '+b['Booking Time']:''}</p>
      </div>
      <span class="rc-status ${isCxl?'cancelled':''}">${b['Status']||'Active'}</span>
    </div>
    <div class="rc-body">`;

  // Customer section (shown to all — per spec sales can see name for payment purposes)
  html += `
    <div class="rc-section">
      <div class="rc-section-title">Customer & Plot</div>
      <div class="rc-grid">
        <div class="rc-field"><label>Full Name</label><span>${b['Customer Full Name']||'—'}</span></div>
        <div class="rc-field"><label>Phone</label><span>${b['Phone Number']||'—'}</span></div>
        <div class="rc-field"><label>Plot No.</label><span><strong>Plot ${b['Plot No']||'—'}</strong></span></div>
        <div class="rc-field"><label>Area</label><span>${b['Area SqFt']?b['Area SqFt']+' SqFt':'—'}</span></div>
        ${!limited&&b['Aadhaar Number']?`<div class="rc-field"><label>Aadhaar</label><span>${b['Aadhaar Number']}</span></div>`:''}
        ${!limited&&b['Address']?`<div class="rc-field"><label>Address</label><span>${b['Address']}</span></div>`:''}
      </div>
    </div>`;

  // Rates section
  html += `
    <div class="rc-section">
      <div class="rc-section-title">Rate & Amount</div>
      <div class="rc-grid">
        <div class="rc-field"><label>BR</label><span>₹${Utils.fmtNum(b['BR'])}/sqft</span></div>
        <div class="rc-field"><label>RR</label><span>₹${Utils.fmtNum(b['RR'])}/sqft</span></div>
        <div class="rc-field"><label>CR</label><span>₹${Utils.fmtNum(b['CR'])}/sqft</span></div>
        <div class="rc-field"><label>BR Amount</label><span><strong>₹${Utils.fmtNum(brAmt)}</strong></span></div>
        <div class="rc-field"><label>RR Amount</label><span>₹${Utils.fmtNum(rrAmt)}</span></div>
        <div class="rc-field"><label>CR Amount</label><span>₹${Utils.fmtNum(crAmt)}</span></div>
      </div>
    </div>`;

  // Balance cards
  html += `
    <div class="rc-section">
      <div class="rc-section-title">Balance Summary</div>
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
    </div>`;

  // Installment schedules
  function scheduleTable(label, cls, grossArr, nets, dates) {
    const rows = grossArr.map((g,i) => {
      const pcts = ['35%','35%','30%'];
      const nc = nets[i].netDue===0 ? 'net-clear' : 'net-due';
      return `<div class="inst-mini-row"><span>${i+1} · ${pcts[i]}</span><span>${dates[i]}</span><span>₹${Utils.fmtNum(g)}</span><span class="${nc}">₹${Utils.fmtNum(nets[i].netDue)}</span></div>`;
    }).join('');
    return `<div class="inst-mini ${cls}">
      <div class="inst-mini-title">${label} Schedule</div>
      <div class="inst-mini-row hdr"><span>Part</span><span>Due Date</span><span>Amount</span><span>Net Due</span></div>
      ${rows}
    </div>`;
  }

  html += `
    <div class="rc-section">
      <div class="rc-section-title">Installment Schedule</div>
      <div class="schedule-grid">
        ${scheduleTable('BR','inst-br',[br1,br2,br3],brNets,[d10,d75,d165])}
        ${scheduleTable('RR','inst-rr',[rr1,rr2,rr3],rrNets,[d10,d75,d165])}
        ${scheduleTable('CR','inst-cr',[cr1,cr2,cr3],crNets,[d10,d75,d165])}
      </div>
    </div>`;

  // Token / payment info
  html += `
    <div class="rc-section">
      <div class="rc-section-title">Token Payment</div>
      <div class="rc-grid">
        <div class="rc-field"><label>Token Amount</label><span>₹${Utils.fmtNum(b['Token Amount'])}</span></div>
        <div class="rc-field"><label>Payment Mode</label><span>${b['Payment Mode']||'—'}</span></div>
        <div class="rc-field"><label>Reference</label><span>${b['Payment Reference']||'—'}</span></div>
        <div class="rc-field"><label>Receipt No. 1</label><span>${b['Receipt Number 1']||'—'}</span></div>
        ${!limited&&b['Referred By']?`<div class="rc-field"><label>Referred By</label><span>${b['Referred By']}</span></div>`:''}
        ${!limited&&b['Booked By Name']?`<div class="rc-field"><label>Booked By</label><span>${b['Booked By Name']}</span></div>`:''}
      </div>
    </div>`;

  // Payment history
  html += `
    <div class="rc-section">
      <div class="rc-section-title">Payment History</div>`;
  if (!payments.length) {
    html += `<div style="font-size:.82rem;color:var(--grey);padding:8px 0;">No payments recorded.</div>`;
  } else {
    html += `<div class="table-wrap" style="margin-top:8px;">
      <table class="data-table" style="font-size:.78rem;">
        <thead><tr><th>Date</th><th>Receipt</th><th>Amount</th><th>Mode</th><th>Against</th><th>Ref</th><th>By</th></tr></thead>
        <tbody>${payments.map(p=>`<tr>
          <td>${p['Payment Date']||'—'}</td>
          <td>${p['Manual Receipt No']||'—'}</td>
          <td><strong>₹${Utils.fmtNum(p['Amount'])}</strong></td>
          <td>${p['Mode']||'—'}</td>
          <td><span class="badge ${p['Against']==='CR'?'badge-booked':'badge-avail'}">${p['Against']||'—'}</span></td>
          <td>${p['Reference']||'—'}</td>
          <td style="font-size:.7rem;">${p['Inputter Name']||'—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  }
  html += `</div>`;

  // Link to Add Payment page (admin only)
  if (b['Status']!=='Cancelled') {
    html += `
      <div class="rc-section">
        ${sess && sess.role==='admin'
          ? `<a href="addpayment.html" class="btn-submit" style="display:inline-block;text-decoration:none;text-align:center;">💳 Add Payment</a>`
          : `<div class="pay-hint">Contact admin to record payments.</div>`}
      </div>`;
  }

  html += `</div>
    <button class="btn-print" onclick="window.print()">🖨 Print Receipt</button>`;

  card.innerHTML = html;
  card.classList.add('show');

  // Payment form removed — use Add Payment page
}

// ── Reusable add payment form ─────────────────────
function renderAddPaymentForm(containerId, receiptNo) {
  document.getElementById(containerId).innerHTML = `
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
    <button class="btn-submit" id="ap-sub-${containerId}" style="padding:11px;">💾 Save Payment</button>`;

  // Receipt → mode auto-detect
  const sRcpt = document.getElementById(`ap-rcpt-${containerId}`);
  const sMode = document.getElementById(`ap-mode-${containerId}`);
  sRcpt.addEventListener('input', () => {
    const det = Utils.receiptToMode(sRcpt.value);
    if (det && sMode.value === '') { sMode.value = det; }
  });
  sRcpt.addEventListener('blur', () => {
    const det = Utils.receiptToMode(sRcpt.value);
    if (det && sMode.value && sMode.value !== det)
      Utils.toast(`Receipt suggests ${det} — mode is ${sMode.value}`, 'err');
  });

  document.getElementById(`ap-sub-${containerId}`).addEventListener('click', async () => {
    const amt  = document.getElementById(`ap-amt-${containerId}`).value;
    const mode = document.getElementById(`ap-mode-${containerId}`).value;
    if (!amt||!mode) { Utils.toast('Amount and mode required','err'); return; }
    const btn=document.getElementById(`ap-sub-${containerId}`);
    btn.disabled=true; btn.textContent='Saving…';
    try {
      const res = await API.post({
        action:'addPayment', receiptNo,
        paymentDate:     document.getElementById(`ap-date-${containerId}`).value,
        manualReceiptNo: document.getElementById(`ap-rcpt-${containerId}`).value.trim(),
        amount:amt, mode,
        reference: document.getElementById(`ap-ref-${containerId}`).value.trim(),
        notes:     document.getElementById(`ap-notes-${containerId}`).value.trim()
      });
      if (res.error) throw new Error(res.error);
      Utils.toast(`Payment saved — against ${res.against}`,'ok');
      // Refresh the receipt
      const receipt = receiptNo;
      const [bRes,pRes] = await Promise.all([
        API.get({ action:'getBookingByReceipt', receiptNo:receipt }),
        API.get({ action:'getPayments', receiptNo:receipt })
      ]);
      if (!bRes.error) renderFullReceipt(bRes.booking, bRes.limited, pRes.payments||[]);
    } catch(err) {
      Utils.toast(err.message,'err');
      btn.disabled=false; btn.textContent='💾 Save Payment';
    }
  });
}

// ── Date helpers ──────────────────────────────────
function parseDateIN(str) {
  if (!str) return null;
  const p=String(str).split('/');
  if (p.length===3) return new Date(p[2],p[1]-1,p[0]);
  const d=new Date(str); return isNaN(d)?null:d;
}
function addDays(d,n) { if(!d) return null; const nd=new Date(d); nd.setDate(nd.getDate()+n); return nd; }
function fmtDate(d)   { if(!d) return '—'; return d.toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}); }
