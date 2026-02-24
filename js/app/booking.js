// js/app/booking.js
Auth.requireAuth();

let allPlots    = [];
let selPlotNo   = null;
let lastBooking = null;

// Map rows derived from the survey PDF plot index
const MAP_ROWS = [
  { label: null,      plots: ['1','2A','2B','3A','3B','4A','4B','5A','5B','6A','6B','7A','7B','8A','8B','9A','9B','10A','10B','11A','11B','12A','12B','13A','13B','14A','14B'] },
  { label: '9M ROAD', plots: ['15A','15B','16A','16B','17A','17B','18A','18B','19A','19B','20A','20B','21A','21B','22A','22B','23A','23B','24A','24B','25A','25B','26A','26B','27A','27B','28A','28B','29'] },
  { label: '9M ROAD', plots: ['30A','30B','31','32A','32B','33A','33B','34A','34B','35A','35B','36A','36B','37A','37B','38A','38B','39A','39B','40A','40B','41A','41B','42A','42B','43','44A','44B','45','46'] },
  { label: '9M ROAD', plots: ['47A','47B','48A','48B','49A','49B','50A','50B','51A','51B','52A','52B','53A','53B','54A','54B','55A','55B','56A','56B','57A','57B','58A','58B','59','60A','60B','61','62'] },
  { label: '12M ROAD',plots: ['63A','63B','64A','64B','65A','65B','66A','66B','67A','67B','68A','68B','69A','69B','70A','70B','71A','71B','72A','72B','73A','73B','74A','74B','75A','75B','76'] },
  { label: '9M ROAD', plots: ['77A','77B','78A','78B','79A','79B','80A','80B','81A','81B','82A','82B','83A','83B','84A','84B','85A','85B','86A','86B','87A','87B','88A','88B','89','90'] },
  { label: '9M ROAD', plots: ['91A','91B','92A','92B','93A','93B','94A','94B','95A','95B','96A','96B','97A','97B','98A','98B','99','100A','100B'] },
  { label: '9M ROAD', plots: ['101','102A','102B','103A','103B','104A','104B','105A','105B','106A','106B','107A','107B','108A','108B','109A','109B','110','111A','111B'] },
  { label: '12M ROAD',plots: ['112A','112B','113A','113B','114A','114B','115A','115B','116A','116B','117A','117B','118A','118B','119A','119B','120A','120B','121A','121B','122A','122B','123'] },
  { label: '9M ROAD', plots: ['124A','124B','125A','125B','126A','126B','127A','127B','128A','128B','129A','129B','130A','130B','131A','131B','132A','132B','133A','133B','134A','134B','135'] },
  { label: '9M ROAD', plots: ['136A','136B','137A','137B','138A','138B','139A','139B','140A','140B','141A','141B','142A','142B','143A','143B','144A','144B','145'] },
  { label: '9M ROAD', plots: ['146A','146B','147A','147B','148A','148B','149A','149B','150A','150B','151A','151B','152A','152B','153'] },
  { label: '17M ROAD',plots: ['154A','154B','155A','155B','156A','156B','157A','157B','158A','158B','159A','159B','160A','160B','161A','161B','162A','162B','163A','163B','164A','164B','165','166','167','168','169','170','171','172','173'] },
  { label: '9M ROAD', plots: ['174A','174B','175A','175B','176A','176B','177A','177B','178A','178B','179A','179B','180A','180B','181A','181B','182A','182B'] },
  { label: '12M ROAD',plots: ['183A','183B','184A','184B','185A','185B','186A','186B','187A','187B','188A','188B','189A','189B','190A','190B','191A','191B'] },
];

document.addEventListener('DOMContentLoaded', () => {
  Header.init('booking');
  Utils.setupOverlays();
  loadPlots();
  setupPickerTabs();
  document.getElementById('bookingForm').addEventListener('submit', submitBooking);
  document.getElementById('waShareBtn').addEventListener('click', shareWhatsApp);
});

function setupPickerTabs() {
  document.querySelectorAll('.picker-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.picker-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      document.getElementById('pickerGrid').style.display = view === 'grid' ? 'block' : 'none';
      document.getElementById('pickerMap').style.display  = view === 'map'  ? 'block' : 'none';
      if (view === 'map' && allPlots.length) renderSvgMap();
    });
  });
}

async function loadPlots() {
  try {
    const data = await API.get({ action: 'getPlots' });
    if (data.error) throw new Error(data.error);
    allPlots = data.plots;
    renderBplotGrid(allPlots);
    const params = new URLSearchParams(window.location.search);
    const pp = params.get('plot');
    if (pp) selectBplot(pp);
  } catch(e) {
    document.getElementById('bplotGrid').innerHTML =
      `<div class="empty-state"><div class="empty-icon">⚠️</div><p>${e.message}</p></div>`;
  }
}

