/* HackBoard — The Oracle: your twin's verdict on where to build next.
 *
 * The personalized companion to predictor.js. Where the predictor scores
 * project archetypes against board-wide patterns, the Oracle scores the
 * open field against ONE builder's twin profile: archetype boost tags,
 * attendance history (returns and prize wins), deadline lead time, and
 * tracked prize magnitude. One primary pick, two runner-ups, receipts
 * that cite the user's own data, and honest footnotes — a heuristic,
 * never odds.
 *
 * Contract (see quiz.js / twin.js):
 *   window.HackBoardForge = { getProfile, saveProfile, resetProfile, ARCHETYPES }
 *   Profile over localStorage 'hackboard:twin:profile':
 *     { archetypeId, archetypeName, boostTags[], hue,
 *       attendance: [{ eventId, eventName, ts, built, prize, wouldReturn, sleepHours }] }
 *   twin.js dispatches window event 'hackboard:twin-updated' on any change.
 *
 * Behavior notes:
 *  - Mounts into #oracle-mount (falls back to section#oracle); no-ops
 *    gracefully until the lead wires the markup.
 *  - Profile access: HackBoardForge.getProfile() if present, else a raw
 *    localStorage parse — so the Oracle still speaks before quiz.js loads.
 *  - Injects its own styles (.oracle-*); custom.css stays untouched.
 *  - English-first: no data-i18n attributes, i18n.js untouched.
 *  - Pure-Node smoke harness: `node oracle.js` runs the self-test suite
 *    and exits 0/1. In the browser nothing of it executes.
 */

