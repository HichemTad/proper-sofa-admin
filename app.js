/* ── Config ─────────────────────────────────────────── */
var SUPA_URL     = 'https://xiyfxsoiaclvdkphqpty.supabase.co';
var SUPA_SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpeWZ4c29pYWNsdmRrcGhxcHR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjkxMTczNiwiZXhwIjoyMDkyNDg3NzM2fQ.IHDlxNHJVOi5cBHOZjLkh67Rbsjq9qgeP_0kLt3vmtw';

/* ── State ───────────────────────────────────────────── */
var allReservations    = [];
var currentFilter      = 'all';
var sortCol            = null;   /* 'date' | 'statut' */
var sortDir            = 1;      /* 1 = asc, -1 = desc */
var currentUserProfile = null;   /* { display_name, telephone } */

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

async function fetchProfile(email) {
  try {
    var res = await fetch(
      SUPA_URL + '/rest/v1/profiles?email=eq.' + encodeURIComponent(email) + '&select=display_name,telephone&limit=1',
      { headers: supaHeaders() }
    );
    if (!res.ok) return null;
    var data = await res.json();
    return data[0] || null;
  } catch(e) { return null; }
}

/* ── Boot ────────────────────────────────────────────── */
(async function init() {
  var token = localStorage.getItem('ps_admin_token');
  if (!token || !token.startsWith('eyJ')) {
    localStorage.removeItem('ps_admin_token');
    window.location.href = 'index.html';
    return;
  }

  var email = localStorage.getItem('ps_admin_email') || '';
  currentUserProfile = await fetchProfile(email);
  var displayName = (currentUserProfile && currentUserProfile.display_name) || email;
  document.getElementById('nav-user').textContent = displayName;

  document.getElementById('logout-btn').addEventListener('click', function() {
    localStorage.removeItem('ps_admin_token');
    localStorage.removeItem('ps_admin_email');
    window.location.href = 'index.html';
  });

  /* ── Burger menu ── */
  var nav       = document.querySelector('.nav');
  var burgerBtn = document.getElementById('burger-btn');
  burgerBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    nav.classList.toggle('open');
  });
  document.addEventListener('click', function(e) {
    if (nav.classList.contains('open') && !e.target.closest('.nav')) {
      nav.classList.remove('open');
    }
  });

  document.getElementById('refresh-btn').addEventListener('click', loadReservations);

  window.addEventListener('resize', updateStickyOffsets);

  /* Scroll horizontal avec la molette */
  var tableWrap = document.querySelector('.table-wrap');
  if (tableWrap) {
    tableWrap.addEventListener('wheel', function(e) {
      if (tableWrap.scrollWidth > tableWrap.clientWidth) {
        e.preventDefault();
        tableWrap.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  document.querySelectorAll('.th-sort').forEach(function(th) {
    th.addEventListener('click', function() {
      var col = th.dataset.sort;
      if (sortCol === col) {
        sortDir = -sortDir;
      } else {
        sortCol = col;
        sortDir = -1; /* premier clic = plus récent / en attente en premier */
      }
      updateSortUI();
      renderTable();
    });
  });

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

/* ── Sticky offset calibration ───────────────────────── */
function updateStickyOffsets() {
  var actionTh = document.querySelector('thead th:nth-child(11)');
  if (!actionTh) return;
  document.documentElement.style.setProperty('--action-col-w', (actionTh.offsetWidth - 1) + 'px');
}

/* ── Render table ────────────────────────────────────── */
function updateSortUI() {
  document.querySelectorAll('.th-sort').forEach(function(th) {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortCol) {
      th.classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}

function renderTable() {
  var rows = allReservations.filter(function(r) {
    return currentFilter === 'all' || r.statut === currentFilter;
  });

  /* ── Sort ── */
  if (sortCol) {
    rows = rows.slice().sort(function(a, b) {
      var va, vb;
      if (sortCol === 'date') {
        va = (a.date || '') + (a.heure || '');
        vb = (b.date || '') + (b.heure || '');
      } else {
        /* statut : 'acceptee' | 'en_attente' */
        va = a.statut || '';
        vb = b.statut || '';
      }
      return sortDir * (va < vb ? -1 : va > vb ? 1 : 0);
    });
  }

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

    var commentBtn = r.commentaire
      ? buildCommentButton(r.commentaire)
      : '';

    var action = isPending
      ? '<button class="btn-check accept-btn"' +
        ' title="Accepter cette réservation"' +
        ' data-id="'          + esc(r.id)                  + '"' +
        ' data-ref="'         + esc(r.reference)           + '"' +
        ' data-date="'        + esc(r.date)                + '"' +
        ' data-heure="'       + esc(r.heure)               + '"' +
        ' data-meuble="'      + esc(r.type_meuble)         + '"' +
        ' data-nom="'         + esc(r.nom)                 + '"' +
        ' data-email="'       + esc(r.email)               + '"' +
        ' data-lang="'        + esc(r.lang || 'fr')        + '"' +
        ' data-adresse="'     + esc(r.adresse || '')       + '"' +
        ' data-prix="'        + esc(r.prix_total != null ? r.prix_total : '') + '"' +
        ' data-commentaire="' + esc(r.commentaire || '')   + '">' +
        '<img src="asset/Check.svg" width="20" height="20" alt="Accepter" />' +
        '</button>' + commentBtn
      : buildCalButton(r) + commentBtn;

    var heure  = r.heure ? r.heure.slice(0,5) : '—';
    var adresse = r.adresse || '—';

    return '<tr>' +
      '<td class="td-ref" title="'    + esc(r.reference) + '">' + esc(r.reference)  + '</td>' +
      '<td title="'                   + formatDate(r.date) + '">' + formatDate(r.date) + '</td>' +
      '<td class="td-muted" title="'  + esc(heure) + '">'  + esc(heure)             + '</td>' +
      '<td class="td-muted" title="'  + esc(adresse) + '">' + esc(adresse)           + '</td>' +
      '<td>'                          + formatMeuble(r.type_meuble)                  + '</td>' +
      '<td title="'                   + esc(r.nom) + '">'   + esc(r.nom)             + '</td>' +
      '<td class="td-muted" title="'  + esc(r.email) + '">' + esc(r.email)           + '</td>' +
      '<td class="td-muted" title="'  + esc(r.telephone) + '">' + esc(r.telephone)  + '</td>' +
      '<td class="td-prix">'          + (r.prix_total != null ? r.prix_total + ' €' : '—') + '</td>' +
      '<td>'                          + badge                                         + '</td>' +
      '<td class="td-action"><div class="action-inner">' + action + '</div></td>' +
      '</tr>';
  }).join('');

  requestAnimationFrame(updateStickyOffsets);

  tbody.querySelectorAll('.accept-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      acceptReservation(
        btn.dataset.id,    btn.dataset.ref,    btn.dataset.date,
        btn.dataset.heure, btn.dataset.meuble, btn.dataset.nom,
        btn.dataset.email, btn.dataset.lang,   btn.dataset.adresse,
        btn.dataset.prix,  btn.dataset.commentaire
      );
    });
  });

  tbody.querySelectorAll('.btn-cal').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleCalMenu(btn);
    });
  });

  tbody.querySelectorAll('.cal-option').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var b = link.closest('.cal-wrap').querySelector('.btn-cal');
      if (link.dataset.cal === 'google') {
        window.open(buildGoogleUrl(b.dataset), '_blank');
      } else {
        downloadIcs(b.dataset);
      }
      link.closest('.cal-wrap').classList.remove('open');
    });
  });
}

