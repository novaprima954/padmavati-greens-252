// js/app/plots.js
// Auth check runs immediately — before DOMContentLoaded
Auth.requireAuth();

let allPlots   = [];
let plotFilter = 'All';

document.addEventListener('DOMContentLoaded', () => {
  Header.init('plots');
  Utils.setupOverlays();
  loadPlots();

  document.getElementById('plotSearch').addEventListener('input', filterPlots);
  document.getElementById('zoneFilter').addEventListener('change', filterPlots);

  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => setChip(chip.dataset.filter, chip));
  });
});

async function loadPlots() {
  try {
    const data = await API.get({ action: 'getPlots' });
    if (data.error) throw new Error(data.error);
    allPlots = data.plots;
    populateZones(allPlots);
    filterPlots();
  } catch(e) {
    document.getElementById('plotGrid').innerHTML =
      `<div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">⚠️</div>
        <p>${e.message}</p>
       </div>`;
  }
}

function populateZones(plots) {
  const zones = [...new Set(plots.map(p => p['Zone']).filter(Boolean))].sort();
  const sel   = document.getElementById('zoneFilter');
  sel.innerHTML = '<option value="">All Zones</option>' +
    zones.map(z => `<option value="${z}">Zone ${z}</option>`).join('');
}

function filterPlots() {
  const q    = document.getElementById('plotSearch').value.toLowerCase().trim();
  const zone = document.getElementById('zoneFilter').value;

  const filtered = allPlots.filter(p => {
    const status = p['Status'] || 'Available';
    const matchF =
      plotFilter === 'All'    ? true :
      plotFilter === 'Corner' ? p['Corner'] === 'Yes' :
                                status === plotFilter;
    const matchQ = !q || String(p['Plot No']).includes(q) ||
                   String(p['Sr No']||'').includes(q) ||
                   (p['Zone']||'').toLowerCase().includes(q);
    const matchZ = !zone || p['Zone'] === zone;
    return matchF && matchQ && matchZ;
  });

  renderPlots(filtered);
}

function renderPlots(plots) {
  const grid = document.getElementById('plotGrid');
  document.getElementById('plotCount').textContent = plots.length + ' plots';

  if (!plots.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><p>No plots match your filter</p></div>';
    return;
  }

  grid.innerHTML = plots.map(p => {
    const status   = p['Status'] || 'Available';
    const isCorner = p['Corner'] === 'Yes';
    const sqm      = p['Area SqM'];
    const sqft     = p['Area SqFt'];
    const total    = p['Total Amount'];
    const ppsqft   = p['Price per sqft'];
    const area     = [sqm ? sqm+' SqM' : '', sqft ? sqft+' SqFt' : ''].filter(Boolean).join(' / ');
    const price    = total ? '₹'+Utils.fmtNum(total) : ppsqft ? '₹'+Utils.fmtNum(ppsqft)+'/sqft' : null;

    return `<div class="plot-card ${status}" data-plot="${p['Plot No']}">
      ${isCorner ? '<span class="corner-tag">★ Corner</span>' : ''}
      ${p['Sr No'] ? `<div class="pc-srno">Sr. ${p['Sr No']}</div>` : ''}
      <div class="pc-num">Plot ${p['Plot No']}</div>
      ${area ? `<div class="pc-area">${area}</div>` : ''}
      ${p['Zone'] ? `<div class="pc-zone">Zone ${p['Zone']}</div>` : ''}
      <div class="${price ? 'pc-price' : 'pc-price none'}">${price || 'Price on request'}</div>
      <span class="badge ${status}">${status}</span>
    </div>`;
  }).join('');

  grid.querySelectorAll('.plot-card').forEach(card => {
    card.addEventListener('click', () => openPlotModal(card.dataset.plot));
  });
}

function setChip(filter, btn) {
  plotFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
  filterPlots();
}

function openPlotModal(plotNo) {
  const p = allPlots.find(x => String(x['Plot No']) === String(plotNo));
  if (!p) return;

  document.getElementById('plotModalTitle').textContent = `Plot ${p['Plot No']}`;
  const status = p['Status'] || 'Available';
  const sqm    = p['Area SqM'], sqft = p['Area SqFt'];
  const total  = p['Total Amount'], ppsqft = p['Price per sqft'];

  const rows = [
    ['Sr. No',   p['Sr No'] || '—'],
    ['Area',     [sqm?sqm+' SqM':'', sqft?sqft+' SqFt':''].filter(Boolean).join(' / ') || '—'],
    ['Zone',     p['Zone'] || '—'],
    ['Corner',   p['Corner'] === 'Yes' ? '★ Yes' : 'No'],
    ['Notes',    p['Notes'] || '—'],
  ];

  let body = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
    ${rows.map(([l,v]) => `<div>
      <div style="font-size:.7rem;color:var(--grey);margin-bottom:2px;">${l}</div>
      <div style="font-size:.9rem;font-weight:500;">${v}</div>
    </div>`).join('')}
  </div>`;

  if (total || ppsqft) {
    body += `<div style="background:var(--mist);border-radius:10px;padding:14px;margin-bottom:14px;text-align:center;">
      ${ppsqft ? `<div style="font-size:.75rem;color:var(--grey);">Rate</div>
      <div style="font-size:.95rem;font-weight:600;color:var(--forest);">₹${Utils.fmtNum(ppsqft)} / SqFt</div>` : ''}
      ${total ? `<div style="font-size:.75rem;color:var(--grey);margin-top:${ppsqft?8:0}px;">Total Amount</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:1.9rem;font-weight:700;color:var(--forest);">₹${Utils.fmtNum(total)}</div>` : ''}
    </div>`;
  }

  const statusCfg = {
    Available: ['var(--leaf-l)', '#2e7d32',    '✅ Available for booking'],
    Booked:    ['var(--red-l)',  'var(--red)',  `✗ Booked by ${p['Booked By']||'N/A'} on ${p['Booking Date']||''}`],
    Reserved:  ['var(--amber-l)','var(--amber)','⏳ Currently reserved']
  };
  const [bg, fg, msg] = statusCfg[status] || statusCfg.Available;
  body += `<div style="background:${bg};color:${fg};border-radius:8px;padding:10px 14px;font-size:.85rem;font-weight:600;">${msg}</div>`;

  document.getElementById('plotModalBody').innerHTML = body;
  const actions = document.getElementById('plotModalActions');
  if (status === 'Available') {
    actions.innerHTML = `<a href="booking.html?plot=${p['Plot No']}" class="btn-submit" style="display:block;text-align:center;margin-top:16px;">📝 Book This Plot</a>`;
  } else {
    actions.innerHTML = '';
  }
  Utils.openOverlay('plotModal');
}