(function () {
  'use strict';

  /* ---------- config ---------- */

  var STORAGE_KEY = 'hackboard:twin:profile';
  var TWIN_EVENT = 'hackboard:twin-updated';
  var MOUNT_ID = 'oracle-mount';
  var SECTION_ID = 'oracle';
  var LEAD_TIME_DAYS = 30;      /* deadline proximity decays over a month */
  var CONF_MARGIN_HIGH = 3;     /* top-vs-runner margin for high confidence */
  var CONF_MARGIN_MED = 4;      /* margin that alone buys medium confidence */

  /* Scoring weights. Tag affinity dominates; history refines; the calendar
   * and the prize pool nudge. Read as points, not probabilities. */
  var W = {
    boostTag: 6,   /* open event tag ∈ profile.boostTags */
    returnTag: 3,  /* open event tag ∈ tags of events you'd return to */
    winTag: 2,     /* open event tag ∈ tags of events where you won a prize */
    deadlineMax: 2,/* sooner deadline scores higher, fading over LEAD_TIME_DAYS */
    prizeMax: 3    /* log-scaled tracked prize magnitude */
  };

  function rootHost() {
    return typeof window !== 'undefined' ? window
      : (typeof globalThis !== 'undefined' ? globalThis : undefined);
  }

  /* ---------- pure helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normTag(t) {
    return String(t == null ? '' : t).trim().toLowerCase();
  }

  /* Parse a US-dollar figure out of tracked prize prose.
   * "$46,000" → 46000 · "$150K Gemini credits" → 150000
   * "₹18 lakh (~$20,000)" → 20000 · "Sponsor pool (TBD) (unverified)" → null
   * Returns the LARGEST dollar figure found, or null when none appears. */
  function parsePrizeUsd(s) {
    if (typeof s !== 'string') return null;
    var flat = s.replace(/,/g, '');
    var re = /\$\s*~?\s*(\d+(?:\.\d+)?)\s*(k|m)?/gi;
    var best = null;
    var m;
    while ((m = re.exec(flat)) !== null) {
      var n = parseFloat(m[1]);
      if (!isFinite(n)) continue;
      if (m[2] === 'k' || m[2] === 'K') n *= 1000;
      else if (m[2] === 'm' || m[2] === 'M') n *= 1000000;
      if (best === null || n > best) best = n;
    }
    return best;
  }

  function isPrizeWin(prizeText) {
    if (typeof prizeText !== 'string') return false;
    var t = prizeText.trim();
    if (!t) return false;
    if (/^(\$?0|none|n\/?a|no(\s+prize)?|nil)$/i.test(t)) return false;
    return true;
  }

  /* Whole days until an ISO deadline (T23:59:59), negative once passed. */
  function daysUntil(iso, nowMs) {
    var t = new Date(String(iso) + 'T23:59:59').getTime();
    if (!isFinite(t)) return null;
    return Math.ceil((t - nowMs) / 86400000);
  }

  function listAnd(items) {
    return (items || []).join(', ');
  }

  /* ---------- profile access (Forge first, raw localStorage fallback) ---------- */

  function readProfile() {
    var root = rootHost();
    if (root) {
      try {
        if (root.HackBoardForge && typeof root.HackBoardForge.getProfile === 'function') {
          var p = root.HackBoardForge.getProfile();
          if (p && typeof p === 'object') return p;
        }
      } catch (e) { /* fall through to raw storage */ }
      try {
        var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') return parsed;
        }
      } catch (e) { /* unreadable profile — treat as none */ }
    }
    return null;
  }

  function readEvents() {
    var root = rootHost();
    var d = (root && root.HACKBOARD_DATA) || {};
    return {
      open: Array.isArray(d.open) ? d.open : [],
      concluded: Array.isArray(d.concluded) ? d.concluded : []
    };
  }

  function nowMs() {
    return Date.now();
  }

  /* ---------- affinity model ---------- */

  function findEventById(id, events) {
    for (var i = 0; i < events.length; i++) {
      if (events[i] && events[i].id === id) return events[i];
    }
    return null;
  }

  /* Tag affinities derived from the twin profile. Attendance entries carry
   * eventId, not tags — resolve tags through the tracked event data. */
  function buildAffinity(profile, events) {
    var all = (events.open || []).concat(events.concluded || []);
    var boost = {};
    var returns = {};  /* normTag -> eventName that planted it */
    var wins = {};     /* normTag -> "eventName (prize)" that planted it */

    (profile && profile.boostTags ? profile.boostTags : []).forEach(function (t) {
      boost[normTag(t)] = true;
    });

    var attendance = profile && Array.isArray(profile.attendance) ? profile.attendance : [];
    for (var i = 0; i < attendance.length; i++) {
      var entry = attendance[i];
      if (!entry || !entry.eventId) continue;
      var ev = findEventById(entry.eventId, all);
      if (!ev || !Array.isArray(ev.tags)) continue;
      if (entry.wouldReturn === true) {
        for (var r = 0; r < ev.tags.length; r++) {
          returns[normTag(ev.tags[r])] = entry.eventName || ev.name || 'a past event';
        }
      }
      if (entry.built && isPrizeWin(entry.prize)) {
        for (var w = 0; w < ev.tags.length; w++) {
          wins[normTag(ev.tags[w])] = (entry.eventName || ev.name || 'a past event') +
            (entry.prize ? ' (' + entry.prize + ')' : '');
        }
      }
    }
    return { boost: boost, returns: returns, wins: wins };
  }

  /* ---------- scoring ---------- */

  function scoreEvent(ev, affinity, now) {
    var boostHits = [], returnHits = [], winHits = [];
    var tags = Array.isArray(ev.tags) ? ev.tags : [];
    for (var i = 0; i < tags.length; i++) {
      var n = normTag(tags[i]);
      if (affinity.boost[n]) boostHits.push(tags[i]);
      if (affinity.returns[n]) returnHits.push(tags[i]);
      if (affinity.wins[n]) winHits.push(tags[i]);
    }

    var days = daysUntil(ev.deadline, now);
    var deadlineScore = (days === null || days < 0) ? 0
      : W.deadlineMax * Math.max(0, 1 - days / LEAD_TIME_DAYS);
    var prizeUsd = parsePrizeUsd(ev.prize);
    var prizeScore = (prizeUsd && prizeUsd > 0)
      ? W.prizeMax * Math.min(1, Math.log10(1 + prizeUsd / 1000) / 3) : 0;

    return {
      ev: ev,
      days: days,
      prizeUsd: prizeUsd,
      boostHits: boostHits,
      returnHits: returnHits,
      winHits: winHits,
      tagScore: boostHits.length * W.boostTag,
      historyScore: returnHits.length * W.returnTag + winHits.length * W.winTag,
      deadlineScore: deadlineScore,
      prizeScore: prizeScore
    };
  }

  function scoredTotal(s) {
    return s.tagScore + s.historyScore + s.deadlineScore + s.prizeScore;
  }

  /* Eligibility: registration must be open, the user must not have sworn
   * the event off, and the deadline must not already be past. */
  function isEligible(ev, profile, now) {
    if (!ev || ev.regClosed) return false;
    var days = daysUntil(ev.deadline, now);
    if (days === null || days < 0) return false;
    var attendance = profile && Array.isArray(profile.attendance) ? profile.attendance : [];
    for (var i = 0; i < attendance.length; i++) {
      if (attendance[i] && attendance[i].eventId === ev.id && attendance[i].wouldReturn === false) {
        return false;
      }
    }
    return true;
  }

  function rankEvents(profile, events, now) {
    events = events || readEvents();
    now = typeof now === 'number' ? now : nowMs();
    var affinity = buildAffinity(profile, events);
    var ranked = [];
    var open = events.open || [];
    for (var i = 0; i < open.length; i++) {
      var ev = open[i];
      if (!isEligible(ev, profile, now)) continue;
      var s = scoreEvent(ev, affinity, now);
      s.total = scoredTotal(s);
      ranked.push(s);
    }
    ranked.sort(function (a, b) {
      if (b.total !== a.total) return b.total - a.total;
      var pa = a.prizeUsd || 0, pb = b.prizeUsd || 0;
      if (pb !== pa) return pb - pa;
      return String(a.ev.name).localeCompare(String(b.ev.name));
    });
    return { affinity: affinity, ranked: ranked };
  }

  function confidenceFor(top, second, profile) {
    var quizTaken = !!(profile && (profile.archetypeId || profile.archetypeName));
    var logged = !!(profile && Array.isArray(profile.attendance) && profile.attendance.length >= 1);
    var complete = quizTaken && logged;
    var margin = second ? top.total - second.total : top.total;
    if (top.total <= 0) return 'low';
    if (complete && margin >= CONF_MARGIN_HIGH) return 'high';
    if (complete || margin >= CONF_MARGIN_MED) return 'medium';
    return 'low';
  }

  /* The ONE pick: top score, its runner-up, and the two alternates. */
  function choosePick(profile, events, now) {
    if (!profile || typeof profile !== 'object') return null;
    var r = rankEvents(profile, events, now);
    if (!r.ranked.length) return { empty: true, reason: 'no-eligible' };
    var top = r.ranked[0];
    var second = r.ranked[1] || null;
    return {
      profile: profile,
      affinity: r.affinity,
      top: top,
      second: second,
      alternates: r.ranked.slice(1, 3),
      confidence: confidenceFor(top, second, profile)
    };
  }

  /* ---------- receipts & share text ---------- */

  function prizeClause(s) {
    if (s.prizeUsd && s.ev.prize) return ' — ' + String(s.ev.prize).trim() + ' on the board';
    return '';
  }

  function buildReceipts(profile, s, affinity) {
    var aff = s.affinity || affinity || { wins: {}, returns: {} };
    var out = [];
    var arch = (profile && profile.archetypeName) ? String(profile.archetypeName) : 'your archetype';

    /* 1 — archetype + boost tags, citing the tracked pool when we parsed one */
    if (s.boostHits.length) {
      out.push("You're a " + arch + " — this one sits in your " + listAnd(s.boostHits) +
        " lane, right where your boost tags point" + prizeClause(s) + ".");
    } else if (s.returnHits.length || s.winHits.length) {
      out.push("No open event matches your " + arch + " boost tags head-on, so the Oracle leans on your history and the calendar.");
    } else {
      out.push("You're a " + arch + " — nothing open matches your boost tags head-on, so this pick rides the calendar and the pool instead.");
    }

    /* 2 — attendance history, citing the user's OWN logged events */
    if (s.winHits.length) {
      var winRef = aff.wins[normTag(s.winHits[0])];
      out.push("You logged a prize win at " + winRef + " — " + listAnd(s.winHits) + " builds are your proven lane.");
    } else if (s.returnHits.length) {
      var returnRef = aff.returns[normTag(s.returnHits[0])];
      out.push("You said you'd go back to " + returnRef + " — this event shares its " + listAnd(s.returnHits) + " lane.");
    } else if (s.boostHits.length) {
      out.push("No attendance logged yet — log a hackathon in your twin and these receipts sharpen.");
    }

    /* 3 — the calendar, plus an honest word on unverified money */
    var cal = "Registration closes " + s.ev.deadline + " — " + s.days +
      (s.days === 1 ? ' day' : ' days') + " of lead time to scope a demo.";
    if (!s.prizeUsd && /unverified/i.test(String(s.ev.prize || ''))) {
      cal += " Prize figure is as tracked — treat it as a rumor until the event page confirms.";
    }
    out.push(cal);

    return out.slice(0, 3);
  }

  function altLine(alt, top) {
    var bits = [];
    if (alt.boostHits.length) bits.push('also in your ' + listAnd(alt.boostHits) + ' lane');
    else if (alt.returnHits.length) bits.push("rides a lane you said you'd revisit");
    if (alt.boostHits.length < top.boostHits.length) bits.push('thinner tag overlap with your twin');
    else if (top.prizeUsd && alt.prizeUsd && alt.prizeUsd < top.prizeUsd) bits.push('smaller tracked pool');
    else if (alt.days > top.days) bits.push('a looser deadline');
    if (!bits.length) bits.push('scored just under the pick');
    var line = bits[0].charAt(0).toUpperCase() + bits[0].slice(1);
    if (bits.length > 1) line += ', ' + bits[1];
    return line + '.';
  }

  function composeShareText(pick) {
    if (!pick || !pick.top) return '';
    var ev = pick.top.ev;
    var receipts = buildReceipts(pick.profile, pick.top, pick.affinity);
    var meta = [ev.format, ev.hub || ev.location].filter(Boolean).join(' · ');
    var lines = [
      "My next hackathon — The Oracle's pick for my " +
        ((pick.profile && pick.profile.archetypeName) || 'builder') + " twin:",
      String(ev.name),
      meta,
      ev.prize ? 'Prize: ' + ev.prize : '',
      'Why: ' + receipts.slice(0, 2).join(' '),
      'Register: ' + (ev.url || 'link on the board'),
      "Heuristic pick from my HackBoard twin profile — not odds. Prize figures as tracked."
    ];
    return lines.filter(Boolean).join('\n');
  }

  /* ---------- styles (injected; keeps custom.css untouched) ---------- */

  var STYLE_CSS = [
    '.oracle-empty{text-align:center;padding:var(--space-6,2.5rem) var(--space-4,1rem);',
    '  border:1px dashed var(--border-default,rgba(0,0,0,0.15));border-radius:var(--radius-card-lg,18px);',
    '  background:var(--surface-secondary,rgba(0,0,0,0.02));}',
    '.oracle-empty-line{font-size:1.05rem;margin:0 0 var(--space-4,1rem);color:var(--text-primary,#111);}',
    '.oracle-btn{display:inline-block;padding:0.55rem 1.15rem;border-radius:var(--radius-btn-lg,999px);',
    '  font:inherit;font-size:0.9rem;cursor:pointer;text-decoration:none;}',
    '.oracle-btn-primary{background:var(--accent-teal,#0f9e99);border:1px solid transparent;color:#fff;}',
    '.oracle-btn-ghost{background:transparent;border:1px solid var(--border-default,rgba(0,0,0,0.18));',
    '  color:var(--text-primary,#111);}',
    '.oracle-btn:focus-visible{outline:2px solid var(--border-focus,#0f9e99);outline-offset:2px;}',
    '.oracle-wrap{display:flex;flex-direction:column;gap:var(--space-4,1rem);margin-top:var(--space-4,1rem);}',
    '.oracle-pick{background:var(--surface-base,#fff);border:1px solid var(--border-default,rgba(0,0,0,0.1));',
    '  border-radius:var(--radius-card-lg,18px);box-shadow:var(--shadow-lifted-card,0 12px 32px rgba(0,0,0,0.10));',
    '  padding:var(--space-5,1.5rem);color:var(--text-primary,#111);}',
    '.oracle-kicker{font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;',
    '  color:var(--text-secondary,rgba(0,0,0,0.55));margin-bottom:var(--space-2,0.5rem);}',
    '.oracle-confidence{display:inline-block;margin-left:0.5rem;padding:0.1rem 0.6rem;border-radius:999px;',
    '  font-size:0.72rem;letter-spacing:0.04em;border:1px solid var(--border-default,rgba(0,0,0,0.15));}',
    '.oracle-confidence--high{background:rgba(15,158,153,0.14);border-color:rgba(15,158,153,0.5);color:#0b6f6b;}',
    '.oracle-confidence--medium{background:rgba(245,166,35,0.14);border-color:rgba(245,166,35,0.5);color:#8a5a00;}',
    '.oracle-confidence--low{background:rgba(0,0,0,0.06);color:var(--text-secondary,rgba(0,0,0,0.55));}',
    '.oracle-name{margin:0 0 var(--space-1,0.25rem);font-size:1.35rem;line-height:1.25;}',
    '.oracle-meta{margin:0 0 var(--space-4,1rem);color:var(--text-secondary,rgba(0,0,0,0.6));font-size:0.92rem;}',
    '.oracle-sub{margin:0 0 var(--space-2,0.5rem);font-size:0.95rem;}',
    '.oracle-receipts{margin:0 0 var(--space-4,1rem);padding-left:1.2rem;color:var(--text-primary,#111);}',
    '.oracle-receipts li{margin-bottom:var(--space-2,0.5rem);line-height:1.5;font-size:0.94rem;}',
    '.oracle-actions{display:flex;gap:var(--space-2,0.5rem);flex-wrap:wrap;margin-bottom:var(--space-3,0.75rem);}',
    '.oracle-footnotes{margin:0;font-size:0.78rem;line-height:1.5;color:var(--text-muted,rgba(0,0,0,0.5));}',
    '.oracle-alts{display:grid;gap:var(--space-3,0.75rem);}',
    '@media (min-width:640px){.oracle-alts{grid-template-columns:1fr 1fr;}}',
    '.oracle-alt{background:var(--surface-secondary,rgba(0,0,0,0.02));border:1px solid var(--border-subtle,rgba(0,0,0,0.08));',
    '  border-radius:var(--radius-md,12px);padding:var(--space-3,0.75rem) var(--space-4,1rem);',
    '  color:var(--text-primary,#111);font-size:0.88rem;line-height:1.45;}',
    '.oracle-alt strong{display:block;margin-bottom:0.15rem;}',
    '.oracle-alt-rank{color:var(--text-secondary,rgba(0,0,0,0.55));font-weight:600;margin-right:0.35rem;}',
    '.oracle-none{text-align:center;padding:var(--space-6,2.5rem) var(--space-4,1rem);',
    '  border:1px dashed var(--border-default,rgba(0,0,0,0.15));border-radius:var(--radius-card-lg,18px);',
    '  color:var(--text-secondary,rgba(0,0,0,0.6));}'
  ].join('');

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('oracle-styles')) return;
    var style = document.createElement('style');
    style.id = 'oracle-styles';
    style.textContent = STYLE_CSS;
    if (document.head) document.head.appendChild(style);
  }

  /* ---------- rendering ---------- */

  var lastShare = '';
  var wired = false;
  var wiredHost = null;

  function announce(msg) {
    if (typeof document === 'undefined') return;
    var el = document.getElementById('sr-announcer');
    if (el) el.textContent = msg;
  }

  function confidenceChipHtml(confidence) {
    var label = confidence.charAt(0).toUpperCase() + confidence.slice(1);
    return '<span class="oracle-confidence oracle-confidence--' + confidence + '">' +
      'Confidence: ' + label + '</span>';
  }

  function emptyStateHtml() {
    return '<div class="oracle-empty">' +
      '<p class="oracle-empty-line">The Oracle only speaks to a forged twin.</p>' +
      '<a class="oracle-btn oracle-btn-primary" href="#forge">Forge your twin</a>' +
      '</div>';
  }

  function noEligibleHtml() {
    return '<div class="oracle-none">Every open registration is either closed or ruled out by your ' +
      "twin's history. The Oracle speaks again when the board turns over.</div>";
  }

  function pickHtml(pick) {
    var ev = pick.top.ev;
    var receipts = buildReceipts(pick.profile, pick.top, pick.affinity);
    var metaBits = [];
    if (ev.format) metaBits.push(esc(ev.format));
    if (ev.hub || ev.location) metaBits.push(esc(ev.hub || ev.location));
    if (ev.dates) metaBits.push('starts ' + esc(ev.dates));
    metaBits.push('closes ' + esc(ev.deadline) + ' (' + pick.top.days +
      (pick.top.days === 1 ? ' day' : ' days') + ' left)');
    var prize = ev.prize ? esc(ev.prize) : 'prize on event page';

    var html =
      '<div class="oracle-wrap">' +
        '<article class="oracle-pick" aria-label="Oracle pick">' +
          '<div class="oracle-kicker">Your next hackathon' + confidenceChipHtml(pick.confidence) + '</div>' +
          '<h3 class="oracle-name">' + esc(ev.name) + '</h3>' +
          '<p class="oracle-meta">' + metaBits.join(' · ') + ' · <strong>' + prize + '</strong></p>' +
          '<h4 class="oracle-sub">Why this one</h4>' +
          '<ul class="oracle-receipts">' +
            receipts.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') +
          '</ul>' +
          '<div class="oracle-actions">' +
            '<a class="oracle-btn oracle-btn-primary" href="' + esc(ev.url || '#') +
              '" target="_blank" rel="noopener">Register ↗</a>' +
            '<button class="oracle-btn oracle-btn-ghost" type="button" data-oracle-share>Copy my pick</button>' +
          '</div>' +
          '<p class="oracle-footnotes">A transparent heuristic over your twin profile and this board&#39;s ' +
            'tracked data — not odds. Prize figures are as tracked; &quot;(unverified)&quot; stays until ' +
            'the event page confirms. Registration links can close early.</p>' +
        '</article>';

    if (pick.alternates && pick.alternates.length) {
      html += '<div class="oracle-alts">' + pick.alternates.map(function (alt, i) {
        return '<article class="oracle-alt">' +
          '<strong><span class="oracle-alt-rank">#' + (i + 2) + '</span>' + esc(alt.ev.name) + '</strong>' +
          esc(altLine(alt, pick.top)) +
          '</article>';
      }).join('') + '</div>';
    }

    return html + '</div>';
  }

  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function copyShare() {
    if (!lastShare) return;
    var ok = function () { announce('Oracle pick copied to your clipboard.'); };
    var fail = function () { announce('Copy failed — select the pick text and copy it manually.'); };
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastShare).then(ok, function () {
        if (legacyCopy(lastShare)) ok(); else fail();
      });
    } else if (legacyCopy(lastShare)) {
      ok();
    } else {
      fail();
    }
  }

  function onDocClick(e) {
    var node = e.target;
    if (node && typeof node.closest === 'function' && node.closest('[data-oracle-share]')) {
      copyShare();
    }
  }

  function ensureWired() {
    var root = rootHost();
    if (!root || typeof root.addEventListener !== 'function') return;
    if (wired && wiredHost === root) return;
    wired = true;
    wiredHost = root;
    root.addEventListener(TWIN_EVENT, function () { render(); });
    root.addEventListener('storage', function (e) {
      if (!e || e.key === null || e.key === STORAGE_KEY) render();
    });
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('click', onDocClick);
    }
  }

  /* Re-renders from the current profile. Returns true when it painted. */
  function render() {
    if (typeof document === 'undefined') return false;
    ensureWired();
    var mount = document.getElementById(MOUNT_ID) || document.getElementById(SECTION_ID);
    if (!mount) return false;
    injectStyles();
    var profile = readProfile();
    if (!profile) {
      lastShare = '';
      mount.innerHTML = emptyStateHtml();
      return true;
    }
    var pick = choosePick(profile, readEvents(), nowMs());
    if (!pick || pick.empty) {
      lastShare = '';
      mount.innerHTML = noEligibleHtml();
      return true;
    }
    lastShare = composeShareText(pick);
    mount.innerHTML = pickHtml(pick);
    return true;
  }

  /* ---------- boot ---------- */

  function boot() {
    render();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  /* ---------- exports ---------- */

  var api = {
    readProfile: readProfile,
    rankEvents: rankEvents,
    choosePick: choosePick,
    buildReceipts: buildReceipts,
    composeShareText: composeShareText,
    parsePrizeUsd: parsePrizeUsd,
    daysUntil: daysUntil,
    render: render
  };
  var root0 = rootHost();
  if (root0) root0.HackBoardOracle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ---------- pure-Node smoke harness (`node oracle.js`) ---------- */

  if (typeof window === 'undefined' && typeof require === 'function' && require.main === module) {
    (function () {
      var passed = 0, failed = 0;
      function ok(cond, name) {
        if (cond) { passed++; console.log('  PASS ' + name); }
        else { failed++; console.log('  FAIL ' + name); }
      }
      function eq(a, b, name) { ok(a === b, name + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

      var DAY = 86400000;
      var NOW = Date.parse('2026-10-30T00:00:00Z');
      function inDays(n) { return new Date(NOW + n * DAY).toISOString().slice(0, 10); }

      /* Fixture board — scripted, independent of data.js. */
      var FIX = {
        open: [
          { id: 'agentfest-i', name: 'AgentFest', format: 'online', deadline: inDays(10), prize: '$50,000', tags: ['agents', 'ai'], url: 'https://x/1' },
          { id: 'web3-wars', name: 'Web3 Wars', format: 'online', deadline: inDays(20), prize: '$60,000', tags: ['web3', 'defi'], url: 'https://x/2' },
          { id: 'hw-haunt', name: 'Hardware Haunt', format: 'online', deadline: inDays(5), prize: '$46,000', tags: ['hardware', 'ai'], url: 'https://x/3' },
          { id: 'civic-sprint', name: 'Civic Sprint', format: 'online', deadline: inDays(25), prize: '$5,000', tags: ['social', 'students'], url: 'https://x/4', regClosed: true, regNote: 'closed' },
          { id: 'web3-redux', name: 'Web3 Redux', format: 'online', deadline: inDays(12), prize: '$10,000', tags: ['web3'], url: 'https://x/5' },
          { id: 'agentfest-ii', name: 'AgentFest II', format: 'online', deadline: inDays(40), prize: '$50,000', tags: ['agents', 'ai'], url: 'https://x/6' },
          { id: 'mystery-pool', name: 'Mystery Pool', format: 'online', deadline: inDays(15), prize: 'Sponsor pool (TBD on event page) (unverified)', tags: ['agents'], url: 'https://x/7' }
        ],
        concluded: [
          { id: 'agentfest-old', name: 'AgentFest Last Season', deadline: inDays(-60), prize: '$20,000', tags: ['agents', 'ai'] }
        ]
      };

      function ids(pick, n) {
        return pick.alternates ? [pick.top.ev.id].concat(pick.alternates.map(function (a) { return a.ev.id; })).slice(0, n) : [pick.top.ev.id];
      }

      var archA = { archetypeId: 'mercenary', archetypeName: 'Bounty Mercenary', boostTags: ['agents', 'ai'], attendance: [] };
      var archB = {
        archetypeId: 'zealot', archetypeName: 'Chain Zealot', boostTags: ['web3', 'defi'],
        attendance: [{ eventId: 'web3-wars', eventName: 'Web3 Wars', ts: NOW - 5 * DAY, built: true, prize: '$2,000', wouldReturn: true, sleepHours: 6 }]
      };
      var archB2 = {
        archetypeId: 'zealot', archetypeName: 'Chain Zealot', boostTags: ['web3', 'defi'],
        attendance: [{ eventId: 'web3-wars', eventName: 'Web3 Wars', ts: NOW - 5 * DAY, built: false, wouldReturn: false }]
      };
      var archC = { archetypeId: 'hermit', archetypeName: 'Hardware Hermit', boostTags: ['hardware'], attendance: [] };
      var archD = {
        archetypeId: 'dreamer', archetypeName: 'Civic Dreamer', boostTags: ['social', 'students'],
        attendance: [{ eventId: 'civic-sprint', eventName: 'Civic Sprint', ts: NOW - 9 * DAY, built: false, wouldReturn: false }]
      };

      console.log('parsePrizeUsd');
      eq(api.parsePrizeUsd('$46,000'), 46000, 'plain comma figure');
      eq(api.parsePrizeUsd('$6,000+ cash + $150K Gemini credits'), 150000, 'K multiplier, largest wins');
      eq(api.parsePrizeUsd('₹18 lakh (~$20,000)'), 20000, 'dollar figure inside rupee prose');
      eq(api.parsePrizeUsd('Sponsor pool (TBD on event page) (unverified)'), null, 'no dollar figure → null');
      eq(api.parsePrizeUsd('5 non-cash prizes'), null, 'non-cash prose → null');

      console.log('scoring — four archetypes');
      var pickA = api.choosePick(archA, FIX, NOW);
      /* agentfest-i and agentfest-ii share both boost tags; i wins on lead time.
       * hw-haunt is #3 — its 'ai' tag also hits the Mercenary's boost tags. */
      eq(ids(pickA, 3).join(','), 'agentfest-i,agentfest-ii,hw-haunt', 'Bounty Mercenary: tag tie broken by lead time');
      eq(pickA.confidence, 'low', 'Bounty Mercenary: no attendance log → confidence capped');
      var pickB = api.choosePick(archB, FIX, NOW);
      eq(pickB.top.ev.id, 'web3-wars', 'Chain Zealot: boost tags + return + win history reinforce');
      eq(pickB.confidence, 'high', 'Chain Zealot: quiz taken + attendance + wide margin → high');
      var pickC = api.choosePick(archC, FIX, NOW);
      eq(pickC.top.ev.id, 'hw-haunt', 'Hardware Hermit: single boost tag wins');
      eq(pickC.top.ev.id !== 'agentfest-i', true, 'Hardware Hermit: no cross-tag bleed into agents');
      var pickD = api.choosePick(archD, FIX, NOW);
      eq(pickD.top.ev.id, 'hw-haunt', 'Civic Dreamer: calendar + pool decide with no tag match');

      console.log('exclusions');
      var dAll = api.rankEvents(archD, FIX, NOW).ranked.map(function (s) { return s.ev.id; });
      eq(dAll.indexOf('civic-sprint'), -1, 'regClosed event excluded');
      var b2 = api.choosePick(archB2, FIX, NOW);
      eq(b2.top.ev.id, 'web3-redux', 'not-returning event excluded → next tag match wins');
      var b2All = api.rankEvents(archB2, FIX, NOW).ranked.map(function (s) { return s.ev.id; });
      eq(b2All.indexOf('web3-wars'), -1, 'wouldReturn=false excludes the event entirely');

      console.log('empty state');
      eq(api.choosePick(null, FIX, NOW), null, 'no profile → no pick');
      eq(api.choosePick(undefined, FIX, NOW), null, 'undefined profile → no pick');

      console.log('receipts');
      var receipts = api.buildReceipts(archB, pickB.top, pickB.affinity);
      var joined = receipts.join(' ');
      ok(receipts.length >= 2 && receipts.length <= 3, 'receipt count is 2–3');
      ok(joined.indexOf('Chain Zealot') !== -1, 'receipt cites the archetype');
      ok(joined.indexOf('Web3 Wars') !== -1, "receipt cites the user's own attendance event");
      ok(joined.indexOf('proven lane') !== -1, 'prize-win receipt present');
      var unv = FIX.open[6]; /* mystery-pool — unverified, unparseable prize */
      var fakeS = {
        ev: unv, days: api.daysUntil(unv.deadline, NOW),
        prizeUsd: api.parsePrizeUsd(unv.prize),
        boostHits: ['agents'], returnHits: [], winHits: []
      };
      var unvReceipts = api.buildReceipts(archA, fakeS, { wins: {}, returns: {} });
      ok(unvReceipts.join(' ').indexOf('rumor') !== -1, 'unverified prize footnote reachable');

      console.log('share text');
      var share = api.composeShareText(pickB);
      ok(share.indexOf('Web3 Wars') !== -1, 'share names the pick');
      ok(share.indexOf('https://x/2') !== -1, 'share carries the registration link');
      ok(share.indexOf('not odds') !== -1, 'share carries the honest footnote');
      eq(api.composeShareText(null), '', 'share of empty pick is empty string');

      console.log('localStorage fallback');
      global.localStorage = { getItem: function () { return JSON.stringify(archA); } };
      eq(api.readProfile() && api.readProfile().archetypeName, 'Bounty Mercenary', 'raw localStorage parse when Forge absent');
      delete global.localStorage;

      console.log('DOM: no-op without mount point');
      var dom = stubDom({});
      eq(api.render(), false, 'render no-ops with no #oracle mount');
      eq(!!dom.registry['oracle-styles'], false, 'no styles injected without a mount');

      console.log('DOM: empty state, pick render, twin-updated re-render, share');
      dom = stubDom({ 'oracle-mount': newFakeEl(), 'sr-announcer': newFakeEl() });
      global.window.HackBoardForge = { getProfile: function () { return null; } };
      eq(api.render(), true, 'render paints with a mount');
      ok(dom.registry['oracle-mount'].innerHTML.indexOf('forged twin') !== -1, 'empty state message rendered');
      ok(dom.registry['oracle-mount'].innerHTML.indexOf('#forge') !== -1, 'empty state links to #forge');

      global.window.HackBoardForge = { getProfile: function () { return archB; } };
      fireWin(dom, 'hackboard:twin-updated');
      ok(dom.registry['oracle-mount'].innerHTML.indexOf('Web3 Wars') !== -1, 'pick rendered after twin-updated');
      ok(dom.registry['oracle-mount'].innerHTML.indexOf('Confidence: High') !== -1, 'confidence chip rendered');

      global.window.HackBoardForge = { getProfile: function () { return archC; } };
      fireWin(dom, 'hackboard:twin-updated');
      ok(dom.registry['oracle-mount'].innerHTML.indexOf('Hardware Haunt') !== -1, 're-render on twin-updated reflects new profile');
      ok(dom.registry['oracle-mount'].innerHTML.indexOf('Chain Zealot') === -1, 'stale archetype fully replaced');

      fireDoc(dom, 'click', { target: { closest: function (sel) { return sel === '[data-oracle-share]' ? {} : null; } } });
      ok(dom.registry['sr-announcer'].textContent.indexOf('copied') !== -1, 'share click announces to the sr-announcer');

      console.log('');
      console.log(failed === 0
        ? 'ALL SMOKE TESTS PASSED (' + passed + ' assertions)'
        : 'SMOKE FAILURES: ' + failed + ' of ' + (passed + failed) + ' assertions');
      process.exit(failed === 0 ? 0 : 1);

      /* ---- harness helpers ---- */

      function newFakeEl() {
        return { innerHTML: '', textContent: '', appendChild: function () {}, addEventListener: function () {} };
      }

      function stubDom(registrySpec) {
        var listeners = { win: {}, doc: {} };
        var registry = {};
        Object.keys(registrySpec).forEach(function (k) { registry[k] = registrySpec[k]; });
        global.window = {
          HACKBOARD_DATA: FIX,
          addEventListener: function (t, fn) { (listeners.win[t] = listeners.win[t] || []).push(fn); }
        };
        global.document = {
          readyState: 'complete',
          addEventListener: function (t, fn) { (listeners.doc[t] = listeners.doc[t] || []).push(fn); },
          head: { appendChild: function (el) { registry[el.id] = el; } },
          body: { appendChild: function () {}, removeChild: function () {} },
          createElement: function () {
            return { style: {}, textContent: '', value: '',
              setAttribute: function () {}, select: function () {} };
          },
          execCommand: function () { return true; },
          getElementById: function (id) { return registry[id] || null; }
        };
        return { listeners: listeners, registry: registry };
      }

      function fireWin(dom, type) {
        (dom.listeners.win[type] || []).forEach(function (fn) { fn({}); });
      }

      function fireDoc(dom, type, event) {
        (dom.listeners.doc[type] || []).forEach(function (fn) { fn(event); });
      }
    })();
  }
})();
