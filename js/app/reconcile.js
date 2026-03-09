// js/app/reconcile.js
Auth.requireAuth();

let allRows     = [];
let selected    = new Set(); // paymentId set
let pendingAction = null;

document.addEventListener('DOMContentLoaded', () => {
  const sess = Auth.getSession();
  if (!sess || sess.role !== 'admin') { window.location.href = 'index.html'; return; }

  Header.init('reconcile');
  Utils.setupOverlays();

  document.getElementById('rfLoadBtn').addEventListener('click', loadRecon);
  document.getElementById('btnBulkRecon').addEventListener('click', () => bulkAction('reconcile'));
  document.getElementById('btnBulkUnrecon').addEventListener('click', () => bulkAction('unreconcile'));
  document.getElementById('btnSelectAll').addEventListener('click', selectAll);
  document.getElementById('btnClearAll').addEventListener('click', clearAll);
  document.getElementById('confirmUnreconBtn').addEventListener('click', confirmUnrecon);

  // Auto-load unreconciled on open
  loadRecon();
});

// ── LOAD ──────────────────────────────────────────
async function loadRecon() {
  const btn = document.getElementById('rfLoadBtn');
  btn.disabled = true; btn.textContent = 'Loading…';
  const out = document.getElementById('reconOutput');
  out.innerHTML = '<div class="loading-state">Loading payments…</div>';
  selected.clear();
  updateBulkBar();

  try {
    const res = await API.get({
      action:   'getReconciliation',
      filter:   document.getElementById('rfStatus').value,
      dateFrom: document.getElementById('rfDateFrom').value,
      dateTo:   document.getElementById('rfDateTo').value,
      mode:     document.getElementById('rfMode').value,
      against:  document.getElementById('rfAgainst').value,
    });
    if (res.error) { out.innerHTML = `<div class="empty-state"><p>${res.error}</p></div>`; return; }

    allRows = res.rows || [];
    renderSummary(res.summary);
    renderRows();
  } catch(e) {
    out.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Load';
  }
}

// ── SUMMARY ───────────────────────────────────────
function renderSummary(s) {
  document.getElementById('reconSummary').style.display = 'flex';
  document.getElementById('rs-total').textContent      = s.totalCount;
  document.getElementById('rs-totalAmt').textContent   = '₹' + Utils.fmtNum(s.totalAmt);
  document.getElementById('rs-unrecon').textContent    = s.unreconCount;
  document.getElementById('rs-unreconAmt').textContent = '₹' + Utils.fmtNum(s.unreconAmt);
  document.getElementById('rs-recon').textContent      = s.reconCount;
  document.getElementById('rs-reconAmt').textContent   = '₹' + Utils.fmtNum(s.reconAmt);
}

// ── RENDER ROWS ───────────────────────────────────
function renderRows() {
  const out     = document.getElementById('reconOutput');
  const groupBy = document.getElementById('rfGroupBy').value;

  if (!allRows.length) {
    out.innerHTML = '<div class="empty-state"><p>No payments found for the selected filters.</p></div>';
    updateBulkBar();
    return;
  }

  if (groupBy === 'customer') {
    renderGroupedByCustomer(out);
  } else {
    renderGroupedByReceipt(out);
  }
  attachCheckboxListeners();
  updateBulkBar();
}

function renderGroupedByCustomer(out) {
  // Group by receiptNo (booking) → customer
  const groups = new Map();
  allRows.forEach(r => {
    const key = r.receiptNo;
    if (!groups.has(key)) groups.set(key, { receiptNo: r.receiptNo, customer: r.customerName, plot: r.plotNumber, rows: [] });
    groups.get(key).rows.push(r);
  });

  let html = '';
  groups.forEach(g => {
    const unrecon = g.rows.filter(r => !r.reconciled).length;
    const total   = g.rows.reduce((s,r) => s+r.amount, 0);
    html += `
      <div class="recon-group">
        <div class="recon-group-header">
          <div>
            <strong>${g.customer||'—'}</strong>
            <span class="recon-group-sub">Plot ${g.plot||'—'} &nbsp;·&nbsp; ${g.receiptNo}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            ${unrecon > 0 ? `<span class="recon-badge-unreconciled">${unrecon} unreconciled</span>` : '<span class="recon-badge-reconciled">All reconciled</span>'}
            <span style="font-size:.82rem;color:var(--grey);">₹${Utils.fmtNum(total)}</span>
          </div>
        </div>
        ${renderPaymentRows(g.rows)}
      </div>`;
  });
  out.innerHTML = html;
}

function renderGroupedByReceipt(out) {
  // Group by Manual Receipt No
  const groups = new Map();
  allRows.forEach(r => {
    const key = r.manualReceipt || '(no receipt)';
    if (!groups.has(key)) groups.set(key, { key, rows: [] });
    groups.get(key).rows.push(r);
  });

  // Sort keys numerically
  const sorted = [...groups.values()].sort((a, b) => {
    const na = parseInt(a.key), nb = parseInt(b.key);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.key.localeCompare(b.key);
  });

  let html = '';
  sorted.forEach(g => {
    const unrecon = g.rows.filter(r => !r.reconciled).length;
    const total   = g.rows.reduce((s,r) => s+r.amount, 0);
    html += `
      <div class="recon-group">
        <div class="recon-group-header">
          <div>
            <strong>Receipt #${g.key}</strong>
            <span class="recon-group-sub">${g.rows[0]?.customerName||'—'} &nbsp;·&nbsp; Plot ${g.rows[0]?.plotNumber||'—'}</span>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            ${unrecon > 0 ? `<span class="recon-badge-unreconciled">${unrecon} unreconciled</span>` : '<span class="recon-badge-reconciled">All reconciled</span>'}
            <span style="font-size:.82rem;color:var(--grey);">₹${Utils.fmtNum(total)}</span>
          </div>
        </div>
        ${renderPaymentRows(g.rows)}
      </div>`;
  });
  out.innerHTML = html;
}