function renderBplotGrid(plots) {
  const grid = document.getElementById('bplotGrid');
  if (!plots.length) { grid.innerHTML = '<div style="font-size:.8rem;color:var(--grey);padding:10px;">No plots</div>'; return; }
  grid.innerHTML = plots.map(p => {
    const status = p['Status'] || 'Available';
    const cls    = status === 'Available' ? 'av' : status === 'Booked' ? 'bk' : 'rs';
    const area   = p['Area SqFt'] ? p['Area SqFt']+'sqft' : p['Area SqM'] ? p['Area SqM']+'sqm' : '';
    return `<button class="bplot-btn ${cls}" ${status!=='Available'?'disabled':''} data-plot="${p['Plot No']}" id="bp-${p['Plot No']}"
      title="Plot ${p['Plot No']} · Zone ${p['Zone']||'—'} · ${area}">
      ${p['Plot No']}<br><small style="font-size:.58rem;font-weight:400;">${area}</small>
    </button>`;
  }).join('');
  grid.querySelectorAll('.bplot-btn.av').forEach(btn => {
    btn.addEventListener('click', () => selectBplot(btn.dataset.plot));
  });
}

function renderSvgMap() {
  const svg = document.getElementById('layoutSvg');
  if (!svg) return;

  const plotStatus = {};
  allPlots.forEach(p => { plotStatus[String(p['Plot No'])] = p['Status'] || 'Available'; });

  const CW = 36, RH = 22;
  const ROAD_H = { '9M ROAD':11, '12M ROAD':15, '17M ROAD':20 };
  const PX = 6, PY = 8;
  const maxCols = Math.max(...MAP_ROWS.map(r => r.plots.length));

  let html = '', y = PY;

  MAP_ROWS.forEach(row => {
    if (row.label) {
      const rh = ROAD_H[row.label] || 11;
      const rc = row.label.startsWith('17') ? '#b0bec5' : row.label.startsWith('12') ? '#cfd8dc' : '#eceff1';
      html += `<rect x="${PX}" y="${y}" width="${maxCols*CW}" height="${rh}" fill="${rc}" rx="2"/>`;
      html += `<text x="${PX + maxCols*CW/2}" y="${y+rh/2+3}" text-anchor="middle" font-size="6.5" fill="#546e7a" font-family="Outfit,sans-serif">${row.label}</text>`;
      y += rh + 2;
    }
    row.plots.forEach((pno, ci) => {
      const status = plotStatus[pno] || 'Unknown';
      const isSel  = String(pno) === String(selPlotNo);
      const x = PX + ci * CW;
      const fill =
        isSel              ? '#1b4332' :
        status==='Available' ? '#c8e6c9' :
        status==='Booked'    ? '#ffcdd2' :
        status==='Reserved'  ? '#fff9c4' : '#eeeeee';
      const stroke = isSel ? '#52b788' : '#b0bfc8';
      const tc = isSel ? '#fff' : status==='Available' ? '#1b5e20' : status==='Booked' ? '#b71c1c' : '#e65100';
      const fs = pno.length > 4 ? 5 : 6;
      html += `<g${status==='Available'?' data-svgplot="'+pno+'"':''} style="cursor:${status==='Available'?'pointer':'default'}">
        <rect x="${x}" y="${y}" width="${CW-2}" height="${RH-2}" fill="${fill}" stroke="${stroke}" stroke-width="${isSel?2:0.8}" rx="2"/>
        <text x="${x+(CW-2)/2}" y="${y+RH/2+2}" text-anchor="middle" font-size="${fs}" fill="${tc}" font-family="Outfit,sans-serif" font-weight="${isSel?700:500}">${pno}</text>
      </g>`;
    });
    y += RH;
  });

  svg.setAttribute('viewBox', `0 0 ${maxCols*CW+PX*2} ${y+PY}`);
  svg.innerHTML = html;

  svg.querySelectorAll('[data-svgplot]').forEach(el => {
    el.addEventListener('click', () => {
      selectBplot(el.dataset.svgplot);
      renderSvgMap();
    });
  });
}