/* ── Accept reservation ──────────────────────────────── */
async function acceptReservation(id, ref, date, heure, meuble, nom, email, lang, adresse, prix, commentaire) {
  var btn = document.querySelector('.accept-btn[data-id="' + id + '"]');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    await dbUpdate(id, { statut: 'acceptee' });
  } catch(err) {
    showToast('Erreur mise à jour : ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✓ Accepter'; }
    return;
  }

  var emailOk = await sendConfirmationEmail({
    type:          'confirmation',
    reference:     ref,
    date:          date,
    heure:         heure,
    type_meuble:   meuble,
    nom:           nom,
    email:         email,
    adresse:       adresse || '',
    prix_total:    prix ? parseInt(prix) : null,
    commentaire:   commentaire || null,
    lang:          lang || 'fr',
    employee_name: currentUserProfile ? currentUserProfile.display_name : 'Proper Sofa',
    employee_phone:currentUserProfile ? currentUserProfile.telephone    : null,
  });

  if (!emailOk) {
    showToast('Statut mis à jour, mais l\'email n\'a pas pu être envoyé.', 'error');
  }

  var idx = allReservations.findIndex(function(r) { return r.id === id; });
  if (idx !== -1) allReservations[idx].statut = 'acceptee';
  updateStats();
  renderTable();

  showCalendarModal({ ref: ref, date: date, heure: heure, nom: nom, adresse: adresse, meuble: meuble });
}

