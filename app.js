/* ── Config ─────────────────────────────────────────── */
var SUPA_URL     = 'https://xiyfxsoiaclvdkphqpty.supabase.co';
var SUPA_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpeWZ4c29pYWNsdmRrcGhxcHR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjkxMTczNiwiZXhwIjoyMDkyNDg3NzM2fQ.IHDlxNHJVOi5cBHOZjLkh67Rbsjq9qgeP_0kLt3vmtw';
var RESEND_KEY   = 're_J4rkZ3Ww_9xFDneu53YRJqwTntDoiSt3Q';
var EMAIL_FROM   = 'onboarding@resend.dev';

/* ── State ───────────────────────────────────────────── */
var allReservations = [];
var currentFilter   = 'all';
var maxColWidths    = [];

/* ── Supabase helpers (direct REST, no SDK) ──────────── */
function supaHeaders() {
  return {
    'apikey':        SUPA_SERVICE,
    'Authorization': 'Bearer ' + SUPA_SERVICE,
    'Content-Type':  'application/json'
  };
}

async function dbSelect() {
  var res = await fetch(
    SUPA_URL + '/rest/v1/reservations?select=*&order=created_at.desc',
    { headers: supaHeaders() }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function dbUpdate(id, fields) {
  var res = await fetch(
    SUPA_URL + '/rest/v1/reservations?id=eq.' + id,
    { method: 'PATCH', headers: supaHeaders(), body: JSON.stringify(fields) }
  );
  if (!res.ok) throw new Error(await res.text());
}

/* ── Boot ────────────────────────────────────────────── */
(function init() {
  var token = localStorage.getItem('ps_admin_token');
  if (!token || !token.startsWith('eyJ')) {
    localStorage.removeItem('ps_admin_token');
    window.location.href = 'index.html';
    return;
  }

  var email = localStorage.getItem('ps_admin_email') || '';
  document.getElementById('nav-user').textContent = email;

  document.getElementById('logout-btn').addEventListener('click', function() {
    localStorage.removeItem('ps_admin_token');
    localStorage.removeItem('ps_admin_email');
    window.location.href = 'index.html';
  });

  document.getElementById('refresh-btn').addEventListener('click', loadReservations);
  initResizableColumns();

  document.getElementById('filter-tabs').addEventListener('click', function(e) {
    var tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderTable();
  });

  loadReservations();
})();

/* ── Load reservations ───────────────────────────────── */
async function loadReservations() {
  var btn = document.getElementById('refresh-btn');
  btn.disabled = true;

  try {
    allReservations = await dbSelect();
    updateStats();
    renderTable();
    var now = new Date();
    document.getElementById('last-refresh').textContent =
      'Mis à jour à ' + now.getHours() + 'h' + String(now.getMinutes()).padStart(2, '0');
  } catch(err) {
    showToast('Erreur chargement : ' + err.message, 'error');
  }

  btn.disabled = false;
}

/* ── Stats ───────────────────────────────────────────── */
function updateStats() {
  document.getElementById('stat-total').textContent =
    allReservations.length;
  document.getElementById('stat-pending').textContent =
    allReservations.filter(function(r) { return r.statut === 'en_attente'; }).length;
  document.getElementById('stat-accepted').textContent =
    allReservations.filter(function(r) { return r.statut === 'acceptee'; }).length;
}

/* ── Render table ────────────────────────────────────── */
function renderTable() {
  var rows = allReservations.filter(function(r) {
    return currentFilter === 'all' || r.statut === currentFilter;
  });

  var tbody = document.getElementById('table-body');

  if (rows.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="10"><div class="empty">' +
      '<div class="empty-icon">📋</div>' +
      '<div class="empty-text">Aucune réservation pour ce filtre.</div>' +
      '</div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(function(r) {
    var isPending = r.statut === 'en_attente';

    var badge = isPending
      ? '<span class="badge badge-pending">En attente</span>'
      : '<span class="badge badge-accepted">Acceptée</span>';

    var action = isPending
      ? '<button class="btn-check accept-btn"' +
        ' title="Accepter cette réservation"' +
        ' data-id="'     + esc(r.id)          + '"' +
        ' data-ref="'    + esc(r.reference)   + '"' +
        ' data-date="'   + esc(r.date)        + '"' +
        ' data-heure="'  + esc(r.heure)       + '"' +
        ' data-meuble="' + esc(r.type_meuble) + '"' +
        ' data-nom="'    + esc(r.nom)         + '"' +
        ' data-email="'  + esc(r.email)       + '">' +
        '<img src="asset/Check.svg" width="20" height="20" alt="Accepter" />' +
        '</button>'
      : '';

    var heure  = r.heure ? r.heure.slice(0,5) : '—';
    var adresse = r.adresse || '—';

    return '<tr>' +
      '<td class="td-ref" title="'    + esc(r.reference) + '">' + esc(r.reference)  + '</td>' +
      '<td title="'                   + formatDate(r.date) + '">' + formatDate(r.date) + '</td>' +
      '<td class="td-muted" title="'  + esc(heure) + '">'  + esc(heure)             + '</td>' +
      '<td>'                          + formatMeuble(r.type_meuble)                  + '</td>' +
      '<td title="'                   + esc(r.nom) + '">'   + esc(r.nom)             + '</td>' +
      '<td class="td-muted" title="'  + esc(r.email) + '">' + esc(r.email)           + '</td>' +
      '<td class="td-muted" title="'  + esc(r.telephone) + '">' + esc(r.telephone)  + '</td>' +
      '<td class="td-muted" title="'  + esc(adresse) + '">' + esc(adresse)           + '</td>' +
      '<td>'                          + badge                                         + '</td>' +
      '<td class="td-action">'        + action                                        + '</td>' +
      '</tr>';
  }).join('');

  // Measure max content widths after DOM paint
  requestAnimationFrame(computeMaxWidths);

  tbody.querySelectorAll('.accept-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      acceptReservation(
        btn.dataset.id,  btn.dataset.ref,   btn.dataset.date,
        btn.dataset.heure, btn.dataset.meuble, btn.dataset.nom, btn.dataset.email
      );
    });
  });
}