function selectBplot(plotNo) {
  if (selPlotNo) {
    const prev = document.getElementById('bp-' + selPlotNo);
    if (prev) prev.classList.remove('sel');
  }
  selPlotNo = String(plotNo);
  const btn = document.getElementById('bp-' + selPlotNo);
  if (btn) { btn.classList.add('sel'); btn.scrollIntoView({ behavior:'smooth', block:'nearest' }); }

  const p = allPlots.find(x => String(x['Plot No']) === selPlotNo);
  if (!p) return;

  const sqm = p['Area SqM'], sqft = p['Area SqFt'];
  const total = p['Total Amount'], ppsqft = p['Price per sqft'];

  document.getElementById('psSummary').innerHTML = [
    ['Sr. No',   p['Sr No'] || '—'],
    ['Plot No',  'Plot ' + p['Plot No']],
    ['Area SqM', sqm  ? sqm  + ' SqM'  : '—'],
    ['Area SqFt',sqft ? sqft + ' SqFt' : '—'],
    ['Zone',     p['Zone']   || '—'],
    ['Corner',   p['Corner']==='Yes' ? '★ Yes' : 'No'],
    ['Rate',     ppsqft ? '₹'+Utils.fmtNum(ppsqft)+'/sqft' : '—'],
  ].map(([l,v]) =>
    `<div class="ps-row"><span class="ps-label">${l}</span><span class="ps-value">${v}</span></div>`
  ).join('') + `<div class="ps-row"><span class="ps-label">Total Price</span>
    <span class="ps-value ps-price">${total ? '₹'+Utils.fmtNum(total) : 'On Request'}</span></div>`;

  document.getElementById('submitBtn').disabled = false;
}

async function submitBooking(e) {
  e.preventDefault();
  if (!selPlotNo) { Utils.toast('Please select a plot first', 'err'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = '⏳ Processing…';

  const session = Auth.getSession();
  const payload = {
    action:'createBooking', plotNo:selPlotNo,
    customerName: document.getElementById('f-name').value.trim(),
    phone:        document.getElementById('f-phone').value.trim(),
    aadhaar:      document.getElementById('f-aadhaar').value.trim(),
    pan:          document.getElementById('f-pan').value.trim().toUpperCase(),
    address:      document.getElementById('f-address').value.trim(),
    receiptNo1:   document.getElementById('f-receipt1').value.trim(),
    tokenAmount:  document.getElementById('f-token').value,
    paymentMode:  document.getElementById('f-paymode').value,
    paymentRef:   document.getElementById('f-payref').value.trim(),
    referredBy:   document.getElementById('f-refby').value.trim(),
    remarks:      document.getElementById('f-remarks').value.trim()
  };

  try {
    const res = await API.post(payload);
    if (res.error) throw new Error(res.error);

    lastBooking = { ...res, phone: payload.phone, paymentMode: payload.paymentMode };

    document.getElementById('successReceiptNo').textContent = res.receiptNo;
    document.getElementById('successDetails').innerHTML =
      `<strong>${res.customerName}</strong><br>` +
      `Plot ${res.plotNo}${res.plotPrice ? ' · ₹'+Utils.fmtNum(res.plotPrice) : ''}<br>` +
      `Token: ₹${Utils.fmtNum(res.tokenAmount)}<br>` +
      `Date: ${res.bookingDate} · By: ${session.name||session.username}`;
    Utils.openOverlay('successModal');

    document.getElementById('bookingForm').reset();
    const bBtn = document.getElementById('bp-' + selPlotNo);
    if (bBtn) { bBtn.classList.remove('sel','av'); bBtn.classList.add('bk'); bBtn.disabled = true; }
    selPlotNo = null;
    document.getElementById('psSummary').innerHTML =
      '<div class="ps-empty">No plot selected.<br>Choose from the grid above.</div>';
    document.getElementById('submitBtn').disabled = true;
    if (document.getElementById('pickerMap').style.display !== 'none') renderSvgMap();

  } catch(err) { Utils.toast(err.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '📋 Confirm Booking'; }
}

function shareWhatsApp() {
  if (!lastBooking) return;
  const b = lastBooking;
  const msg =
    `🌿 *Padmavati Greens* – Booking Confirmation\n\n` +
    `📋 Receipt No: ${b.receiptNo}\n` +
    `👤 Name: ${b.customerName}\n` +
    `📱 Mobile: ${b.phone || '—'}\n` +
    `📍 Plot No: ${b.plotNo}\n` +
    `💰 Token Amount: ₹${Utils.fmtNum(b.tokenAmount)}\n` +
    `💳 Payment Mode: ${b.paymentMode || '—'}\n` +
    `📅 Date: ${b.bookingDate}\n\n` +
    `Layout No. 712 · Survey No. 274 · Yavatmal`;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}