/* ── Calendar modal ─────────────────────────────────── */
function showCalendarModal(opts) {
  var slotMap = { '08:00': { start: '08', end: '10' }, '10:00': { start: '10', end: '12' },
                  '14:00': { start: '14', end: '16' }, '16:00': { start: '16', end: '18' } };
  var slot      = slotMap[opts.heure] || { start: '08', end: '10' };
  var dateParts = String(opts.date).split('-'); /* [YYYY, MM, DD] */
  var dtStart   = dateParts[0] + dateParts[1] + dateParts[2] + 'T' + slot.start + '0000';
  var dtEnd     = dateParts[0] + dateParts[1] + dateParts[2] + 'T' + slot.end   + '0000';

  var displayDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
    .toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  var displaySlot = slot.start + 'h – ' + slot.end + 'h';

  /* Google Calendar URL */
  var gcUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text='     + encodeURIComponent('Nettoyage Proper Sofa – ' + opts.ref) +
    '&dates='    + dtStart + '/' + dtEnd +
    '&details='  + encodeURIComponent('Client : ' + opts.nom + '\nMobilier : ' + opts.meuble) +
    '&location=' + encodeURIComponent(opts.adresse || '');

  /* Fill modal */
  document.getElementById('cal-modal-desc').textContent =
    'N’oubliez pas d’ajouter ce rendez-vous à votre agenda — ' +
    displayDate + ' de ' + displaySlot + ' chez ' + opts.nom + '.';

  var btn = document.getElementById('cal-modal-btn');
  btn.onclick = function() {
    window.open(gcUrl, '_blank');
    closeCalendarModal();
  };

  document.getElementById('cal-modal-overlay').hidden = false;
}

function closeCalendarModal() {
  document.getElementById('cal-modal-overlay').hidden = true;
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('cal-modal-close').addEventListener('click', closeCalendarModal);
  document.getElementById('cal-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeCalendarModal();
  });
});

/* ── Send email via Edge Function ────────────────────── */
async function sendConfirmationEmail(payload) {
  try {
    var res = await fetch(SUPA_URL + '/functions/v1/send-confirmation-email', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPA_SERVICE },
      body:    JSON.stringify(payload)
    });
    console.log('[Email]', res.status, await res.text());
    return res.ok;
  } catch(e) {
    console.error('[Email error]', e);
    return false;
  }
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
  var total = items.reduce(function(acc, it) { return acc + it.qty; }, 0);
  var label = total + ' meubles';
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

// Close drawers / cal menus / comment popovers when clicking outside
document.addEventListener('click', function(e) {
  if (!e.target.closest('.meuble-wrap')) {
    document.querySelectorAll('.meuble-wrap.open').forEach(function(w) { w.classList.remove('open'); });
  }
  if (!e.target.closest('.cal-wrap')) {
    document.querySelectorAll('.cal-wrap.open').forEach(function(w) {
      w.classList.remove('open');
      var parentTd = w.closest('td');
      if (parentTd) parentTd.style.zIndex = '';
    });
  }
  if (!e.target.closest('.comment-wrap')) {
    document.querySelectorAll('.comment-wrap.open').forEach(function(w) {
      w.classList.remove('open');
      var parentTd = w.closest('td');
      if (parentTd) parentTd.style.zIndex = '';
    });
  }
});

/* ── Comment button ──────────────────────────────────── */
function buildCommentButton(text) {
  return '<span class="comment-wrap">' +
    '<button class="btn-check btn-comment" title="Voir le commentaire" onclick="toggleCommentPopover(this)">' +
    '<img src="asset/comment.svg" width="14" height="14" alt="Commentaire" style="margin-left:2px" />' +
    '</button>' +
    '<div class="comment-popover">' + esc(text) + '</div>' +
    '</span>';
}

function toggleCommentPopover(btn) {
  var wrap   = btn.closest('.comment-wrap');
  var td     = btn.closest('td');
  var isOpen = !wrap.classList.contains('open');

  /* close everything */
  document.querySelectorAll('.comment-wrap.open').forEach(function(w) {
    w.classList.remove('open');
    var parentTd = w.closest('td');
    if (parentTd) parentTd.style.zIndex = '';
  });
  document.querySelectorAll('.cal-wrap.open').forEach(function(w) {
    w.classList.remove('open');
    var parentTd = w.closest('td');
    if (parentTd) parentTd.style.zIndex = '';
  });

  if (isOpen) {
    wrap.classList.add('open');
    if (td) td.style.zIndex = '200';
    var rect    = btn.getBoundingClientRect();
    var popover = wrap.querySelector('.comment-popover');
    if (popover) {
      var popW   = 260;
      var margin = 8;
      var left   = rect.left;
      if (left + popW > window.innerWidth - margin) {
        left = Math.max(margin, rect.right - popW);
      }
      popover.style.top  = (rect.bottom + 4) + 'px';
      popover.style.left = left + 'px';
    }
  }
}

