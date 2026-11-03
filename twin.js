/* HackBoard — twin.js: the gamified digital twin. The user's OWN koi that
 * levels up with real hackathon attendance, plus the survey pulse that logs it.
 *
 * SUGGESTED MARKUP (already wired by the lead in index.html — twin.js no-ops
 * until it exists, so this file is safe to load early or late):
 *
 *   <section id="twin" class="container section" aria-labelledby="twin-heading">
 *     <h2 id="twin-heading">Your twin</h2>
 *     <div id="twin-mount"></div>
 *   </section>
 *   <!-- plus the shared live region --> <span id="sr-announcer" ...></span>
 *
 * Behavior notes:
 *  - Profile source of truth: window.HackBoardForge (quiz.js) if present, else
 *    localStorage key 'hackboard:twin:profile' directly. Same shape either way.
 *  - After ANY profile write this file dispatches window event
 *    'hackboard:twin-updated' (and re-renders when others dispatch it).
 *  - Everything lives in this browser: localStorage only, nothing uploaded.
 *  - Canvas colors read design tokens at draw time via html.light / html.dark
 *    (same pattern as koi.js); the fish's own color derives from profile.hue,
 *    which is user data, not a theme color.
 *  - prefers-reduced-motion: static pose, no animation loop.
 *  - Pauses drawing via IntersectionObserver when off-screen; DPR-aware.
 *  - Styles are injected at runtime under .twin-* classes; no custom.css edit.
 *  - English-first this batch; no data-i18n attributes by design.
 */

