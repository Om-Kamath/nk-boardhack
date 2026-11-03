/* HackBoard — Stays near the hackathons.
 * Renders the #stays section: search bar, filters, card grid, detail modal.
 * Depends on STAYS_DATA (stays-data.js) and HACKBOARD_DATA.open (data.js)
 * for event names/dates. All listings are illustrative demo data. */
(function () {
  'use strict';

  if (typeof STAYS_DATA === 'undefined') {
    console.warn('HackBoard stays: STAYS_DATA missing — section not rendered.');
    return;
  }

  var SAVES_KEY = 'hackboard:saves:v1';
  var PRICE_MAX = 400;
  var HUB_CITY = { 'NYC': 'New York', 'SF': 'San Francisco', 'San Jose': 'San Jose', 'Boston': 'Boston', 'Seattle': 'Seattle' };
  var STAY_TYPES = ['Entire place', 'Private room', 'Hostel bunk', 'Co-living'];

  /* ---------- saved listings (localStorage) ---------- */

  function loadSaves() {
    try {
      var raw = localStorage.getItem(SAVES_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(function (id) { return typeof id === 'string'; }) : [];
    } catch (err) {
      console.warn('HackBoard stays: saved list unreadable, starting fresh.', err.message);
      return [];
    }
  }

  var saves = loadSaves();

  function persistSaves() {
    try {
      localStorage.setItem(SAVES_KEY, JSON.stringify(saves));
    } catch (err) {
      console.warn('HackBoard stays: could not persist saves.', err.message);
    }
  }

  function isSaved(id) { return saves.indexOf(id) !== -1; }

  function toggleSave(id) {
    var idx = saves.indexOf(id);
    if (idx === -1) saves.push(id); else saves.splice(idx, 1);
    persistSaves();
  }

  /* ---------- event lookup from data.js ---------- */

  var EVENT_BY_ID = new Map();
  if (typeof HACKBOARD_DATA !== 'undefined' && HACKBOARD_DATA.open) {
    HACKBOARD_DATA.open.forEach(function (e) { EVENT_BY_ID.set(e.id, e); });
  }

  function eventById(id) { return EVENT_BY_ID.get(id) || null; }

  /* ---------- pure helpers ---------- */

  function parseISO(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function nightsBetween(checkIn, checkOut) {
    var a = parseISO(checkIn);
    var b = parseISO(checkOut);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function fmtDate(dateStr) {
    var d = parseISO(dateStr);
    return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : dateStr;
  }

  function fmtMoney(n) { return '$' + n.toLocaleString('en-US'); }

  /* Does the stay's availability window cover the requested dates?
   * One-sided requests only need the matching edge to cover. */
  function coversDates(stay, checkIn, checkOut) {
    if (!checkIn && !checkOut) return true;
    if (checkIn && checkIn < stay.availableFrom) return false;
    if (checkOut && checkOut > stay.availableTo) return false;
    if (checkIn && !checkOut && checkIn > stay.availableTo) return false;
    if (checkOut && !checkIn && checkOut < stay.availableFrom) return false;
    return true;
  }

  function passesFilters(stay, f) {
    if (f.hub && stay.hub !== f.hub) return false;
    if (!coversDates(stay, f.checkIn, f.checkOut)) return false;
    if (stay.sleeps < f.guests) return false;
    if (f.types.size && !f.types.has(stay.type)) return false;
    if (stay.pricePerNight > f.maxPrice) return false;
    for (var i = 0; i < f.amenities.length; i++) {
      if (stay.amenities.indexOf(f.amenities[i]) === -1) return false;
    }
    if (f.savedOnly && !isSaved(stay.id)) return false;
    return true;
  }

  function filterStays(stays, f) {
    return stays.filter(function (s) { return passesFilters(s, f); })
                .sort(function (a, b) { return a.distanceKm - b.distanceKm; });
  }

  /* ---------- state ---------- */

  var filters = {
    hub: '',
    checkIn: '',
    checkOut: '',
    guests: 1,
    types: new Set(),
    maxPrice: PRICE_MAX,
    amenities: [],
    savedOnly: false
  };

  /* ---------- dom ---------- */

  var section = document.getElementById('stays');
  if (!section) return;

  var els = {
    hub: document.getElementById('stays-hub'),
    checkIn: document.getElementById('stays-checkin'),
    checkOut: document.getElementById('stays-checkout'),
    guests: document.getElementById('stays-guests'),
    typeChips: document.getElementById('stays-type-chips'),
    savedChip: document.getElementById('stays-saved-chip'),
    price: document.getElementById('stays-max-price'),
    priceLabel: document.getElementById('stays-price-label'),
    amenityChips: document.getElementById('stays-amenity-chips'),
    count: document.getElementById('stays-count'),
    grid: document.getElementById('stays-grid'),
    empty: document.getElementById('stays-empty'),
    reset: document.getElementById('stays-reset'),
    backdrop: document.getElementById('stays-modal-backdrop'),
    modal: document.getElementById('stays-modal'),
    modalBody: document.getElementById('stays-modal-body'),
    modalClose: document.getElementById('stays-modal-close'),
    announcer: document.getElementById('sr-announcer')
  };

  function announce(msg) {
    if (els.announcer) els.announcer.textContent = msg;
  }

  /* ---------- card rendering ---------- */

  var HEART_OUTLINE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
  var HEART_FILLED = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

  function eventLine(stay) {
    var ev = stay.nearEvents.length ? eventById(stay.nearEvents[0]) : null;
    if (!ev) return '';
    return stay.walkMinutes + ' min walk to ' + ev.name;
  }

  function stayCard(stay) {
    var saved = isSaved(stay.id);
    var article = document.createElement('article');
    article.className = 'stay-card card-hover';
    article.dataset.id = stay.id;

    var media = document.createElement('div');
    media.className = 'stay-media';

    var img = document.createElement('img');
    img.src = stay.images[0];
    img.alt = stay.name;
    img.loading = 'lazy';
    media.appendChild(img);

    var heart = document.createElement('button');
    heart.className = 'stay-save' + (saved ? ' saved' : '');
    heart.type = 'button';
    heart.setAttribute('aria-pressed', String(saved));
    heart.setAttribute('aria-label', (saved ? 'Remove ' : 'Save ') + stay.name + (saved ? ' from saved stays' : ' to saved stays'));
    heart.innerHTML = saved ? HEART_FILLED : HEART_OUTLINE;
    heart.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleSave(stay.id);
      heart.classList.toggle('saved', isSaved(stay.id));
      heart.setAttribute('aria-pressed', String(isSaved(stay.id)));
      heart.innerHTML = isSaved(stay.id) ? HEART_FILLED : HEART_OUTLINE;
      announce(isSaved(stay.id) ? 'Saved ' + stay.name : 'Removed ' + stay.name + ' from saved');
      syncSavedChip();
      applyFilters(false);
    });
    media.appendChild(heart);

    var body = document.createElement('div');
    body.className = 'stay-body';

    var top = document.createElement('div');
    top.className = 'stay-row-top';
    top.innerHTML =
      '<span class="stay-price">' + fmtMoney(stay.pricePerNight) + ' <span class="stay-per">/ night</span></span>' +
      '<span class="stay-rating"><span class="stay-star" aria-hidden="true">★</span> ' + stay.rating.toFixed(2) +
      ' <span class="stay-reviews">(' + stay.reviews + ')</span></span>';

    var nameBtn = document.createElement('button');
    nameBtn.className = 'stay-name-btn';
    nameBtn.type = 'button';
    nameBtn.textContent = stay.name;
    nameBtn.setAttribute('aria-haspopup', 'dialog');

    var meta = document.createElement('p');
    meta.className = 'stay-meta';
    meta.textContent = stay.type + ' · ' + (HUB_CITY[stay.hub] || stay.hub) + ' · ' + stay.distanceKm + ' km · sleeps ' + stay.sleeps;

    var near = document.createElement('p');
    near.className = 'stay-event';
    near.textContent = eventLine(stay);

    body.appendChild(top);
    body.appendChild(nameBtn);
    body.appendChild(meta);
    body.appendChild(near);

    article.appendChild(media);
    article.appendChild(body);

    function open() { openModal(stay.id); }
    article.addEventListener('click', open);
    nameBtn.addEventListener('click', function (e) { e.stopPropagation(); open(); });

    return article;
  }

  /* ---------- list + summary ---------- */

  function summaryLine(list) {
    var parts = [list.length + (list.length === 1 ? ' stay' : ' stays')];
    if (filters.hub) parts.push(HUB_CITY[filters.hub] || filters.hub);
    if (filters.checkIn && filters.checkOut && nightsBetween(filters.checkIn, filters.checkOut) > 0) {
      parts.push(fmtDate(filters.checkIn) + ' – ' + fmtDate(filters.checkOut));
    }
    parts.push(filters.guests + (filters.guests === 1 ? ' guest' : ' guests'));
    return parts.join(' · ');
  }

  function applyFilters(announceResult) {
    var list = filterStays(STAYS_DATA.stays, filters);

    els.grid.textContent = '';
    var frag = document.createDocumentFragment();
    list.forEach(function (stay) { frag.appendChild(stayCard(stay)); });
    els.grid.appendChild(frag);

    els.count.textContent = summaryLine(list);
    var none = list.length === 0;
    els.empty.style.display = none ? '' : 'none';
    els.grid.style.display = none ? 'none' : '';
    if (announceResult) announce(list.length + ' stays match your filters.');
  }

  function syncSavedChip() {
    if (!els.savedChip) return;
    els.savedChip.classList.toggle('active', filters.savedOnly);
    var label = els.savedChip.querySelector('.stays-saved-count');
    if (label) label.textContent = String(saves.length);
  }

  /* ---------- modal ---------- */

  var lastFocused = null;

  function totalLine(stay) {
    var nights = nightsBetween(filters.checkIn, filters.checkOut);
    if (nights < 1) {
      return 'Pick check-in and check-out above to see your total.';
    }
    var total = nights * stay.pricePerNight;
    return fmtMoney(total) + ' total · ' + nights + (nights === 1 ? ' night' : ' nights') + ' × ' +
      fmtMoney(stay.pricePerNight) + ' · before fees';
  }

  function renderModal(stay) {
    els.modalBody.textContent = '';

    var photo = document.createElement('img');
    photo.className = 'stay-modal-photo';
    photo.src = stay.images[0];
    photo.alt = stay.name;

    var wrap = document.createElement('div');
    wrap.className = 'stay-modal-content';

    var head = document.createElement('div');
    head.className = 'stay-modal-head';
    head.innerHTML =
      '<h3 id="stays-modal-title"></h3>' +
      '<p class="stay-modal-sub"></p>' +
      '<p class="stay-modal-quick"></p>';
    head.querySelector('h3').textContent = stay.name;
    head.querySelector('.stay-modal-sub').textContent =
      stay.type + ' · ' + (HUB_CITY[stay.hub] || stay.hub) + ' · ★ ' + stay.rating.toFixed(2) + ' (' + stay.reviews + ' reviews)';
    head.querySelector('.stay-modal-quick').textContent =
      'Sleeps ' + stay.sleeps + ' · ' + stay.distanceKm + ' km from the venue cluster · available ' +
      fmtDate(stay.availableFrom) + ' – ' + fmtDate(stay.availableTo);

    if (stay.images.length > 1) {
      var thumbs = document.createElement('div');
      thumbs.className = 'stay-modal-thumbs';
      stay.images.forEach(function (src, i) {
        var t = document.createElement('button');
        t.type = 'button';
        t.className = 'stay-thumb' + (i === 0 ? ' active' : '');
        t.setAttribute('aria-label', 'Photo ' + (i + 1) + ' of ' + stay.images.length);
        var ti = document.createElement('img');
        ti.src = src;
        ti.alt = '';
        t.appendChild(ti);
        t.addEventListener('click', function () {
          photo.src = src;
          thumbs.querySelectorAll('.stay-thumb').forEach(function (b) { b.classList.remove('active'); });
          t.classList.add('active');
        });
        thumbs.appendChild(t);
      });
      wrap.appendChild(thumbs);
    }

    var amWrap = document.createElement('div');
    amWrap.className = 'stay-modal-section';
    amWrap.innerHTML = '<h4>Amenities</h4><ul class="stay-amenities"></ul>';
    var ul = amWrap.querySelector('ul');
    stay.amenities.forEach(function (a) {
      var li = document.createElement('li');
      li.textContent = '✓ ' + a;
      ul.appendChild(li);
    });

    var evWrap = document.createElement('div');
    evWrap.className = 'stay-modal-section';
    evWrap.innerHTML = '<h4>Nearby hackathons</h4><ul class="stay-events"></ul>';
    var evUl = evWrap.querySelector('ul');
    stay.nearEvents.forEach(function (id, i) {
      var ev = eventById(id);
      var li = document.createElement('li');
      li.textContent = ev
        ? ev.name + ' · ' + fmtDate(ev.dates) + (i === 0 ? ' · ' + stay.walkMinutes + ' min walk' : '')
        : id;
      if (!ev) console.warn('HackBoard stays: nearEvent id not in HACKBOARD_DATA.open:', id);
      evUl.appendChild(li);
    });

    var total = document.createElement('p');
    total.className = 'stay-total';
    total.textContent = totalLine(stay);

    var note = document.createElement('p');
    note.className = 'stay-note';
    note.textContent = STAYS_DATA.disclaimer;

    wrap.appendChild(head);
    wrap.appendChild(amWrap);
    wrap.appendChild(evWrap);
    wrap.appendChild(total);
    wrap.appendChild(note);

    els.modalBody.appendChild(photo);
    els.modalBody.appendChild(wrap);
  }

  var KEYBINDABLE = 'a[href], button:not([disabled]), input, select, textarea';

  function trapFocus(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key !== 'Tab') return;
    var focusables = els.modal.querySelectorAll(KEYBINDABLE);
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function openModal(id) {
    var stay = STAYS_DATA.stays.find(function (s) { return s.id === id; });
    if (!stay) return;
    lastFocused = document.activeElement;
    renderModal(stay);
    els.backdrop.hidden = false;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', trapFocus, true);
    els.modalClose.focus();
  }

  function closeModal() {
    els.backdrop.hidden = true;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', trapFocus, true);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  /* ---------- filter chips ---------- */

  function buildTypeChips() {
    STAY_TYPES.forEach(function (type) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip';
      chip.textContent = type;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        if (filters.types.has(type)) filters.types.delete(type); else filters.types.add(type);
        chip.classList.toggle('active', filters.types.has(type));
        chip.setAttribute('aria-pressed', String(filters.types.has(type)));
        applyFilters(true);
      });
      els.typeChips.appendChild(chip);
    });
  }

  function buildAmenityChips() {
    STAYS_DATA.amenityList.forEach(function (a) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'filter-chip';
      chip.textContent = a;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', function () {
        var idx = filters.amenities.indexOf(a);
        if (idx === -1) filters.amenities.push(a); else filters.amenities.splice(idx, 1);
        chip.classList.toggle('active', idx === -1);
        chip.setAttribute('aria-pressed', String(idx === -1));
        applyFilters(true);
      });
      els.amenityChips.appendChild(chip);
    });
  }

  function syncPriceLabel() {
    els.priceLabel.textContent = filters.maxPrice >= PRICE_MAX
      ? 'Any price'
      : 'Up to ' + fmtMoney(filters.maxPrice) + ' / night';
  }

  /* ---------- wiring ---------- */

  function resetFilters() {
    filters.hub = '';
    filters.checkIn = '';
    filters.checkOut = '';
    filters.guests = 1;
    filters.types.clear();
    filters.maxPrice = PRICE_MAX;
    filters.amenities.length = 0;
    filters.savedOnly = false;

    els.hub.value = '';
    els.checkIn.value = '';
    els.checkOut.value = '';
    els.checkOut.min = '';
    els.guests.value = '1';
    els.price.value = String(PRICE_MAX);
    els.savedChip.classList.remove('active');
    els.savedChip.setAttribute('aria-pressed', 'false');
    els.typeChips.querySelectorAll('.filter-chip').forEach(function (c) {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    els.amenityChips.querySelectorAll('.filter-chip').forEach(function (c) {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    syncPriceLabel();
    applyFilters(true);
  }

  function init() {
    STAYS_DATA.hubs.forEach(function (hub) {
      var opt = document.createElement('option');
      opt.value = hub;
      opt.textContent = HUB_CITY[hub] || hub;
      els.hub.appendChild(opt);
    });

    els.hub.addEventListener('change', function () { filters.hub = els.hub.value; applyFilters(true); });
    els.checkIn.addEventListener('change', function () {
      filters.checkIn = els.checkIn.value;
      els.checkOut.min = els.checkIn.value;
      applyFilters(true);
    });
    els.checkOut.addEventListener('change', function () { filters.checkOut = els.checkOut.value; applyFilters(true); });
    els.guests.addEventListener('change', function () {
      var g = parseInt(els.guests.value, 10);
      filters.guests = isNaN(g) || g < 1 ? 1 : Math.min(g, 8);
      els.guests.value = String(filters.guests);
      applyFilters(true);
    });
    els.price.addEventListener('input', function () {
      filters.maxPrice = parseInt(els.price.value, 10);
      syncPriceLabel();
      applyFilters(false);
    });
    els.savedChip.addEventListener('click', function () {
      filters.savedOnly = !filters.savedOnly;
      syncSavedChip();
      applyFilters(true);
    });
    els.reset.addEventListener('click', resetFilters);

    els.modalClose.addEventListener('click', closeModal);
    els.backdrop.addEventListener('click', function (e) {
      if (e.target === els.backdrop) closeModal();
    });

    buildTypeChips();
    buildAmenityChips();
    syncPriceLabel();
    syncSavedChip();
    applyFilters(false);
  }

  init();
})();