/* ── Calendar button ─────────────────────────────────── */
function buildCalButton(r) {
  return '<span class="cal-wrap">' +
    '<button class="btn-check btn-cal" title="Ajouter au calendrier"' +
    ' data-ref="'    + esc(r.reference)      + '"' +
    ' data-date="'   + esc(r.date)           + '"' +
    ' data-heure="'  + esc(r.heure || '')    + '"' +
    ' data-nom="'    + esc(r.nom)            + '"' +
    ' data-meuble="' + esc(r.type_meuble)    + '"' +
    ' data-adresse="'+ esc(r.adresse || '')  + '"' +
    ' data-email="'       + esc(r.email || '')         + '"' +
    ' data-tel="'         + esc(r.telephone || '')     + '"' +
    ' data-commentaire="' + esc(r.commentaire || '')   + '">' +
    '<img src="asset/calendar.svg" width="16" height="16" alt="Calendrier" />' +
    '</button>' +
    '<div class="cal-menu">' +
    '<a class="cal-option" data-cal="google" href="#">Google Calendar</a>' +
    '<a class="cal-option" data-cal="apple"  href="#">Apple / iCal</a>' +
    '</div>' +
    '</span>';
}

function toggleCalMenu(btn) {
  var wrap = btn.closest('.cal-wrap');
  var td   = btn.closest('td');
  var isOpen = !wrap.classList.contains('open');

  /* close everything and reset elevated z-index */
  document.querySelectorAll('.cal-wrap.open').forEach(function(w) {
    w.classList.remove('open');
    var parentTd = w.closest('td');
    if (parentTd) parentTd.style.zIndex = '';
  });
  document.querySelectorAll('.meuble-wrap.open').forEach(function(w) {
    w.classList.remove('open');
  });

  if (isOpen) {
    wrap.classList.add('open');
    /* lift the sticky td above its siblings so the fixed menu isn't clipped */
    if (td) td.style.zIndex = '200';
    var rect = btn.getBoundingClientRect();
    var menu = wrap.querySelector('.cal-menu');
    if (menu) {
      var menuW   = 164; /* min-width + border */
      var margin  = 8;
      var left    = rect.left;
      /* si le menu dépasse le bord droit, on l'aligne sur le bord droit du bouton */
      if (left + menuW > window.innerWidth - margin) {
        left = Math.max(margin, rect.right - menuW);
      }
      menu.style.top  = (rect.bottom + 4) + 'px';
      menu.style.left = left + 'px';
    }
  }
}

/* ── Calendar helpers ────────────────────────────────── */
function calDt(dateStr, heureStr, addHours) {
  var d = (dateStr || '').replace(/-/g, '');
  var parts = (heureStr || '08:00').slice(0, 5).split(':');
  var hh = parseInt(parts[0], 10) + (addHours || 0);
  var mm = parts[1] || '00';
  return d + 'T' + String(hh).padStart(2, '0') + mm + '00';
}

function buildGoogleUrl(d) {
  var details = [
    'Client : '     + d.nom,
    'Téléphone : '  + (d.tel      || '—'),
    'Email : '      + (d.email    || '—'),
    'Mobilier : '   + d.meuble,
    'Adresse : '    + (d.adresse  || '—'),
    'Référence : '  + d.ref
  ].join('\n');
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    '&text='     + encodeURIComponent('PS Nettoyage - ' + d.nom) +
    '&dates='    + calDt(d.date, d.heure) + '/' + calDt(d.date, d.heure, 2) +
    '&details='  + encodeURIComponent(details) +
    '&location=' + encodeURIComponent(d.adresse || '');
}

function downloadIcs(d) {
  var ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Proper Sofa//Admin//FR',
    'BEGIN:VEVENT',
    'DTSTART:'   + calDt(d.date, d.heure),
    'DTEND:'     + calDt(d.date, d.heure, 2),
    'SUMMARY:PS Nettoyage - ' + d.nom,
    'DESCRIPTION:Client : '    + d.nom           +
      '\\nTéléphone : '        + (d.tel          || '—') +
      '\\nEmail : '            + (d.email        || '—') +
      '\\nMobilier : '         + d.meuble         +
      '\\nAdresse : '          + (d.adresse      || '—') +
      '\\nRéférence : '        + d.ref            +
      (d.commentaire ? '\\nCommentaire : ' + d.commentaire : ''),
    'LOCATION:'  + (d.adresse || ''),
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'reservation-' + d.ref + '.ics';
  a.click();
  URL.revokeObjectURL(url);
}

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