(function () {
  'use strict';

  /* ---------- config ---------- */

  var LS_KEY = 'hackboard:twin:profile';
  var UPDATE_EVENT = 'hackboard:twin-updated';

  var XP_VALUES = { forge: 50, attendance: 40, prize: 80, dayActivity: 10 };

  var LEVEL_THRESHOLDS = [0, 100, 250, 500, 900, 1400];
  var LEVEL_NAMES = ['Egg', 'Fry', 'Finger', 'Juvenile', 'Koi', 'Dragon Koi'];

  var BADGES = [
    { id: 'first-log', name: 'First Splash',
      desc: 'Logged your very first hackathon. The pond noticed.' },
    { id: 'three-logger', name: 'Triple Dipper',
      desc: 'Three hackathons logged. You are basically amphibious now.' },
    { id: 'winner', name: 'Podium Shine',
      desc: 'Won a prize at a logged hackathon. Your scales gleam.' },
    { id: 'night-owl', name: 'Night Owl',
      desc: 'Shipped on 6 hours of sleep or less, twice. Please nap.' },
    { id: 'streak-7', name: 'Seven Day Glow',
      desc: 'Kept a 7-day activity streak alive. Devotion, honestly.' }
  ];

  var MOOD_COPY = {
    'new': 'Newly forged and curious.',
    'bright': 'Bright and swimming happily — see you at the next one?',
    'content': 'Cruising along, waiting for your next hackathon.',
    'dim': 'Resting in the shade. Log a hackathon to wake your twin up.'
  };

  /* ---------- shared helpers (koi.js pattern) ---------- */

  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || '').trim();
      if (v && v.indexOf('var(') !== 0) return v;
    } catch (e) { /* CSSOM unavailable — fall through */ }
    return fallback;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function tokenPalette() {
    var isDark = document.documentElement.classList.contains('dark');
    return {
      isDark: isDark,
      water: cssVar('--surface-primary', isDark ? '#0e1b1e' : '#eef4f3'),
      text: cssVar('--text-primary', isDark ? '#f4f1ea' : '#0f1a1a'),
      sub: cssVar('--text-secondary', isDark ? 'rgba(244,241,234,0.66)' : 'rgba(0,0,0,0.6)'),
      teal: cssVar('--accent-teal', '#0f9e99'),
      border: cssVar('--border-default', isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)')
    };
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function isFiniteNumber(n) { return typeof n === 'number' && isFinite(n); }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function shortDate(ms) {
    var d = new Date(ms);
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }

  /* local-calendar helpers — streaks run on calendar days, not 24h blocks */
  function midnight(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function daysBetween(fromMs, toMs) {
    return Math.round((midnight(toMs) - midnight(fromMs)) / 86400000);
  }

  /* ---------- profile layer ---------- */

  function forgeApi() {
    var f = window.HackBoardForge;
    if (f && typeof f.getProfile === 'function' && typeof f.saveProfile === 'function') return f;
    return null;
  }

  function normalizeAttendance(raw) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    for (var i = 0; i < raw.length; i++) {
      var e = raw[i] || {};
      if (!e.eventName) continue;
      out.push({
        eventId: typeof e.eventId === 'string' ? e.eventId : '',
        eventName: String(e.eventName),
        ts: isFiniteNumber(e.ts) ? e.ts : Date.now(),
        built: e.built ? String(e.built) : '',
        prize: (e.prize === 'track' || e.prize === 'grand') ? e.prize : 'none',
        wouldReturn: e.wouldReturn === true ? true : (e.wouldReturn === false ? false : null),
        sleepHours: isFiniteNumber(e.sleepHours) ? clamp(e.sleepHours, 0, 24) : null
      });
    }
    return out;
  }

  function normalizeProfile(raw) {
    var p = raw && typeof raw === 'object' ? raw : {};
    var xp = isFiniteNumber(p.xp) ? Math.max(0, Math.round(p.xp)) : 0;
    var badgeList = [];
    if (Array.isArray(p.badges)) {
      for (var i = 0; i < p.badges.length; i++) {
        if (typeof p.badges[i] === 'string' && badgeList.indexOf(p.badges[i]) === -1) {
          badgeList.push(p.badges[i]);
        }
      }
    }
    return {
      archetypeId: p.archetypeId ? String(p.archetypeId) : '',
      archetypeName: p.archetypeName ? String(p.archetypeName) : '',
      archetypeTagline: p.archetypeTagline ? String(p.archetypeTagline) : '',
      boostTags: Array.isArray(p.boostTags) ? p.boostTags.slice() : [],
      hue: isFiniteNumber(p.hue) ? clamp(p.hue, 0, 360) : null,
      createdAt: p.createdAt ? String(p.createdAt) : '',
      xp: xp,
      level: levelFor(xp),
      badges: badgeList,
      streak: isFiniteNumber(p.streak) ? Math.max(0, Math.round(p.streak)) : 0,
      lastActive: p.lastActive ? String(p.lastActive) : '',
      attendance: normalizeAttendance(p.attendance),
      forgeXpCredited: !!p.forgeXpCredited
    };
  }

  function loadProfile() {
    var api = forgeApi();
    if (api) {
      try { return normalizeProfile(api.getProfile()); } catch (e) { /* fall through */ }
    }
    try {
      var raw = localStorage.getItem(LS_KEY);
      return normalizeProfile(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return normalizeProfile(null);
    }
  }

  function persistProfile(p) {
    p.level = levelFor(p.xp);
    var api = forgeApi();
    if (api) {
      try { api.saveProfile(p); } catch (e) { /* keep local copy in sync below */ }
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) { /* storage full or blocked */ }
    dispatchTwinUpdated();
  }

  function dispatchTwinUpdated() {
    try {
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new window.CustomEvent(UPDATE_EVENT));
      } else if (typeof window.Event === 'function') {
        window.dispatchEvent(new window.Event(UPDATE_EVENT));
      } else if (typeof document.createEvent === 'function') {
        var ev = document.createEvent('Event');
        ev.initEvent(UPDATE_EVENT, false, false);
        window.dispatchEvent(ev);
      }
    } catch (e) { /* announcing the update must never break a save */ }
  }

  function announce(text) {
    var el = null;
    try { el = document.getElementById('sr-announcer'); } catch (e) { return; }
    if (!el) return;
    /* clear-then-set so identical messages re-announce */
    el.textContent = '';
    window.setTimeout(function () { el.textContent = text; }, 30);
  }

  /* ---------- XP engine (pure; shared by UI and smoke harness) ---------- */

  function levelFor(xp) {
    var v = isFiniteNumber(xp) ? Math.max(0, xp) : 0;
    var idx = 0;
    for (var i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (v >= LEVEL_THRESHOLDS[i]) idx = i;
    }
    return idx;
  }

  function levelNameFor(xp) { return LEVEL_NAMES[levelFor(xp)]; }

  function levelProgress(xp) {
    var idx = levelFor(xp);
    var base = LEVEL_THRESHOLDS[idx];
    var next = idx + 1 < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[idx + 1] : null;
    var frac = next === null ? 1 : clamp((xp - base) / (next - base), 0, 1);
    return { index: idx, name: LEVEL_NAMES[idx], base: base, next: next, toNext: next === null ? 0 : next - xp, frac: frac };
  }

  /* streak = consecutive calendar days with any XP activity; lapses if the
   * last active day is older than yesterday */
  function currentStreak(p, nowMs) {
    if (!p.lastActive) return 0;
    var d = daysBetween(new Date(p.lastActive).getTime(), nowMs);
    if (d <= 1) return p.streak;
    return 0;
  }

  function moodOf(p, nowMs) {
    if (!p.lastActive) return 'new';
    var d = daysBetween(new Date(p.lastActive).getTime(), nowMs);
    if (d <= 1) return 'bright';
    if (d <= 14) return 'content';
    return 'dim';
  }

  /* any XP-earning action on a fresh calendar day: +10 and the streak ticks */
  function touchDay(p, nowMs) {
    var bonus = 0;
    if (!p.lastActive) {
      bonus = XP_VALUES.dayActivity;
      p.streak = 1;
    } else {
      var d = daysBetween(new Date(p.lastActive).getTime(), nowMs);
      if (d === 1) { bonus = XP_VALUES.dayActivity; p.streak = p.streak + 1; }
      else if (d > 1) { bonus = XP_VALUES.dayActivity; p.streak = 1; }
      /* d <= 0: already active today — no double bonus, streak holds */
    }
    p.lastActive = new Date(nowMs).toISOString();
    return bonus;
  }

  function evalBadges(p, nowMs) {
    var earned = [];
    function has(id) { return p.badges.indexOf(id) !== -1; }
    if (p.attendance.length >= 1 && !has('first-log')) earned.push('first-log');
    if (p.attendance.length >= 3 && !has('three-logger')) earned.push('three-logger');
    var won = false;
    var sleepy = 0;
    for (var i = 0; i < p.attendance.length; i++) {
      var e = p.attendance[i];
      if (e.prize === 'track' || e.prize === 'grand') won = true;
      if (isFiniteNumber(e.sleepHours) && e.sleepHours <= 6) sleepy++;
    }
    if (won && !has('winner')) earned.push('winner');
    if (sleepy >= 2 && !has('night-owl')) earned.push('night-owl');
    if (currentStreak(p, nowMs) >= 7 && !has('streak-7')) earned.push('streak-7');
    return earned;
  }

  function applyForgeCredit(p, nowMs) {
    if (!p.archetypeId || p.forgeXpCredited) return null;
    var beforeLevel = levelFor(p.xp);
    var result = { xpGained: XP_VALUES.forge, dayBonus: 0, newBadges: [], leveledUp: false };
    p.forgeXpCredited = true;
    p.xp += XP_VALUES.forge;
    var bonus = touchDay(p, nowMs);
    p.xp += bonus;
    result.dayBonus = bonus;
    result.xpGained += bonus;
    var badges = evalBadges(p, nowMs);
    for (var i = 0; i < badges.length; i++) p.badges.push(badges[i]);
    result.newBadges = badges;
    var afterLevel = levelFor(p.xp);
    result.leveledUp = afterLevel > beforeLevel;
    p.level = afterLevel;
    return result;
  }

  /* log attendance + award XP + day bonus + badges; mutates a normalized profile */
  function applyLog(p, entry, nowMs) {
    var beforeLevel = levelFor(p.xp);
    var result = { xpGained: 0, dayBonus: 0, newBadges: [], leveledUp: false };
    p.attendance.push(normalizeAttendance([entry])[0]);
    result.xpGained += XP_VALUES.attendance;
    if (entry.prize === 'track' || entry.prize === 'grand') result.xpGained += XP_VALUES.prize;
    p.xp += result.xpGained;
    var bonus = touchDay(p, nowMs);
    p.xp += bonus;
    result.dayBonus = bonus;
    result.xpGained += bonus;
    var badges = evalBadges(p, nowMs);
    for (var i = 0; i < badges.length; i++) p.badges.push(badges[i]);
    result.newBadges = badges;
    var afterLevel = levelFor(p.xp);
    result.leveledUp = afterLevel > beforeLevel;
    p.level = afterLevel;
    return result;
  }

  function badgeMeta(id) {
    for (var i = 0; i < BADGES.length; i++) {
      if (BADGES[i].id === id) return BADGES[i];
    }
    return null;
  }

  /* ---------- styles (injected; keeps custom.css untouched) ---------- */

  var TWIN_CSS = [
    '.twin-empty{border:1px dashed var(--border-default,rgba(0,0,0,0.15));border-radius:var(--radius-lg,14px);',
    '  background:var(--surface-base,#fff);color:var(--text-primary,#111);',
    '  padding:var(--space-8,32px);text-align:center;box-shadow:var(--shadow-lifted-card,0 10px 30px rgba(0,0,0,0.08));}',
    '.twin-empty h3{margin:0 0 var(--space-2,8px);}',
    '.twin-empty p{margin:0 auto var(--space-6,24px);max-width:42ch;color:var(--text-secondary,rgba(0,0,0,0.6));}',
    '.twin-btn{display:inline-block;padding:0.6rem 1.2rem;border-radius:999px;font:inherit;font-size:0.92rem;cursor:pointer;',
    '  text-decoration:none;background:var(--button-primary-bg,#0f9e99);color:var(--button-primary-fg,#fff);',
    '  border:1px solid transparent;}',
    '.twin-btn:focus-visible{outline:2px solid var(--border-focus,#0f9e99);outline-offset:2px;}',
    '.twin-dashboard{display:grid;gap:var(--space-6,24px);}',
    '.twin-grid{display:grid;grid-template-columns:minmax(260px,5fr) 7fr;gap:var(--space-6,24px);align-items:stretch;}',
    '.twin-card{background:var(--surface-base,#fff);color:var(--text-primary,#111);',
    '  border:1px solid var(--border-default,rgba(0,0,0,0.08));border-radius:var(--radius-card-lg,var(--radius-lg,14px));',
    '  box-shadow:var(--shadow-lifted-card,0 10px 30px rgba(0,0,0,0.08));padding:var(--space-6,24px);}',
    '.twin-card h3{margin:0 0 var(--space-3,12px);font-size:1.05rem;}',
    '.twin-pond-card{padding:0;overflow:hidden;display:flex;flex-direction:column;}',
    '.twin-pond-card h3{padding:var(--space-4,16px) var(--space-6,24px) 0;margin:0;}',
    '.twin-canvas{display:block;width:100%;height:280px;}',
    '.twin-mood-caption{padding:var(--space-2,8px) var(--space-6,24px) var(--space-4,16px);margin:0;',
    '  color:var(--text-secondary,rgba(0,0,0,0.6));font-size:0.88rem;}',
    '.twin-level-row{display:flex;align-items:baseline;justify-content:space-between;gap:var(--space-3,12px);flex-wrap:wrap;}',
    '.twin-level-name{font-size:1.35rem;font-weight:700;margin:0;}',
    '.twin-xp-note{color:var(--text-secondary,rgba(0,0,0,0.6));font-size:0.9rem;margin:0;}',
    '.twin-xpbar{height:10px;border-radius:999px;background:var(--surface-secondary,rgba(0,0,0,0.08));',
    '  overflow:hidden;margin:var(--space-3,12px) 0 var(--space-2,8px);}',
    '.twin-xpbar-fill{height:100%;border-radius:999px;background:var(--accent-teal,#0f9e99);width:0%;}',
    '.twin-xp-hint{margin:0 0 var(--space-4,16px);font-size:0.82rem;color:var(--text-tertiary,rgba(0,0,0,0.45));}',
    '.twin-streak{margin:0 0 var(--space-4,16px);font-size:0.92rem;}',
    '.twin-streak-sub{color:var(--text-tertiary,rgba(0,0,0,0.45));font-size:0.82rem;margin:2px 0 0;}',
    '.twin-badges{display:flex;flex-wrap:wrap;gap:var(--space-2,8px);}',
    '.twin-badge{border:1px dashed var(--border-default,rgba(0,0,0,0.2));border-radius:999px;',
    '  padding:0.3rem 0.75rem;font-size:0.8rem;color:var(--text-tertiary,rgba(0,0,0,0.45));opacity:0.75;}',
    '.twin-badge-earned{border-style:solid;border-width:1.5px;color:var(--text-primary,#111);opacity:1;',
    '  background:var(--surface-elevated,#fff);font-weight:600;}',
    '.twin-badge-desc{display:block;font-weight:400;font-size:0.72rem;}',
    '.twin-form{display:grid;gap:var(--space-4,16px);}',
    '.twin-field{display:grid;gap:var(--space-1,4px);}',
    '.twin-field label{font-size:0.88rem;font-weight:600;}',
    '.twin-field input,.twin-field select{font:inherit;padding:0.5rem 0.7rem;border-radius:10px;',
    '  border:1px solid var(--border-default,rgba(0,0,0,0.15));background:var(--surface-base,#fff);',
    '  color:var(--text-primary,#111);max-width:100%;}',
    '.twin-field input:focus-visible,.twin-field select:focus-visible{outline:2px solid var(--border-focus,#0f9e99);outline-offset:1px;}',
    '.twin-field-row{display:flex;gap:var(--space-4,16px);flex-wrap:wrap;}',
    '.twin-field-row .twin-field{flex:1 1 150px;}',
    '.twin-radio-row{display:flex;gap:var(--space-4,16px);align-items:center;font-size:0.92rem;}',
    '.twin-radio-row label{font-weight:400;display:flex;gap:6px;align-items:center;}',
    '.twin-field-error{color:var(--red-600,#c0392b);font-size:0.8rem;margin:0;min-height:1em;}',
    '.twin-form-note{color:var(--text-tertiary,rgba(0,0,0,0.45));font-size:0.8rem;margin:0;}',
    '.twin-history{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-3,12px);max-height:320px;overflow:auto;}',
    '.twin-history li{border:1px solid var(--border-subtle,rgba(0,0,0,0.08));border-radius:10px;padding:var(--space-3,12px) var(--space-4,16px);}',
    '.twin-history-head{display:flex;justify-content:space-between;gap:var(--space-2,8px);flex-wrap:wrap;font-size:0.92rem;}',
    '.twin-history-meta{color:var(--text-secondary,rgba(0,0,0,0.6));font-size:0.8rem;margin:var(--space-1,4px) 0 0;}',
    '.twin-prize-chip{border-radius:999px;padding:0.1rem 0.6rem;font-size:0.72rem;font-weight:700;',
    '  background:var(--accent-amber,#f5a623);color:#fff;white-space:nowrap;}',
    '.twin-privacy{color:var(--text-tertiary,rgba(0,0,0,0.45));font-size:0.8rem;margin:var(--space-2,8px) 0 0;}',
    '.twin-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}',
    '@media (max-width:760px){.twin-grid{grid-template-columns:1fr;}.twin-canvas{height:220px;}}',
    '@media (prefers-reduced-motion:no-preference){.twin-xpbar-fill{transition:width 0.4s var(--ease-smooth,ease);}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('twin-styles')) return;
    var style = document.createElement('style');
    style.id = 'twin-styles';
    style.textContent = TWIN_CSS;
    document.head.appendChild(style);
  }

  /* ---------- DOM helpers ---------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== null && text !== undefined) n.textContent = text;
    return n;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /* ---------- module state ---------- */

  var section = null;
  var mount = null;
  var canvasRef = null;
  var ctx = null;
  var palette = null;
  var reduced = false;
  var visible = true;
  var rafId = 0;
  var state = { profile: null, hueColor: null, shimmerUntil: 0, seenBadges: [] };
  var view = { x: 200, y: 120, angle: 0.3, tailPhase: 0, targetX: 260, targetY: 140 };
  var W = 0, H = 0, dpr = 1;

  /* ---------- twin canvas ---------- */

  function moodSpeed(mood) {
    if (mood === 'dim') return 0.35;
    if (mood === 'content') return 0.72;
    return 1;
  }

  function hueSize(level) {
    if (level <= 0) return 26;               /* egg radius */
    return 20 + Math.min(level, 5) * 5;      /* koi half-length-ish scale */
  }

  function fishColors(hue, mood) {
    var sat = mood === 'dim' ? 22 : (mood === 'content' ? 55 : 70);
    var light = mood === 'dim' ? 46 : 60;
    var patchHue = (hue + 42) % 360;
    return {
      body: 'hsl(' + hue + ',' + sat + '%,' + light + '%)',
      deep: 'hsl(' + hue + ',' + sat + '%,' + (light - 20) + '%)',
      patch: 'hsl(' + patchHue + ',' + sat + '%,' + (light + 16) + '%)',
      halo: 'hsla(' + hue + ',' + sat + '%,60%,0.16)'
    };
  }

  function resize() {
    if (!canvasRef || typeof canvasRef.getBoundingClientRect !== 'function') return;
    var rect = canvasRef.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    canvasRef.width = Math.round(W * dpr);
    canvasRef.height = Math.round(H * dpr);
    if (ctx && typeof ctx.setTransform === 'function') ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.x = clamp(view.x, 30, Math.max(30, W - 30));
    view.y = clamp(view.y, 30, Math.max(30, H - 30));
  }

  function drawWater() {
    ctx.fillStyle = palette.water;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = palette.isDark ? 'rgba(15,158,153,0.08)' : 'rgba(15,158,153,0.07)';
    ctx.beginPath();
    ctx.ellipse(W * 0.2, H * 0.78, 64, 30, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(W * 0.84, H * 0.22, 70, 34, -0.3, 0, Math.PI * 2);
    ctx.fill();
    /* a lily pad, because every home koi deserves one */
    ctx.fillStyle = palette.isDark ? 'rgba(15,158,153,0.35)' : 'rgba(15,158,153,0.3)';
    ctx.beginPath();
    ctx.ellipse(W * 0.86, H * 0.8, 24, 13, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEgg(c, now, s) {
    var bob = reduced ? 0 : Math.sin(view.tailPhase) * 3;
    ctx.save();
    ctx.translate(view.x, view.y + bob);
    ctx.shadowColor = 'rgba(0,0,0,' + (palette.isDark ? 0.3 : 0.12) + ')';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    var grad = ctx.createLinearGradient(0, -s, 0, s);
    grad.addColorStop(0, c.body);
    grad.addColorStop(1, c.deep);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, s, s * 1.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = c.patch;
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, -s * 0.3, s * 0.24, s * 0.16, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.25, s * 0.35, s * 0.18, s * 0.12, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawKoi(c, now, s, mood) {
    var wiggle = reduced ? 0 : Math.sin(view.tailPhase) * 0.22;
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.rotate(view.angle);

    /* body: tapered shape around a gently curved spine (koi.js lineage) */
    var segs = 7;
    var bodyW = s * 0.62;
    var droop = mood === 'dim' ? s * 0.06 : 0;
    ctx.beginPath();
    var j, uu, bxx, spineY, halfW;
    for (j = 0; j <= segs; j++) {
      uu = j / segs;
      bxx = (0.5 - uu) * s * 2.2;
      spineY = Math.sin(view.tailPhase - uu * 2.4) * s * 0.3 * uu + droop * uu;
      halfW = bodyW * Math.sin(Math.PI * (0.18 + 0.82 * uu) * 0.5 + 0.35) * (1 - uu * 0.7);
      if (j === 0) ctx.moveTo(bxx, spineY - halfW); else ctx.lineTo(bxx, spineY - halfW);
    }
    for (var k = segs; k >= 0; k--) {
      var u2 = k / segs;
      var bx2 = (0.5 - u2) * s * 2.2;
      var sy2 = Math.sin(view.tailPhase - u2 * 2.4) * s * 0.3 * u2 + droop * u2;
      var hw2 = bodyW * Math.sin(Math.PI * (0.18 + 0.82 * u2) * 0.5 + 0.35) * (1 - u2 * 0.7);
      ctx.lineTo(bx2, sy2 + hw2);
    }
    ctx.closePath();

    var grad = ctx.createLinearGradient(s * 1.1, 0, -s * 1.1, 0);
    grad.addColorStop(0, c.body);
    grad.addColorStop(1, c.deep);
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,' + (palette.isDark ? 0.35 : 0.14) + ')';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    /* koi patches */
    ctx.fillStyle = c.patch;
    ctx.globalAlpha = mood === 'dim' ? 0.5 : 0.8;
    ctx.beginPath();
    ctx.ellipse(s * 0.35, -s * 0.06, s * 0.34, s * 0.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-s * 0.3, s * 0.08, s * 0.26, s * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* tail fin */
    var tailX = -s * 1.1;
    var tailY = Math.sin(view.tailPhase - 2.4) * s * 0.3;
    ctx.fillStyle = c.deep;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.quadraticCurveTo(tailX - s * 0.7, tailY - s * 0.4 + wiggle * s, tailX - s * 0.9, tailY - s * 0.15 + wiggle * s * 1.4);
    ctx.quadraticCurveTo(tailX - s * 0.6, tailY, tailX - s * 0.9, tailY + s * 0.15 + wiggle * s * 1.4);
    ctx.quadraticCurveTo(tailX - s * 0.7, tailY + s * 0.4 + wiggle * s, tailX, tailY);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* pectoral fins */
    ctx.fillStyle = c.deep;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(s * 0.25, bodyW * 0.8, s * 0.3, s * 0.1, 0.6 + wiggle * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(s * 0.25, -bodyW * 0.8, s * 0.3, s * 0.1, -0.6 - wiggle * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* eye */
    ctx.fillStyle = 'rgba(20,25,28,0.85)';
    ctx.beginPath();
    ctx.arc(s * 0.88, -bodyW * 0.28, Math.max(1.6, s * 0.06), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawShimmer(now) {
    if (now > state.shimmerUntil) return;
    var phase = (now % 1200) / 1200;
    var s = hueSize(state.profile ? state.profile.level : 0) * 2;
    ctx.save();
    ctx.globalAlpha = 0.7 * (1 - phase * 0.5);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(view.x, view.y, s + 14 + phase * 16, (s + 14 + phase * 16) * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2 + phase * Math.PI;
      var rx = view.x + Math.cos(a) * (s * 0.9 + 10);
      var ry = view.y + Math.sin(a) * (s * 0.6 + 8);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(rx, ry, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function stepTwin(now) {
    var p = state.profile;
    if (!p) return;
    var mood = moodOf(p, now);
    var speedMul = moodSpeed(mood);
    var dx = view.targetX - view.x;
    var dy = view.targetY - view.y;
    if (Math.hypot(dx, dy) < 22 || (view.targetX < 0)) {
      view.targetX = 30 + Math.random() * Math.max(1, W - 60);
      view.targetY = 30 + Math.random() * Math.max(1, H - 60);
    }
    var desired = Math.atan2(dy, dx);
    var diff = desired - view.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    view.angle += diff * 0.03;
    var speed = 0.6 * speedMul;
    view.x += Math.cos(view.angle) * speed;
    view.y += Math.sin(view.angle) * speed;
    view.tailPhase += 0.09 * speedMul;
    view.x = clamp(view.x, 24, Math.max(24, W - 24));
    view.y = clamp(view.y, 24, Math.max(24, H - 24));
  }

  function draw(now) {
    if (!ctx || !state.profile) return;
    var p = state.profile;
    var mood = moodOf(p, now);
    var hue = p.hue === null ? 205 : p.hue;
    var c = fishColors(hue, mood);
    var s = hueSize(p.level);

    drawWater();

    /* mood halo */
    if (mood === 'bright' && !reduced) {
      ctx.fillStyle = c.halo;
      ctx.beginPath();
      ctx.ellipse(view.x, view.y, s * 2.4, s * 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (p.level <= 0) drawEgg(c, now, s);
    else drawKoi(c, now, s, mood);

    drawShimmer(now);

    /* soft floor shadow for depth */
    ctx.fillStyle = 'rgba(0,0,0,' + (palette.isDark ? 0.18 : 0.06) + ')';
    ctx.beginPath();
    ctx.ellipse(view.x, view.y + s * 1.35, s * 1.3, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function frame() {
    if (!visible) { rafId = 0; return; }
    var now = Date.now();
    stepTwin(now);
    draw(now);
    rafId = window.requestAnimationFrame(frame);
  }

  function startLoop() {
    stopLoop();
    if (reduced) {
      draw(Date.now()); /* static pose, no loop */
      return;
    }
    rafId = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(rafId);
    }
    rafId = 0;
  }

  /* ---------- dashboard ---------- */

  function eventOptions() {
    var data = null;
    try { data = HACKBOARD_DATA; } catch (e) { data = null; }
    var out = [];
    if (!data || typeof data !== 'object') return out;
    var groups = [['open', 'open'], ['concluded', 'concluded']];
    for (var g = 0; g < groups.length; g++) {
      var list = data[groups[g][0]];
      if (!Array.isArray(list)) continue;
      for (var i = 0; i < list.length; i++) {
        var ev = list[i];
        if (!ev || !ev.id || !ev.name) continue;
        if (out.some(function (o) { return o.id === ev.id; })) continue;
        out.push({ id: String(ev.id), name: String(ev.name), status: groups[g][1] });
      }
    }
    return out;
  }

  function buildEmptyState() {
    var box = el('div', 'twin-empty');
    box.setAttribute('role', 'status');
    box.appendChild(el('h3', null, 'No twin yet'));
    box.appendChild(el('p', null,
      'Your koi hatches from the Twin Forge — a quick quiz about how you hack. ' +
      'Answer ten questions and your twin will swim out below.'));
    var link = el('a', 'twin-btn', 'Forge your twin first');
    link.href = '#forge';
    box.appendChild(link);
    return box;
  }

  function buildBadgesRow(p) {
    var row = el('div', 'twin-badges');
    var hue = p.hue === null ? 205 : p.hue;
    for (var i = 0; i < BADGES.length; i++) {
      var meta = BADGES[i];
      var earnedNow = p.badges.indexOf(meta.id) !== -1;
      var chip = el('span', 'twin-badge' + (earnedNow ? ' twin-badge-earned' : ''));
      chip.appendChild(document.createTextNode(meta.name));
      var desc = el('span', 'twin-badge-desc', meta.desc);
      chip.appendChild(desc);
      chip.title = meta.desc;
      if (earnedNow) chip.style.borderColor = 'hsl(' + hue + ',50%,45%)';
      row.appendChild(chip);
    }
    return row;
  }

  function buildHistoryList(p) {
    var list = el('ul', 'twin-history');
    if (!p.attendance.length) {
      var empty = el('li', null, 'No hackathons logged yet — your history will live here.');
      list.appendChild(empty);
      return list;
    }
    var newest = p.attendance.slice().reverse();
    for (var i = 0; i < newest.length; i++) {
      var e = newest[i];
      var li = el('li');
      var head = el('div', 'twin-history-head');
      head.appendChild(el('strong', null, e.eventName));
      if (e.prize !== 'none') head.appendChild(el('span', 'twin-prize-chip', e.prize === 'grand' ? 'grand prize' : 'track prize'));
      li.appendChild(head);
      var bits = [shortDate(e.ts)];
      if (e.built) bits.push('built: ' + e.built);
      if (isFiniteNumber(e.sleepHours)) bits.push('slept ' + e.sleepHours + 'h');
      if (e.wouldReturn === true) bits.push('would return: yes');
      else if (e.wouldReturn === false) bits.push('would return: no');
      li.appendChild(el('p', 'twin-history-meta', bits.join(' · ')));
      list.appendChild(li);
    }
    return list;
  }

  function buildForm(onSubmit) {
    var form = el('form', 'twin-form');
    form.setAttribute('novalidate', 'novalidate');
    var options = eventOptions();

    /* event picker */
    var fieldEvent = el('div', 'twin-field');
    var lblEvent = el('label', null, 'Hackathon you attended');
    lblEvent.htmlFor = 'twin-event-select';
    fieldEvent.appendChild(lblEvent);
    var select = el('select');
    select.id = 'twin-event-select';
    select.name = 'event';
    var placeholder = el('option', null, 'Choose an event…');
    placeholder.value = '';
    select.appendChild(placeholder);
    for (var i = 0; i < options.length; i++) {
      var opt = el('option', null, options[i].name + ' (' + options[i].status + ')');
      opt.value = options[i].id;
      select.appendChild(opt);
    }
    var other = el('option', null, 'Other (name it below)');
    other.value = '__other__';
    select.appendChild(other);
    fieldEvent.appendChild(select);
    var otherInput = el('input');
    otherInput.type = 'text';
    otherInput.id = 'twin-other-name';
    otherInput.name = 'otherName';
    otherInput.placeholder = 'Your hackathon\u2019s name';
    otherInput.hidden = true;
    otherInput.setAttribute('aria-label', 'Other hackathon name');
    fieldEvent.appendChild(otherInput);
    var errEvent = el('p', 'twin-field-error');
    errEvent.id = 'twin-error-event';
    fieldEvent.appendChild(errEvent);
    form.appendChild(fieldEvent);

    select.addEventListener('change', function () {
      otherInput.hidden = select.value !== '__other__';
      if (otherInput.hidden) otherInput.value = '';
    });

    /* what did you build */
    var fieldBuilt = el('div', 'twin-field');
    var lblBuilt = el('label', null, 'What did you build? (optional)');
    lblBuilt.htmlFor = 'twin-built';
    fieldBuilt.appendChild(lblBuilt);
    var built = el('input');
    built.type = 'text';
    built.id = 'twin-built';
    built.name = 'built';
    built.placeholder = 'The demo, in one line';
    fieldBuilt.appendChild(built);
    form.appendChild(fieldBuilt);

    /* prize + sleep */
    var row = el('div', 'twin-field-row');
    var fieldPrize = el('div', 'twin-field');
    var lblPrize = el('label', null, 'Prize');
    lblPrize.htmlFor = 'twin-prize';
    fieldPrize.appendChild(lblPrize);
    var prize = el('select');
    prize.id = 'twin-prize';
    prize.name = 'prize';
    var prizeOpts = [['none', 'No prize (just vibes)'], ['track', 'Track prize'], ['grand', 'Grand prize']];
    for (var k = 0; k < prizeOpts.length; k++) {
      var po = el('option', null, prizeOpts[k][1]);
      po.value = prizeOpts[k][0];
      prize.appendChild(po);
    }
    fieldPrize.appendChild(prize);
    row.appendChild(fieldPrize);

    var fieldSleep = el('div', 'twin-field');
    var lblSleep = el('label', null, 'Hours of sleep (be honest)');
    lblSleep.htmlFor = 'twin-sleep';
    fieldSleep.appendChild(lblSleep);
    var sleep = el('input');
    sleep.type = 'number';
    sleep.id = 'twin-sleep';
    sleep.name = 'sleepHours';
    sleep.min = '0';
    sleep.max = '24';
    sleep.step = '0.5';
    fieldSleep.appendChild(sleep);
    var errSleep = el('p', 'twin-field-error');
    errSleep.id = 'twin-error-sleep';
    fieldSleep.appendChild(errSleep);
    row.appendChild(fieldSleep);
    form.appendChild(row);

    /* would you return */
    var fieldReturn = el('div', 'twin-field');
    var legend = el('span', null, 'Would you return?');
    legend.id = 'twin-return-label';
    fieldReturn.appendChild(legend);
    var radioRow = el('div', 'twin-radio-row');
    radioRow.setAttribute('role', 'radiogroup');
    radioRow.setAttribute('aria-labelledby', 'twin-return-label');
    var yesRadio = el('input');
    yesRadio.type = 'radio';
    yesRadio.name = 'twin-return';
    yesRadio.value = 'yes';
    yesRadio.id = 'twin-return-yes';
    var yesLbl = el('label', null, 'Yes');
    yesLbl.htmlFor = 'twin-return-yes';
    var noRadio = el('input');
    noRadio.type = 'radio';
    noRadio.name = 'twin-return';
    noRadio.value = 'no';
    noRadio.id = 'twin-return-no';
    var noLbl = el('label', null, 'No');
    noLbl.htmlFor = 'twin-return-no';
    radioRow.appendChild(yesRadio); radioRow.appendChild(yesLbl);
    radioRow.appendChild(noRadio); radioRow.appendChild(noLbl);
    fieldReturn.appendChild(radioRow);
    var errReturn = el('p', 'twin-field-error');
    errReturn.id = 'twin-error-return';
    fieldReturn.appendChild(errReturn);
    form.appendChild(fieldReturn);

    var errForm = el('p', 'twin-field-error');
    errForm.id = 'twin-error-form';
    form.appendChild(errForm);

    var submit = el('button', 'twin-btn', 'Log it');
    submit.type = 'submit';
    submit.id = 'twin-submit';
    form.appendChild(submit);

    form.appendChild(el('p', 'twin-form-note',
      '+40 XP per log, +80 more for a prize, +10 for each new day of activity.'));

    form.addEventListener('submit', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      onSubmit(form, select, otherInput, built, prize, sleep, yesRadio, noRadio,
        errEvent, errSleep, errReturn, errForm);
    });

    return form;
  }

  function clearErrors(errs) {
    for (var i = 0; i < errs.length; i++) errs[i].textContent = '';
  }

  function handleLogSubmit(form, select, otherInput, built, prize, sleep, yesRadio, noRadio,
                           errEvent, errSleep, errReturn, errForm) {
    clearErrors([errEvent, errSleep, errReturn, errForm]);
    var valid = true;
    var eventName = '';
    var eventId = '';

    if (!select.value) {
      errEvent.textContent = 'Pick a hackathon — or name yours under Other.';
      valid = false;
    } else if (select.value === '__other__') {
      eventName = (otherInput.value || '').trim();
      eventId = '__other__';
      if (!eventName) {
        errEvent.textContent = 'Give your hackathon a name.';
        valid = false;
      }
    } else {
      eventId = select.value;
      var opts = eventOptions();
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].id === eventId) { eventName = opts[i].name; break; }
      }
      if (!eventName) { eventName = eventId; }
    }

    var sleepHours = null;
    if (sleep.value !== '') {
      var v = parseFloat(sleep.value, 10);
      if (!isFinite(v) || v < 0 || v > 24) {
        errSleep.textContent = 'Between 0 and 24 — realistically.';
        valid = false;
      } else {
        sleepHours = v;
      }
    }

    var wouldReturn = null;
    if (yesRadio.checked) wouldReturn = true;
    else if (noRadio.checked) wouldReturn = false;
    else {
      errReturn.textContent = 'Yes or no — it helps other builders.';
      valid = false;
    }

    if (!valid) return;

    var now = Date.now();
    var p = loadProfile();
    var entry = {
      eventId: eventId,
      eventName: eventName,
      ts: now,
      built: (built.value || '').trim().slice(0, 120),
      prize: prize.value === 'track' || prize.value === 'grand' ? prize.value : 'none',
      wouldReturn: wouldReturn,
      sleepHours: sleepHours
    };
    var res = applyLog(p, entry, now);
    persistProfile(p);

    var msg = 'Logged ' + eventName + ': +' + res.xpGained + ' XP.';
    if (res.leveledUp) msg += ' Level up — your twin is now a ' + levelNameFor(p.xp) + '.';
    if (res.newBadges.length) {
      var names = [];
      for (var b = 0; b < res.newBadges.length; b++) {
        var meta = badgeMeta(res.newBadges[b]);
        if (meta) names.push(meta.name);
      }
      if (names.length) msg += ' New badge: ' + names.join(', ') + '.';
    }
    announce(msg);
  }

  function buildDashboard() {
    var dash = el('div', 'twin-dashboard');

    var grid = el('div', 'twin-grid');
    var pondCard = el('div', 'twin-card twin-pond-card');
    pondCard.appendChild(el('h3', null, 'Your koi'));
    var canvas = el('canvas');
    canvas.className = 'twin-canvas';
    canvas.id = 'twin-canvas';
    canvas.setAttribute('role', 'img');
    canvas.width = 640;
    canvas.height = 280;
    pondCard.appendChild(canvas);
    var caption = el('p', 'twin-mood-caption');
    caption.id = 'twin-mood-caption';
    pondCard.appendChild(caption);
    grid.appendChild(pondCard);

    var statusCard = el('div', 'twin-card twin-status-card');
    statusCard.id = 'twin-status-card';
    var levelRow = el('div', 'twin-level-row');
    var levelName = el('p', 'twin-level-name');
    levelName.id = 'twin-level-name';
    levelRow.appendChild(levelName);
    var xpNote = el('p', 'twin-xp-note');
    xpNote.id = 'twin-xp-note';
    levelRow.appendChild(xpNote);
    statusCard.appendChild(levelRow);

    var bar = el('div', 'twin-xpbar');
    bar.id = 'twin-xpbar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    var fill = el('div', 'twin-xpbar-fill');
    fill.id = 'twin-xpbar-fill';
    bar.appendChild(fill);
    statusCard.appendChild(bar);
    var hint = el('p', 'twin-xp-hint');
    hint.id = 'twin-xp-hint';
    statusCard.appendChild(hint);

    var streak = el('p', 'twin-streak');
    streak.id = 'twin-streak';
    statusCard.appendChild(streak);
    statusCard.appendChild(el('p', 'twin-streak-sub',
      'Any XP-earning activity keeps the streak alive; a day of silence is fine, two is a lapse.'));
    statusCard.appendChild(el('h3', null, 'Badges'));
    var badgeRow = el('div', 'twin-badges');
    badgeRow.id = 'twin-badges-row';
    statusCard.appendChild(badgeRow);
    grid.appendChild(statusCard);
    dash.appendChild(grid);

    var surveyCard = el('div', 'twin-card twin-survey-card');
    surveyCard.id = 'twin-survey-card';
    surveyCard.appendChild(el('h3', null, 'Log a hackathon you attended'));
    surveyCard.appendChild(buildForm(handleLogSubmit));
    dash.appendChild(surveyCard);

    var historyCard = el('div', 'twin-card twin-history-card');
    historyCard.id = 'twin-history-card';
    historyCard.appendChild(el('h3', null, 'Attendance history'));
    var historyHolder = el('div');
    historyHolder.id = 'twin-history-holder';
    historyCard.appendChild(historyHolder);
    dash.appendChild(historyCard);

    dash.appendChild(el('p', 'twin-privacy',
      'Everything lives in this browser — nothing is uploaded. Clearing site data clears your twin.'));

    return { dash: dash, canvas: canvas, caption: caption, levelName: levelName,
             xpNote: xpNote, bar: bar, fill: fill, hint: hint, streak: streak, badgeRow: badgeRow,
             historyHolder: historyHolder };
  }

  function render() {
    if (!mount) return;
    var p = loadProfile();
    state.profile = p;

    clearNode(mount);

    if (!p.archetypeId) {
      canvasRef = null;
      ctx = null;
      mount.appendChild(buildEmptyState());
      return;
    }

    var refs = buildDashboard();
    mount.appendChild(refs.dash);
    canvasRef = refs.canvas;
    ctx = (typeof canvasRef.getContext === 'function') ? canvasRef.getContext('2d') : null;

    var prog = levelProgress(p.xp);
    var streakNow = currentStreak(p, Date.now());
    var mood = moodOf(p, Date.now());
    var hue = p.hue === null ? 205 : p.hue;

    refs.levelName.textContent = 'Level ' + (prog.index + 1) + ' · ' + prog.name;
    if (prog.next === null) {
      refs.xpNote.textContent = p.xp + ' XP · max level';
      refs.fill.style.width = '100%';
      refs.bar.setAttribute('aria-valuemax', String(p.xp));
      refs.bar.setAttribute('aria-valuenow', String(p.xp));
      refs.hint.textContent = 'Max level — the pond bows to you.';
    } else {
      refs.xpNote.textContent = p.xp + ' XP · ' + prog.toNext + ' to ' + LEVEL_NAMES[prog.index + 1];
      refs.fill.style.width = Math.round(prog.frac * 100) + '%';
      refs.bar.setAttribute('aria-valuemax', String(prog.next));
      refs.bar.setAttribute('aria-valuenow', String(p.xp));
      refs.hint.textContent = prog.next - p.xp + ' XP of ' + (prog.next - prog.base) +
        ' to level ' + (prog.index + 2) + ' (' + LEVEL_NAMES[prog.index + 1] + ').';
    }

    refs.streak.textContent = streakNow + '-day streak';
    refs.badgeRow.appendChild(buildBadgesRow(p));
    clearNode(refs.historyHolder);
    refs.historyHolder.appendChild(buildHistoryList(p));

    refs.caption.textContent = MOOD_COPY[mood] || MOOD_COPY.content;
    refs.canvas.setAttribute('aria-label',
      'Your koi twin, level ' + (prog.index + 1) + ' ' + prog.name + '. ' + (MOOD_COPY[mood] || ''));

    resize();
    view.x = clamp(view.x, 40, Math.max(40, W - 40)) || W * 0.5;
    view.y = clamp(view.y, 40, Math.max(40, H - 40)) || H * 0.5;
    view.targetX = W * 0.5;
    view.targetY = H * 0.5;
    if (reduced) draw(Date.now());
  }

  /* badge diff → shimmer pulse on the twin when something new lands */
  function diffBadges(p) {
    var fresh = [];
    for (var i = 0; i < p.badges.length; i++) {
      if (state.seenBadges.indexOf(p.badges[i]) === -1) fresh.push(p.badges[i]);
    }
    state.seenBadges = p.badges.slice();
    if (fresh.length && !reduced) {
      state.shimmerUntil = Date.now() + 6000;
    }
    return fresh;
  }

  /* ---------- init ---------- */

  function init() {
    section = document.getElementById('twin');
    if (!section) return; /* no-op until the lead's section exists */
    mount = document.getElementById('twin-mount');
    if (!mount) {
      mount = section.firstChild && section.querySelector ? section.querySelector('#twin-mount') : null;
    }
    if (!mount) return;

    injectStyles();
    palette = tokenPalette();
    reduced = prefersReducedMotion();

    /* one-time forge credit: archetype set, XP not yet credited */
    var p0 = loadProfile();
    var credit = applyForgeCredit(p0, Date.now());
    if (credit) {
      persistProfile(p0);
      var creditMsg = 'Forge complete: +' + credit.xpGained + ' XP. Your twin is swimming below.';
      if (credit.leveledUp) creditMsg += ' Level up — now a ' + levelNameFor(p0.xp) + '.';
      announce(creditMsg);
    }
    state.seenBadges = p0.badges.slice();

    render();

    /* re-render + shimmer when anything (quiz, survey, other tabs) writes */
    window.addEventListener(UPDATE_EVENT, function () {
      var fresh = diffBadges(loadProfile());
      render();
      if (fresh.length && !reduced) draw(Date.now());
    });

    /* theme flips redraw with fresh tokens */
    try {
      var themeObserver = new MutationObserver(function () {
        palette = tokenPalette();
        if (reduced || !visible) draw(Date.now());
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { /* no MutationObserver — theme redraw waits for next profile update */ }

    try {
      var io = new IntersectionObserver(function (entries) {
        var wasVisible = visible;
        visible = entries[0] && entries[0].isIntersecting;
        if (visible && !wasVisible) startLoop();
        if (!visible && wasVisible) stopLoop();
      }, { threshold: 0.05 });
      io.observe(section);
    } catch (e) { /* no observer support — just run */ }

    window.addEventListener('resize', function () {
      resize();
      if (reduced) draw(Date.now());
    });

    startLoop();
  }

  /* ---------- public surface (helpers consumed by the smoke harness and
   * available to sibling modules like oracle.js) ---------- */

  window.HackBoardTwin = {
    XP_VALUES: XP_VALUES,
    LEVEL_THRESHOLDS: LEVEL_THRESHOLDS,
    LEVEL_NAMES: LEVEL_NAMES,
    BADGES: BADGES,
    UPDATE_EVENT: UPDATE_EVENT,
    STORAGE_KEY: LS_KEY,
    levelFor: levelFor,
    levelNameFor: levelNameFor,
    levelProgress: levelProgress,
    currentStreak: currentStreak,
    moodOf: moodOf,
    evalBadges: evalBadges,
    applyLog: applyLog,
    applyForgeCredit: applyForgeCredit,
    normalizeProfile: normalizeProfile
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