/* ── Accept reservation ──────────────────────────────── */
async function acceptReservation(id, ref, date, heure, meuble, nom, email) {
  var btn = document.querySelector('.accept-btn[data-id="' + id + '"]');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    await dbUpdate(id, { statut: 'acceptee' });
  } catch(err) {
    showToast('Erreur mise à jour : ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Accepter'; }
    return;
  }

  var emailOk = await sendConfirmationEmail(email, nom, ref, date, heure, meuble);

  if (emailOk) {
    showToast('Réservation ' + ref + ' acceptée — email envoyé à ' + email, 'success');
  } else {
    showToast('Statut mis à jour, mais l\'email n\'a pas pu être envoyé.', 'error');
  }

  var idx = allReservations.findIndex(function(r) { return r.id === id; });
  if (idx !== -1) allReservations[idx].statut = 'acceptee';
  updateStats();
  renderTable();
}

/* ── Send email via Resend ───────────────────────────── */
async function sendConfirmationEmail(to, nom, ref, date, heure, meuble) {
  var prenom = nom.split(' ')[0];
  try {
    var res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + RESEND_KEY
      },
      body: JSON.stringify({
        from:    'Proper Sofa <' + EMAIL_FROM + '>',
        to:      [to],
        subject: 'Votre réservation ' + ref + ' est confirmée ✓',
        html:    buildEmailHtml(prenom, ref, date, heure, meuble)
      })
    });
    var data = await res.json();
    console.log('[Resend]', res.status, JSON.stringify(data));
    return res.ok;
  } catch(e) {
    console.error('[Resend error]', e);
    return false;
  }
}

/* ── Email HTML template ─────────────────────────────── */
function buildEmailHtml(prenom, ref, date, heure, meuble) {
  var h = heure ? heure.slice(0, 5) : '—';
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/></head>' +
  '<body style="margin:0;padding:0;background:#f7f9ff;font-family:Arial,sans-serif;">' +
  '<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">' +
  '<tr><td align="center"><table width="100%" style="max-width:560px;">' +

  '<tr><td style="background:#485d92;border-radius:20px 20px 0 0;padding:32px 40px;text-align:center;">' +
  '<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.65);">Proper Sofa</p>' +
  '<h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;">Réservation confirmée ✓</h1>' +
  '</td></tr>' +

  '<tr><td style="background:#fff;padding:36px 40px;border-radius:0 0 20px 20px;box-shadow:0 4px 40px rgba(0,0,0,.07);">' +
  '<p style="margin:0 0 20px;font-size:16px;color:#181c20;">Bonjour <strong>' + esc(prenom) + '</strong>,</p>' +
  '<p style="margin:0 0 28px;font-size:15px;color:#44464f;line-height:1.7;">Nous confirmons votre réservation. Notre équipe sera présente au créneau convenu pour nettoyer vos tissus d\'ameublement.</p>' +

  '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f4f9;border-radius:14px;padding:24px;margin-bottom:28px;">' +
  '<tr><td>' +
  row('Référence', ref,            '#485d92', true) +
  row('Date',      formatDate(date), '#181c20', false) +
  row('Créneau',   h,               '#181c20', false) +
  row('Mobilier',  meuble,          '#181c20', false) +
  '</td></tr></table>' +

  '<p style="margin:0;font-size:15px;color:#181c20;line-height:1.7;">À très bientôt,<br/><strong>L\'équipe Proper Sofa</strong></p>' +
  '</td></tr>' +

  '<tr><td style="padding:20px 0;text-align:center;">' +
  '<p style="margin:0;font-size:12px;color:#44464f;">© ' + new Date().getFullYear() + ' Proper Sofa</p>' +
  '</td></tr>' +

  '</table></td></tr></table></body></html>';
}

