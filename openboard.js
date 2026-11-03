/* HackBoard — The Open Board: community-submitted hackathon listings with
 * crowd seconding and an ambassador kit for recruiting organizers.
 *
 * MOUNT (already present in index.html):
 *   <section id="openboard" class="container section" aria-labelledby="openboard-heading">
 *     <h2 id="openboard-heading">The Open Board</h2>
 *     <div id="openboard-mount"></div>
 *   </section>
 *
 * Behavior notes:
 *  - No-ops gracefully until #openboard (or #openboard-mount) exists — safe
 *    to load before wiring, same pattern as koi.js / media.js.
 *  - Everything is local: submissions and "seconds" live in this browser's
 *    localStorage under 'hackboard:openboard:submissions'. Nothing uploads.
 *  - The crowd signal is explicitly NOT verification: cards are badged
 *    "Community-submitted — unverified" and keep saying "still not verified"
 *    after seconding. Seconds count enthusiasm, not confirmation.
 *  - Two demo submissions (demo: true) are seeded exactly once on first load
 *    so the board is never empty. They delete like any other entry and are
 *    NOT re-seeded afterward — even if the board is emptied.
 *  - Inline validation and an inline delete confirm; no alert()/confirm().
 *  - Injects its own styles at runtime (.ob-* namespace, design tokens with
 *    fallbacks) so custom.css stays untouched. No frameworks, no CDNs.
 *  - Exposes window.HackBoardOpenboard (validation, storage, seeding, second
 *    /delete ops, blurb/mailto composition) so a pure-Node smoke harness can
 *    exercise the logic with stubbed document/localStorage.
 */