function renderPaymentRows(rows) {
  return `
    <table class="data-table" style="border-radius:0 0 var(--r) var(--r);border-top:none;">
      <thead><tr>
        <th style="width:36px;"><input type="checkbox" class="recon-group-check" onchange="toggleGroup(this)"></th>
        <th>Date</th><th>Receipt</th><th>Amount</th>
        <th>Mode</th><th>Against</th><th>Notes</th>
        <th>Status</th><th>Reconciled By</th><th>At</th>
        <th>Action</th>
      </tr></thead>
      <tbody>
        ${rows.map(r => {
          const recStyle = r.reconciled
            ? 'background:#f9fffe;'
            : 'background:#fff8f8;';
          return `<tr style="${recStyle}" data-id="${r.paymentId}">
            <td><input type="checkbox" class="recon-row-check" data-id="${r.paymentId}" ${selected.has(r.paymentId)?'checked':''}></td>
            <td style="font-size:.82rem;">${r.paymentDate||'—'}</td>
            <td style="font-size:.82rem;">${r.manualReceipt||'—'}</td>
            <td><strong>₹${Utils.fmtNum(r.amount)}</strong></td>
            <td style="font-size:.82rem;">${r.mode||'—'}</td>
            <td><span class="status-badge" style="background:${r.against==='CR'?'#ffebee':'#e3f2fd'};color:${r.against==='CR'?'#b71c1c':'#1565c0'}">${r.against||'—'}</span></td>
            <td style="font-size:.78rem;color:var(--grey);">${r.notes||'—'}</td>
            <td>
              ${r.reconciled
                ? '<span class="recon-badge-reconciled">✅ Reconciled</span>'
                : '<span class="recon-badge-unreconciled">⏳ Pending</span>'}
            </td>
            <td style="font-size:.78rem;">${r.reconciledBy||'—'}</td>
            <td style="font-size:.78rem;">${r.reconciledAt||'—'}</td>
            <td>
              ${r.reconciled
                ? `<button class="btn-inline-sm btn-unrecon" data-id="${r.paymentId}">↩ Undo</button>`
                : `<button class="btn-inline-sm btn-recon" data-id="${r.paymentId}">✅ Mark</button>`}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
}

function attachCheckboxListeners() {
  document.querySelectorAll('.recon-row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) selected.add(id);
      else selected.delete(id);
      updateBulkBar();
    });
  });
  document.querySelectorAll('.btn-recon').forEach(btn => {
    btn.addEventListener('click', () => {
      selected.clear(); selected.add(btn.dataset.id);
      bulkAction('reconcile');
    });
  });
  document.querySelectorAll('.btn-unrecon').forEach(btn => {
    btn.addEventListener('click', () => {
      selected.clear(); selected.add(btn.dataset.id);
      bulkAction('unreconcile');
    });
  });
}

// ── SELECTION ─────────────────────────────────────
function toggleGroup(groupCb) {
  const table = groupCb.closest('table');
  table.querySelectorAll('.recon-row-check').forEach(cb => {
    cb.checked = groupCb.checked;
    const id = cb.dataset.id;
    if (groupCb.checked) selected.add(id);
    else selected.delete(id);
  });
  updateBulkBar();
}

function selectAll() {
  allRows.forEach(r => selected.add(r.paymentId));
  document.querySelectorAll('.recon-row-check').forEach(cb => { cb.checked = true; });
  updateBulkBar();
}

function clearAll() {
  selected.clear();
  document.querySelectorAll('.recon-row-check').forEach(cb => { cb.checked = false; });
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  bar.style.display = selected.size > 0 ? 'flex' : 'none';
  document.getElementById('selectedCount').textContent = `${selected.size} selected`;
}

// ── BULK ACTIONS ──────────────────────────────────
function bulkAction(action) {
  if (!selected.size) { Utils.toast('Select at least one payment', 'err'); return; }
  if (action === 'unreconcile') {
    pendingAction = 'unreconcile';
    document.getElementById('unreconReason').value = '';
    Utils.openOverlay('unreconModal');
  } else {
    executeSave('reconcile', '');
  }
}

function confirmUnrecon() {
  const reason = document.getElementById('unreconReason').value.trim();
  Utils.closeOverlay('unreconModal');
  executeSave('unreconcile', reason);
}

async function executeSave(action, reason) {
  const updates = [...selected].map(id => ({ paymentId: id, action, reason }));
  const btn = document.getElementById('rfLoadBtn');
  try {
    const res = await API.post({ action: 'saveReconciliation', updates });
    if (res.error) throw new Error(res.error);
    Utils.toast(`✅ ${res.saved} payment(s) ${action === 'reconcile' ? 'reconciled' : 'unreconciled'}`, 'ok');
    selected.clear();
    loadRecon();
  } catch(e) {
    Utils.toast(e.message, 'err');
  }
}