function row(label, value, color, bold) {
  return '<table width="100%" cellpadding="4" cellspacing="0" style="margin-bottom:8px;"><tr>' +
    '<td style="width:110px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#44464f;">' + esc(label) + '</td>' +
    '<td style="font-size:15px;color:' + color + ';' + (bold ? 'font-weight:700;' : '') + '">' + esc(value || '—') + '</td>' +
    '</tr></table>';
}

/* ── Measure max content width per column ────────────── */
function computeMaxWidths() {
  var table = document.getElementById('reservations-table');
  if (!table) return;
  var ths = table.querySelectorAll('thead th');
  maxColWidths = [];
  ths.forEach(function(th, i) {
    var max = th.scrollWidth;
    table.querySelectorAll('tbody tr td:nth-child(' + (i + 1) + ')').forEach(function(td) {
      max = Math.max(max, td.scrollWidth);
    });
    maxColWidths[i] = max;
  });
}

/* ── Resizable columns ───────────────────────────────── */
function initResizableColumns() {
  var table = document.getElementById('reservations-table');
  if (!table) return;

  var cols = table.querySelectorAll('colgroup col');
  var ths  = table.querySelectorAll('thead th');
  var last = ths.length - 1;

  ths.forEach(function(th, i) {
    if (!cols[i]) return;

    // No separator after the last column
    if (i === last) return;

    var sep = document.createElement('div');
    sep.className = 'col-sep';
    th.appendChild(sep);

    // The separator at the right of col i always resizes col i
    var targetTh  = th;
    var targetCol = cols[i];

    var startX = 0, startW = 0;

    sep.addEventListener('mousedown', function(e) {
      // Snapshot ALL columns to px before any resize — prevents jump from % → px mix
      ths.forEach(function(th2, j) {
        if (cols[j]) cols[j].style.width = th2.offsetWidth + 'px';
      });

      startX = e.pageX;
      startW = targetTh ? targetTh.offsetWidth : 0;
      sep.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      function onMove(e) {
        var delta  = e.pageX - startX;
        var maxW   = maxColWidths[i] || Infinity;
        var newW   = Math.min(maxW, Math.max(40, startW + delta));
        if (targetCol) targetCol.style.width = newW + 'px';
      }
      function onUp() {
        sep.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  });
}

/* ── Meuble formatter ────────────────────────────────── */
function parseMeuble(str) {
  if (!str) return [];
  return str.split(', ').map(function(part) {
    var m = part.match(/^(\d+)[×x]\s*(.+)$/);
    return m ? { qty: parseInt(m[1]), name: m[2].trim() } : { qty: 1, name: part.trim() };
  });
}

function formatMeuble(str) {
  var items = parseMeuble(str);
  if (!items.length) return '—';

  // Single furniture type
  if (items.length === 1) {
    return esc(items[0].qty > 1 ? items[0].name + ' x' + items[0].qty : items[0].name);
  }

  // Multiple types → badge + drawer
  var label = items.length + ' meubles';
  var lines = items.map(function(it) {
    return '<span>' + esc(it.qty > 1 ? it.name + ' x' + it.qty : it.name) + '</span>';
  }).join('');

  return '<span class="meuble-wrap">' +
    '<button class="meuble-badge" onclick="toggleDrawer(this)">' +
      label +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:4px;transition:transform .2s"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</button>' +
    '<div class="meuble-drawer">' + lines + '</div>' +
  '</span>';
}

function toggleDrawer(btn) {
  var wrap = btn.closest('.meuble-wrap');
  var isOpen = !wrap.classList.contains('open');

  // Close all open drawers first
  document.querySelectorAll('.meuble-wrap.open').forEach(function(w) {
    w.classList.remove('open');
  });

  if (isOpen) {
    wrap.classList.add('open');
    // Position drawer using fixed coords (escapes all overflow clipping)
    var rect = btn.getBoundingClientRect();
    var drawer = wrap.querySelector('.meuble-drawer');
    if (drawer) {
      drawer.style.top  = (rect.bottom + 4) + 'px';
      drawer.style.left = rect.left + 'px';
    }
  }
}

// Close drawers when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.meuble-wrap')) {
    document.querySelectorAll('.meuble-wrap.open').forEach(function(w) {
      w.classList.remove('open');
    });
  }
});

/* ── Helpers ─────────────────────────────────────────── */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  var d = new Date(dateStr + 'T00:00:00');
  return String(d.getDate()).padStart(2,'0') + '/' +
         String(d.getMonth() + 1).padStart(2,'0') + '/' +
         d.getFullYear();
}

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type) {
  var el = document.createElement('div');
  el.className = 'toast toast-' + (type === 'error' ? 'error' : 'success');
  el.textContent = msg;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(function() { el.remove(); }, 4500);
}