(function () {
  'use strict';

  /* ---------- config ---------- */

  var STORAGE_KEY = 'hackboard:openboard:submissions';
  var DESC_MAX = 280;
  var HUBS = ['New York City', 'San Francisco', 'San Jose', 'Boston', 'Seattle', 'Other'];

  /* Two clearly-labeled demo submissions, seeded exactly once. */
  var DEMO_SEED = [
    {
      id: 'ob-demo-01',
      name: 'Demo submission — delete me',
      organizer: 'A friendly ghost organizer',
      start: '2026-11-14',
      end: '2026-11-15',
      url: 'https://example.org/demo-hack-1',
      hub: 'New York City',
      prize: '$1,024 (demo) and infinite bragging rights',
      description: 'Demo filler so the board is never empty on first load. Delete it, post a real hackathon, keep the honest badges.',
      submittedAt: '2026-10-30T12:00:00.000Z',
      demo: true,
      seconds: 0,
      secondedByMe: false
    },
    {
      id: 'ob-demo-02',
      name: 'Demo submission — delete me too',
      organizer: 'The Open Board crew',
      start: '2026-12-05',
      end: '2026-12-06',
      url: 'https://example.org/demo-hack-2',
      hub: 'San Francisco',
      prize: '',
      description: 'Second demo entry — also safe to delete. Everything on this board is community-submitted and unverified until an organizer confirms it.',
      submittedAt: '2026-10-30T12:00:00.000Z',
      demo: true,
      seconds: 0,
      secondedByMe: false
    }
  ];

  /* ---------- tiny helpers ---------- */

  function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function trimStr(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

  function isValidISODate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    var d = new Date(String(s) + 'T00:00:00');
    return !isNaN(d.getTime());
  }

  function fmtDate(iso) {
    var d = new Date(String(iso) + 'T00:00:00');
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (e) { return String(iso); }
  }

  function fmtStamp(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (e) { return String(iso); }
  }

  /* ---------- validation (pure — exercised by the smoke harness) ---------- */

  function validateUrl(u) {
    var s = trimStr(u);
    if (!s) return 'A registration URL is required — where do builders sign up?';
    var parsed = null;
    try { parsed = new URL(s); } catch (e) { parsed = null; }
    if (!parsed) return 'That does not parse as a URL — include the full address, e.g. https://example.org/hack.';
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Only http(s) links count — no javascript: or other schemes.';
    }
    return null;
  }

  /* Returns { ok, errors } where errors maps field name -> human message. */
  function validateSubmission(data) {
    var errors = {};
    var d = data || {};
    if (!trimStr(d.name)) errors.name = 'Give the event a name — builders need something to cheer for.';
    if (!trimStr(d.organizer)) errors.organizer = 'Who is running this? An organizer name is required.';
    if (!trimStr(d.start)) errors.start = 'Pick a start date.';
    else if (!isValidISODate(d.start)) errors.start = 'That start date does not parse — use the date picker.';
    if (!trimStr(d.end)) errors.end = 'Pick an end date.';
    else if (!isValidISODate(d.end)) errors.end = 'That end date does not parse — use the date picker.';
    if (!errors.start && !errors.end && String(d.end) < String(d.start)) {
      errors.end = 'The end date is before the start date — time travel is not a track (yet).';
    }
    var urlErr = validateUrl(d.url);
    if (urlErr) errors.url = urlErr;
    if (trimStr(d.description).length > DESC_MAX) {
      errors.description = 'Keep the description to ' + DESC_MAX + ' characters or fewer.';
    }
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  /* ---------- storage ---------- */

  function getStorage() {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage;
    } catch (e) { return null; }
  }

  function loadSubmissions(store) {
    var s = store || getStorage();
    if (!s) return [];
    try {
      var raw = s.getItem(STORAGE_KEY);
      if (raw === null) return []; /* never seeded — not an error */
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (x) { return x && typeof x === 'object'; }) : [];
    } catch (err) {
      console.warn('HackBoard Open Board: stored submissions unreadable, starting fresh.', err && err.message);
      return [];
    }
  }

  function saveSubmissions(arr, store) {
    var s = store || getStorage();
    if (!s) return false;
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(arr) ? arr : []));
      return true;
    } catch (err) {
      console.warn('HackBoard Open Board: could not persist submissions.', err && err.message);
      return false;
    }
  }

  /* Seeds the two demo entries exactly once: only when the storage key has
   * never been written. Deleting every entry afterward stays empty. */
  function seedIfNeeded(store) {
    var s = store || getStorage();
    if (!s) return [];
    try {
      if (s.getItem(STORAGE_KEY) !== null) return loadSubmissions(s);
    } catch (e) { return loadSubmissions(s); }
    var seeded = DEMO_SEED.map(function (d) { return clone(d); });
    saveSubmissions(seeded, s);
    return seeded;
  }

  /* ---------- board operations (pure — return new arrays) ---------- */

  function sortSubmissions(arr) {
    return (arr || []).slice().sort(function (a, b) {
      var as = String(a.start || '9999-12-31');
      var bs = String(b.start || '9999-12-31');
      if (as !== bs) return as < bs ? -1 : 1;
      return String(a.submittedAt || '').localeCompare(String(b.submittedAt || ''));
    });
  }

  /* One second per browser: enforced by the persisted secondedByMe flag. */
  function secondSubmission(arr, id) {
    var next = (arr || []).map(function (s) { return clone(s); });
    for (var i = 0; i < next.length; i++) {
      if (next[i].id === id) {
        if (next[i].secondedByMe) return { next: next, changed: false, reason: 'already-seconded' };
        next[i].seconds = (typeof next[i].seconds === 'number' && next[i].seconds >= 0) ? next[i].seconds + 1 : 1;
        next[i].secondedByMe = true;
        return { next: next, changed: true };
      }
    }
    return { next: next, changed: false, reason: 'not-found' };
  }

  function removeSubmission(arr, id) {
    return (arr || []).filter(function (s) { return s && s.id !== id; });
  }

  function newSubmission(data) {
    var d = data || {};
    return {
      id: 'ob-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      name: trimStr(d.name),
      organizer: trimStr(d.organizer),
      start: trimStr(d.start),
      end: trimStr(d.end),
      url: trimStr(d.url),
      hub: HUBS.indexOf(trimStr(d.hub)) !== -1 ? trimStr(d.hub) : 'Other',
      prize: trimStr(d.prize),
      description: trimStr(d.description),
      submittedAt: new Date().toISOString(),
      demo: false,
      seconds: 0,
      secondedByMe: false
    };
  }

  /* Badge copy: the honest part. Seconding never upgrades this to verified. */
  function badgeText(sub) {
    var n = sub && typeof sub.seconds === 'number' ? sub.seconds : 0;
    if (n > 0) {
      return 'Seconded by ' + n + (n === 1 ? ' builder' : ' builders') + ' — still not verified';
    }
    return 'Community-submitted — unverified';
  }

  /* ---------- ambassador kit composition (pure) ---------- */

  function pageUrl() {
    try {
      var href = window.location && window.location.href ? String(window.location.href) : '';
      return href.split('#')[0];
    } catch (e) { return ''; }
  }

  function inviteBlurb() {
    var url = pageUrl();
    return [
      'Building something this season? HackBoard’s Open Board is a community board of hackathons posted by builders, for builders.',
      'Post your event, second the ones you would actually attend, and keep the signal honest — every card is labeled “community-submitted — unverified” until an organizer confirms it. Crowd seconds are enthusiasm, not verification.',
      url ? 'Add yours here: ' + url : 'Find it on HackBoard’s Open Board.'
    ].join('\n');
  }

  function emailSubject() {
    return 'Post your hackathon on HackBoard’s Open Board';
  }

  function emailBody(organizer) {
    var who = trimStr(organizer) ? 'Hi ' + trimStr(organizer) + ' — ' : 'Hi there — ';
    var url = pageUrl();
    return who +
      'I build with HackBoard, a board of hackathons worth a weekend. Would you list your event on the Open Board, our community-submitted board? ' +
      'Posting takes a minute: event name, dates, a registration link, and a hub. Builders can second listings they are excited about, ' +
      'and every card is honestly labeled “community-submitted — unverified” until you confirm the details yourself.' +
      (url ? '\n\nSubmit yours here: ' + url : '');
  }

  function mailtoHref(organizer) {
    return 'mailto:?subject=' + encodeURIComponent(emailSubject()) +
           '&body=' + encodeURIComponent(emailBody(organizer));
  }

  /* ---------- styles (injected at runtime; .ob-* namespace) ---------- */

  var STYLE_CSS = [
    '.ob-wrap{display:flex;flex-direction:column;gap:var(--space-4,16px);}',
    '.ob-card{background:var(--surface-primary,#fff);border:1px solid var(--border-subtle,rgba(0,0,0,0.08));',
    '  border-radius:var(--radius-xl,14px);padding:var(--space-5,20px);box-shadow:var(--shadow-lifted-card,0 8px 24px rgba(0,0,0,0.06));}',
    '.ob-card h3{margin:0 0 var(--space-2,8px);font-size:1.05rem;}',
    '.ob-sub{margin:0 0 var(--space-3,12px);font-size:0.9rem;color:var(--text-secondary,rgba(0,0,0,0.6));line-height:1.5;}',
    '.ob-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--space-3,12px);}',
    '.ob-field{display:flex;flex-direction:column;gap:var(--space-1,4px);}',
    '.ob-field > label{font-size:0.82rem;font-weight:600;color:var(--text-primary,#111);}',
    '.ob-input{width:100%;box-sizing:border-box;font:inherit;font-size:0.9rem;color:var(--text-primary,#111);',
    '  background:var(--surface-primary,#fff);border:1px solid var(--border-default,rgba(0,0,0,0.16));',
    '  border-radius:var(--radius-md,8px);padding:var(--space-2,8px) var(--space-3,12px);}',
    '.ob-input:focus-visible{outline:2px solid var(--border-focus,#0f6fbd);outline-offset:1px;}',
    '.ob-input[aria-invalid="true"]{border-color:var(--state-error-border,var(--red-600,#b3261e));}',
    '.ob-textarea{min-height:72px;resize:vertical;}',
    '.ob-counter{font-size:0.75rem;color:var(--text-tertiary,rgba(0,0,0,0.45));align-self:flex-end;}',
    '.ob-error{margin:0;font-size:0.78rem;color:var(--state-error-fg,var(--red-800,#b3261e));}',
    '.ob-error[hidden]{display:none;}',
    '.ob-form-foot{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-3,12px);margin-top:var(--space-2,8px);}',
    '.ob-hint{font-size:0.78rem;color:var(--text-tertiary,rgba(0,0,0,0.45));}',
    '.ob-board-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:var(--space-2,8px);}',
    '.ob-count{margin:0;font-size:0.85rem;color:var(--text-secondary,rgba(0,0,0,0.6));}',
    '.ob-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-4,16px);margin-top:var(--space-3,12px);}',
    '.ob-entry{display:flex;flex-direction:column;gap:var(--space-2,8px);background:var(--surface-primary,#fff);}',
    '.ob-entry-top{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:var(--space-2,8px);}',
    '.ob-entry h4{margin:0;font-size:0.98rem;line-height:1.3;}',
    '.ob-badge{display:inline-flex;align-items:center;border-radius:999px;padding:2px 10px;font-size:0.7rem;font-weight:600;white-space:nowrap;',
    '  background:var(--state-error-bg,var(--red-100,#fdecea));color:var(--state-error-fg,var(--red-800,#b3261e));',
    '  border:1px solid var(--state-error-border,rgba(179,38,30,0.35));}',
    '.ob-badge.ob-badge-seconded{background:rgba(245,166,35,0.16);color:#8a5a00;border-color:rgba(245,166,35,0.5);}',
    '.ob-demo-chip{display:inline-flex;align-items:center;border-radius:999px;padding:1px 8px;font-size:0.68rem;font-weight:600;',
    '  background:var(--surface-secondary,rgba(0,0,0,0.05));color:var(--text-secondary,rgba(0,0,0,0.6));border:1px dashed var(--border-default,rgba(0,0,0,0.2));}',
    '.ob-meta{margin:0;font-size:0.82rem;color:var(--text-secondary,rgba(0,0,0,0.6));}',
    '.ob-desc{margin:0;font-size:0.85rem;color:var(--text-primary,#222);line-height:1.5;}',
    '.ob-link{font-size:0.85rem;color:var(--border-focus,#0f6fbd);text-decoration:underline;}',
    '.ob-link:focus-visible{outline:2px solid var(--border-focus,#0f6fbd);outline-offset:2px;}',
    '.ob-stamp{margin:0;font-size:0.75rem;color:var(--text-tertiary,rgba(0,0,0,0.45));}',
    '.ob-actions{display:flex;flex-wrap:wrap;gap:var(--space-2,8px);margin-top:auto;padding-top:var(--space-2,8px);border-top:1px solid var(--border-subtle,rgba(0,0,0,0.08));}',
    '.ob-confirm{display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-2,8px);font-size:0.82rem;color:var(--text-secondary,rgba(0,0,0,0.65));}',
    '.ob-confirm[hidden]{display:none;}',
    '.ob-empty{margin:var(--space-3,12px) 0 0;font-size:0.9rem;color:var(--text-secondary,rgba(0,0,0,0.6));}',
    '.ob-empty[hidden]{display:none;}',
    '.ob-foot{margin:0;font-size:0.8rem;color:var(--text-tertiary,rgba(0,0,0,0.5));line-height:1.5;}',
    '.ob-btn-row{display:flex;flex-wrap:wrap;gap:var(--space-2,8px);}',
    '@media (max-width:560px){.ob-form-grid{grid-template-columns:1fr;}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('openboard-styles')) return;
    var style = document.createElement('style');
    style.id = 'openboard-styles';
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
  }

  /* ---------- DOM construction ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function init() {
    var section = document.getElementById('openboard');
    var mount = document.getElementById('openboard-mount') || section;
    if (!mount) return; /* no-op until the lead wires the section */

    injectStyles();

    var announcer = document.getElementById('sr-announcer');
    function announce(msg) {
      try { if (announcer) announcer.textContent = msg; } catch (e) { /* announcer is a nicety */ }
    }

    seedIfNeeded();

    /* ----- shared field machinery ----- */

    var fieldRefs = {};

    function makeField(key, labelText, control, errId) {
      control.id = 'ob-f-' + key;
      var wrap = el('div', 'ob-field');
      var label = el('label', null, labelText);
      label.setAttribute('for', control.id);
      var err = el('p', 'ob-error');
      err.id = errId;
      err.hidden = true;
      wrap.appendChild(label);
      wrap.appendChild(control);
      wrap.appendChild(err);
      fieldRefs[key] = { input: control, err: err, label: label };
      control.addEventListener('input', function () { setError(key, null); });
      control.addEventListener('change', function () { setError(key, null); });
      return wrap;
    }

    function setError(key, msg) {
      var ref = fieldRefs[key];
      if (!ref) return;
      if (msg) {
        ref.err.textContent = msg;
        ref.err.hidden = false;
        ref.input.setAttribute('aria-invalid', 'true');
        ref.input.setAttribute('aria-describedby', ref.err.id);
      } else {
        ref.err.textContent = '';
        ref.err.hidden = true;
        ref.input.setAttribute('aria-invalid', 'false');
        ref.input.removeAttribute('aria-describedby');
      }
    }

    /* ----- wrap ----- */

    mount.textContent = '';
    var wrap = el('div', 'ob-wrap');

    /* ----- submission form ----- */

    var formCard = el('div', 'ob-card ob-form-card');
    formCard.appendChild(el('h3', null, 'Post a hackathon'));
    formCard.appendChild(el('p', 'ob-sub',
      'Know a hackathon worth a weekend? Post it. Your name on it stays honest: it will show up labeled “community-submitted — unverified” until an organizer confirms the details.'));

    var nameIn = el('input', 'ob-input');
    nameIn.type = 'text';
    nameIn.placeholder = 'e.g. Vultr Agent Rush';

    var orgIn = el('input', 'ob-input');
    orgIn.type = 'text';
    orgIn.placeholder = 'e.g. Vultr + DevGrants Daily';

    var startIn = el('input', 'ob-input');
    startIn.type = 'date';

    var endIn = el('input', 'ob-input');
    endIn.type = 'date';
    startIn.addEventListener('change', function () { try { endIn.setAttribute('min', startIn.value || ''); } catch (e) { /* cosmetic */ } });

    var urlIn = el('input', 'ob-input');
    urlIn.type = 'url';
    urlIn.placeholder = 'https://example.org/register';

    var hubSel = el('select', 'ob-input');
    HUBS.forEach(function (hub) {
      var opt = el('option', null, hub);
      opt.value = hub;
      hubSel.appendChild(opt);
    });

    var prizeIn = el('input', 'ob-input');
    prizeIn.type = 'text';
    prizeIn.placeholder = 'e.g. $5,000 prize pool (optional)';

    var descIn = el('textarea', 'ob-input ob-textarea');
    try { descIn.setAttribute('maxlength', String(DESC_MAX)); } catch (e) { /* cosmetic */ }
    descIn.placeholder = 'What makes it worth showing up for? (optional)';

    var counter = el('span', 'ob-counter', '0 / ' + DESC_MAX);
    descIn.addEventListener('input', function () {
      var len = (descIn.value || '').length;
      counter.textContent = len + ' / ' + DESC_MAX;
      if (len > DESC_MAX) setError('description', 'Keep the description to ' + DESC_MAX + ' characters or fewer.');
      else setError('description', null);
    });

    var grid = el('div', 'ob-form-grid');
    grid.appendChild(makeField('name', 'Event name *', nameIn, 'ob-err-name'));
    grid.appendChild(makeField('organizer', 'Organizer *', orgIn, 'ob-err-organizer'));
    grid.appendChild(makeField('start', 'Starts *', startIn, 'ob-err-start'));
    grid.appendChild(makeField('end', 'Ends *', endIn, 'ob-err-end'));
    grid.appendChild(makeField('url', 'Registration URL *', urlIn, 'ob-err-url'));
    grid.appendChild(makeField('hub', 'Hub', hubSel, 'ob-err-hub'));
    grid.appendChild(makeField('prize', 'Prize (optional)', prizeIn, 'ob-err-prize'));

    var descWrap = makeField('description', 'Description (optional)', descIn, 'ob-err-description');
    descWrap.appendChild(counter);

    var submitBtn = el('button', 'btn btn-primary btn-sm ob-submit-btn', 'Post it to the board');
    submitBtn.type = 'button';

    var formFoot = el('div', 'ob-form-foot');
    formFoot.appendChild(submitBtn);
    formFoot.appendChild(el('span', 'ob-hint', '* required · posting is local to this browser'));

    formCard.appendChild(grid);
    formCard.appendChild(descWrap);
    formCard.appendChild(formFoot);
    wrap.appendChild(formCard);

    submitBtn.addEventListener('click', function () {
      var data = {
        name: nameIn.value,
        organizer: orgIn.value,
        start: startIn.value,
        end: endIn.value,
        url: urlIn.value,
        hub: hubSel.value,
        prize: prizeIn.value,
        description: descIn.value
      };
      var res = validateSubmission(data);

      setError('name', res.errors.name || null);
      setError('organizer', res.errors.organizer || null);
      setError('start', res.errors.start || null);
      setError('end', res.errors.end || null);
      setError('url', res.errors.url || null);
      setError('description', res.errors.description || null);

      if (!res.ok) {
        var firstBad = ['name', 'organizer', 'start', 'end', 'url', 'description'].filter(function (k) { return res.errors[k]; })[0];
        if (firstBad && fieldRefs[firstBad] && fieldRefs[firstBad].input &&
            typeof fieldRefs[firstBad].input.focus === 'function') {
          fieldRefs[firstBad].input.focus();
        }
        announce('The form has problems — fix the highlighted fields and try again.');
        return;
      }

      var arr = loadSubmissions();
      var record = newSubmission(data);
      arr.push(record);
      saveSubmissions(arr);

      nameIn.value = '';
      orgIn.value = '';
      startIn.value = '';
      endIn.value = '';
      urlIn.value = '';
      hubSel.value = HUBS[0];
      prizeIn.value = '';
      descIn.value = '';
      counter.textContent = '0 / ' + DESC_MAX;

      renderBoard();
      announce('Posted ' + record.name + ' to the Open Board. It is visible only in this browser and stays unverified until an organizer confirms it.');
    });

    /* ----- the board ----- */

    var boardCard = el('div', 'ob-card ob-board-card');
    var boardHead = el('div', 'ob-board-head');
    boardHead.appendChild(el('h3', null, 'The board'));
    var countLine = el('p', 'ob-count', '');
    countLine.setAttribute('aria-live', 'polite');
    boardHead.appendChild(countLine);

    var grid2 = el('div', 'ob-grid');
    var emptyMsg = el('p', 'ob-empty',
      'Nothing here yet — post the first hackathon above. (If you deleted the demo entries, they stay deleted.)');
    emptyMsg.hidden = true;

    boardCard.appendChild(boardHead);
    boardCard.appendChild(grid2);
    boardCard.appendChild(emptyMsg);
    wrap.appendChild(boardCard);

    function entryCard(sub) {
      var card = el('article', 'ob-card ob-entry');
      card.setAttribute('aria-label', sub.name);

      var top = el('div', 'ob-entry-top');
      var titleWrap = el('div');
      titleWrap.appendChild(el('h4', null, sub.name));
      if (sub.demo) {
        var chip = el('span', 'ob-demo-chip', 'Demo entry');
        titleWrap.appendChild(chip);
      }
      top.appendChild(titleWrap);
      var badge = el('span', 'ob-badge' + (sub.seconds > 0 ? ' ob-badge-seconded' : ''), badgeText(sub));
      top.appendChild(badge);
      card.appendChild(top);

      card.appendChild(el('p', 'ob-meta',
        'Organized by ' + (trimStr(sub.organizer) || 'unknown') + ' · ' + (trimStr(sub.hub) || 'Other')));
      card.appendChild(el('p', 'ob-meta', fmtDate(sub.start) + ' → ' + fmtDate(sub.end)));
      card.appendChild(el('p', 'ob-meta', 'Prize: ' + (trimStr(sub.prize) || 'not listed')));
      if (trimStr(sub.description)) card.appendChild(el('p', 'ob-desc', sub.description));

      if (validateUrl(sub.url) === null) {
        var link = el('a', 'ob-link', 'Registration link ↗');
        link.href = sub.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        card.appendChild(link);
      } else {
        card.appendChild(el('p', 'ob-meta', 'Registration link: (stored URL is not a valid http(s) link)'));
      }

      card.appendChild(el('p', 'ob-stamp',
        'Submitted ' + fmtStamp(sub.submittedAt) + ' · lives only in this browser · unverified'));

      var actions = el('div', 'ob-actions');

      var secondBtn = el('button', 'btn btn-secondary btn-sm ob-second-btn');
      secondBtn.type = 'button';
      secondBtn.setAttribute('aria-pressed', String(!!sub.secondedByMe));
      if (sub.secondedByMe) {
        secondBtn.disabled = true;
        secondBtn.textContent = 'Seconded ✓ (you)';
      } else {
        secondBtn.textContent = 'Second this';
        secondBtn.addEventListener('click', function () {
          var arr = loadSubmissions();
          var res = secondSubmission(arr, sub.id);
          if (!res.changed) {
            announce('You already seconded ' + sub.name + ' — one second per browser.');
            return;
          }
          saveSubmissions(res.next);
          renderBoard();
          announce('Seconded ' + sub.name + '. Crowd seconds are enthusiasm, not verification — the badge still says unverified.');
        });
      }
      actions.appendChild(secondBtn);

      var deleteBtn = el('button', 'btn btn-ghost btn-sm ob-delete-btn', 'Delete');
      deleteBtn.type = 'button';

      var confirmRow = el('div', 'ob-confirm');
      confirmRow.hidden = true;
      confirmRow.setAttribute('role', 'group');
      confirmRow.setAttribute('aria-label', 'Confirm deletion of ' + sub.name);
      confirmRow.appendChild(el('span', null, 'Remove this from your board? It only leaves this browser.'));
      var yesBtn = el('button', 'btn btn-primary btn-sm ob-confirm-yes', 'Yes, delete');
      yesBtn.type = 'button';
      var keepBtn = el('button', 'btn btn-ghost btn-sm ob-confirm-no', 'Keep it');
      keepBtn.type = 'button';
      confirmRow.appendChild(yesBtn);
      confirmRow.appendChild(keepBtn);

      deleteBtn.addEventListener('click', function () {
        confirmRow.hidden = false;
        deleteBtn.hidden = true;
        try { yesBtn.focus(); } catch (e) { /* focus is a nicety */ }
      });
      keepBtn.addEventListener('click', function () {
        confirmRow.hidden = true;
        deleteBtn.hidden = false;
        try { deleteBtn.focus(); } catch (e) { /* focus is a nicety */ }
      });
      yesBtn.addEventListener('click', function () {
        var arr = removeSubmission(loadSubmissions(), sub.id);
        saveSubmissions(arr);
        renderBoard();
        announce('Removed ' + sub.name + ' from your board.');
      });

      actions.appendChild(deleteBtn);
      actions.appendChild(confirmRow);
      card.appendChild(actions);
      return card;
    }

    function renderBoard() {
      var subs = sortSubmissions(loadSubmissions());
      grid2.textContent = '';
      countLine.textContent = subs.length + (subs.length === 1 ? ' submission' : ' submissions') +
        ' · soonest start first · all unverified';
      if (!subs.length) {
        emptyMsg.hidden = false;
        return;
      }
      emptyMsg.hidden = true;
      var frag = document.createDocumentFragment();
      subs.forEach(function (s) { frag.appendChild(entryCard(s)); });
      grid2.appendChild(frag);
    }

    renderBoard();
    wrap.appendChild(boardCard);

    /* ----- ambassador kit ----- */

    var ambCard = el('div', 'ob-card ob-ambassador-card');
    ambCard.appendChild(el('h3', null, 'Ambassador kit — recruit organizers'));
    ambCard.appendChild(el('p', 'ob-sub',
      'The board is only as good as its listings. Know someone running a hackathon? Send them an invite — copy a blurb or open a prefilled email.'));

    var ambRow = el('div', 'ob-btn-row');

    var copyBtn = el('button', 'btn btn-secondary btn-sm ob-copy-btn', 'Copy invite blurb');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', function () {
      copyText(inviteBlurb(), 'Invite blurb copied — paste it anywhere builders hang out.');
    });
    ambRow.appendChild(copyBtn);

    var mailLink = el('a', 'btn btn-ghost btn-sm ob-mail-link', 'Email an organizer');
    mailLink.href = mailtoHref('');
    ambRow.appendChild(mailLink);

    ambCard.appendChild(ambRow);
    wrap.appendChild(ambCard);

    /* ----- honest footer ----- */

    wrap.appendChild(el('p', 'ob-foot',
      'Honesty check: submissions and seconds live in this browser only — this demo uploads nothing and nobody curates them. ' +
      '“Seconded by N builders” is a crowd signal, never verification; only the organizer can confirm an event’s details.'));

    mount.appendChild(wrap);

    /* ---------- clipboard (with fallback) ---------- */

    function legacyCopy(text) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        return !!ok;
      } catch (e) { return false; }
    }

    function copyText(text, okMsg) {
      var failMsg = 'Copy failed — your browser blocked clipboard access. Select and copy the blurb manually.';
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(text).then(function () { announce(okMsg); }, function () {
            announce(legacyCopy(text) ? okMsg : failMsg);
          });
          return;
        }
      } catch (e) { /* fall through to legacy path */ }
      announce(legacyCopy(text) ? okMsg : failMsg);
    }
  }

  /* ---------- exports for the smoke harness ---------- */

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    DESC_MAX: DESC_MAX,
    HUBS: HUBS,
    validateSubmission: validateSubmission,
    validateUrl: validateUrl,
    loadSubmissions: loadSubmissions,
    saveSubmissions: saveSubmissions,
    seedIfNeeded: seedIfNeeded,
    sortSubmissions: sortSubmissions,
    secondSubmission: secondSubmission,
    removeSubmission: removeSubmission,
    newSubmission: newSubmission,
    badgeText: badgeText,
    inviteBlurb: inviteBlurb,
    emailSubject: emailSubject,
    emailBody: emailBody,
    mailtoHref: mailtoHref
  };
  if (typeof window !== 'undefined') window.HackBoardOpenboard = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
