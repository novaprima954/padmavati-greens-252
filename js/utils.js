// ============================================================
// js/utils.js — Shared helpers used across all pages
// ============================================================

const Utils = (() => {

  let toastTimer = null;

  function toast(msg, type = '') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className   = (type ? type + ' ' : '') + 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  }

  function fmtNum(n) {
    if (n === '' || n === null || n === undefined) return '0';
    return Number(n).toLocaleString('en-IN');
  }

  function fmtCurrency(n) {
    if (!n) return '—';
    return '₹' + fmtNum(n);
  }

  function openOverlay(id)  { document.getElementById(id)?.classList.add('show'); }
  function closeOverlay(id) { document.getElementById(id)?.classList.remove('show'); }

  function setupOverlays() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => closeOverlay(btn.dataset.close));
    });
    document.querySelectorAll('.overlay').forEach(o => {
      o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
    });
  }

  function setLoading(elId, cols = 5) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = `<div class="loading-block" ${cols > 1 ? `style="grid-column:1/-1"` : ''}>
      <div class="spinner"></div>Loading…
    </div>`;
  }

  function statusBadge(status) {
    const map = {
      Available: 'badge-avail',
      Booked:    'badge-booked',
      Reserved:  'badge-res',
      Active:    'badge-avail',
      Cancelled: 'badge-booked'
    };
    return `<span class="badge ${map[status] || ''}">${status}</span>`;
  }


  // ── Net due with spill-over logic ──────────────
  // payments fill Part1 first, overflow into Part2, then Part3
  // parts = [{gross: number}, {gross: number}, {gross: number}]
  // totalPaid = total paid for this category (RR or CR)
  // returns [{gross, netDue}, ...]
  function calcNetDue(parts, totalPaid) {
    let remaining = totalPaid;
    return parts.map(p => {
      const absorbed = Math.min(remaining, p.gross);
      remaining -= absorbed;
      return { gross: p.gross, netDue: Math.max(0, p.gross - absorbed) };
    });
  }

  // ── Receipt → mode detection ──────────────────
  // 1-2000 = Cash, else non-cash
  function receiptToMode(receiptVal) {
    const n = parseInt(String(receiptVal).trim());
    if (!isNaN(n) && n >= 1 && n <= 2000) return 'Cash';
    return null; // non-cash but don't assume specific mode
  }

  return { toast, fmtNum, fmtCurrency, openOverlay, closeOverlay, setupOverlays, setLoading, statusBadge, calcNetDue, receiptToMode };
})();
