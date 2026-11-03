/* HackBoard — Koi Pond entrance: an animated canvas koi pond where clicking
 * a fish reveals one stay listing (from stays-data.js, STAYS_DATA).
 *
 * SUGGESTED HTML SNIPPET for the lead to wire into index.html (place the
 * script tag for koi.js after stays-data.js; koi.js injects its own styles,
 * so no custom.css change is required):
 *
 * <section id="koi-pond-section" aria-labelledby="koi-pond-heading">
 *   <h2 id="koi-pond-heading">Dip into the pond — every koi hides a stay</h2>
 *   <div class="koi-pond-stage">
 *     <canvas id="koi-pond-canvas" aria-hidden="true"></canvas>
 *     <button id="koi-reveal-btn" class="koi-reveal-btn" type="button">
 *       Reveal a listing
 *     </button>
 *   </div>
 *   <p id="koi-pond-live" class="koi-sr-only" role="status" aria-live="polite"></p>
 * </section>
 *
 * Behavior notes:
 *  - No-ops gracefully until #koi-pond-section exists (same pattern as
 *    media.js), so the file is safe to load before wiring.
 *  - Tries to reuse the stays detail modal if a hook is exposed
 *    (window.HackBoardStays.openModal); otherwise shows a self-contained
 *    expandable card with full listing details.
 *  - Colors read from design tokens at draw time (theme.js's html.dark /
 *    html.light), so light and dark themes both look right.
 *  - Prefers-reduced-motion: fish drift slowly, no darts or bursts.
 *  - Pauses via IntersectionObserver when off-screen; DPR-aware sizing.
 *  - Fully local: only listing image paths already in the repo.
 */

(function () {
  'use strict';

  /* ---------- config ---------- */

  var FISH_COUNT = 9;
  var CLICK_RADIUS = 34;      /* px of forgiveness around a fish for taps */
  var SCATTER_RADIUS = 110;   /* pointer proximity that nudges fish away */
  var POOL = ['teal', 'coral', 'amber', 'white'];

  /* ---------- shared helpers (media.js pattern) ---------- */

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
      water: cssVar('--surface-muted', isDark ? '#0d2a2e' : '#e6f4f2'),
      waterEdge: cssVar('--border-default', isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'),
      text: cssVar('--text-primary', isDark ? '#f4f1ea' : '#0f1a1a'),
      sub: cssVar('--text-secondary', isDark ? 'rgba(244,241,234,0.66)' : 'rgba(0,0,0,0.62)'),
      accent: cssVar('--border-focus', '#0f9e99'),
      teal: cssVar('--accent-teal', '#0f9e99'),
      coral: cssVar('--accent-coral', '#f2695c'),
      amber: cssVar('--accent-amber', '#f5a623'),
      white: '#f7f4ee'
    };
  }

  /* ---------- styles (injected; keeps custom.css untouched) ---------- */

  var STYLE_CSS = [
    '#koi-pond-section{max-width:1080px;margin:0 auto;padding:2.5rem 1.25rem;}',
    '#koi-pond-section h2{text-align:center;margin:0 0 1.25rem;}',
    '.koi-pond-stage{position:relative;border-radius:24px;overflow:hidden;',
    '  border:1px solid var(--border-default,rgba(0,0,0,0.08));',
    '  box-shadow:0 12px 40px rgba(0,0,0,0.12);}',
    '.koi-pond-stage canvas{display:block;width:100%;cursor:pointer;touch-action:manipulation;}',
    '.koi-reveal-btn{position:absolute;left:50%;bottom:1rem;transform:translateX(-50%);',
    '  padding:0.55rem 1.15rem;border-radius:999px;border:1px solid var(--border-default,rgba(0,0,0,0.12));',
    '  background:color-mix(in srgb,var(--surface-base,#fff) 88%,transparent);',
    '  color:var(--text-primary,#111);font:inherit;font-size:0.9rem;cursor:pointer;backdrop-filter:blur(6px);}',
    '.koi-reveal-btn:focus-visible{outline:2px solid var(--border-focus,#0f9e99);outline-offset:2px;}',
    '.koi-card{position:absolute;top:1rem;right:1rem;width:min(300px,calc(100% - 2rem));',
    '  border-radius:18px;overflow:hidden;background:var(--surface-base,#fff);',
    '  color:var(--text-primary,#111);border:1px solid var(--border-default,rgba(0,0,0,0.1));',
    '  box-shadow:0 16px 44px rgba(0,0,0,0.22);',
    '  animation:koi-card-in .35s cubic-bezier(.2,.9,.3,1.2);}',
    '@keyframes koi-card-in{from{opacity:0;transform:translateY(-8px) scale(.97);}to{opacity:1;transform:none;}}',
    '.koi-card img{width:100%;height:150px;object-fit:cover;display:block;}',
    '.koi-card-body{padding:0.85rem 1rem 1rem;}',
    '.koi-card-body h3{margin:0 0 0.2rem;font-size:1rem;line-height:1.3;}',
    '.koi-card-meta{margin:0 0 0.6rem;font-size:0.8rem;color:var(--text-secondary,rgba(0,0,0,0.6));}',
    '.koi-card-price{font-weight:700;font-size:0.95rem;margin:0 0 0.75rem;}',
    '.koi-card-actions{display:flex;gap:0.5rem;flex-wrap:wrap;}',
    '.koi-card-actions button{padding:0.45rem 0.9rem;border-radius:999px;font:inherit;font-size:0.82rem;cursor:pointer;',
    '  border:1px solid var(--border-default,rgba(0,0,0,0.14));background:transparent;color:inherit;}',
    '.koi-card-actions button.koi-primary{background:var(--accent-teal,#0f9e99);border-color:transparent;color:#fff;}',
    '.koi-card-actions button:focus-visible{outline:2px solid var(--border-focus,#0f9e99);outline-offset:2px;}',
    '.koi-card-extra{font-size:0.8rem;color:var(--text-secondary,rgba(0,0,0,0.62));margin:0.6rem 0 0;line-height:1.5;}',
    '.koi-card-close{position:absolute;top:0.5rem;right:0.5rem;width:1.9rem;height:1.9rem;border-radius:50%;',
    '  border:none;background:rgba(0,0,0,0.55);color:#fff;font-size:1rem;cursor:pointer;line-height:1;}',
    '.koi-sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}',
    '@media (prefers-reduced-motion:reduce){.koi-card{animation:none;}}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('koi-pond-styles')) return;
    var style = document.createElement('style');
    style.id = 'koi-pond-styles';
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
  }

  /* ---------- fish model ---------- */

  function rand(min, max) { return min + Math.random() * (max - min); }

  function makeFish(w, h, palette) {
    var colorKey = POOL[Math.floor(Math.random() * POOL.length)];
    return {
      x: rand(w * 0.1, w * 0.9),
      y: rand(h * 0.1, h * 0.9),
      angle: rand(0, Math.PI * 2),
      speed: rand(0.35, 0.8),
      size: rand(16, 30),
      colorKey: colorKey,
      color: palette[colorKey],
      patchAlpha: rand(0.25, 0.7),
      targetX: rand(w * 0.1, w * 0.9),
      targetY: rand(h * 0.1, h * 0.9),
      turnBoost: 0,
      tailPhase: rand(0, Math.PI * 2),
      tailSpeed: rand(0.09, 0.16),
      darting: 0
    };
  }

  /* ---------- pond module ---------- */

  function init() {
    var section = document.getElementById('koi-pond-section');
    if (!section) return; /* no-op until the lead wires the markup */

    var canvas = document.getElementById('koi-pond-canvas');
    var revealBtn = document.getElementById('koi-reveal-btn');
    var live = document.getElementById('koi-pond-live');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    injectStyles();

    var stays = (typeof STAYS_DATA !== 'undefined' && STAYS_DATA && Array.isArray(STAYS_DATA.stays))
      ? STAYS_DATA.stays.slice() : [];
    var palette = tokenPalette();
    var reduced = prefersReducedMotion();
    var visible = true;
    var ripples = [];
    var card = null;
    var pointer = { x: -1e4, y: -1e4 };
    var fishes = [];
    var W = 0, H = 0, dpr = 1;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.round(rect.width);
      H = Math.round(rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* keep fish inside after resize */
      fishes.forEach(function (f) {
        f.x = Math.min(Math.max(f.x, 10), W - 10);
        f.y = Math.min(Math.max(f.y, 10), H - 10);
        f.targetX = Math.min(f.targetX, W - 10);
        f.targetY = Math.min(f.targetY, H - 10);
      });
    }

    function newTarget(f) {
      f.targetX = rand(W * 0.08, W * 0.92);
      f.targetY = rand(H * 0.08, H * 0.92);
    }

    function seedFish() {
      fishes = [];
      for (var i = 0; i < FISH_COUNT; i++) fishes.push(makeFish(W || 600, H || 240, palette));
    }

    function addRipple(x, y, strength) {
      ripples.push({ x: x, y: y, r: 4, max: strength === 'burst' ? 46 : 26, alpha: strength === 'burst' ? 0.5 : 0.25 });
    }

    /* ---------- listing card ---------- */

    function pickListing() {
      if (!stays.length) return null;
      return stays[Math.floor(Math.random() * stays.length)];
    }

    function money(n) { return '$' + n.toLocaleString('en-US'); }

    function openStaysModal(id) {
      /* graceful reuse of the stays detail modal if a hook is exposed;
       * stays.js keeps openModal private today, so this usually no-ops. */
      try {
        if (window.HackBoardStays && typeof window.HackBoardStays.openModal === 'function') {
          window.HackBoardStays.openModal(id);
          return true;
        }
      } catch (e) { /* fall through to inline card */ }
      return false;
    }

    function renderCard(stay) {
      closeCard();
      card = document.createElement('div');
      card.className = 'koi-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-label', 'Revealed stay: ' + stay.name);

      var img = document.createElement('img');
      img.src = stay.images && stay.images.length ? stay.images[0] : '';
      img.alt = '';
      card.appendChild(img);

      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'koi-card-close';
      close.setAttribute('aria-label', 'Close listing card');
      close.textContent = '×';
      close.addEventListener('click', closeCard);
      card.appendChild(close);

      var body = document.createElement('div');
      body.className = 'koi-card-body';

      var h = document.createElement('h3');
      h.textContent = stay.name;
      body.appendChild(h);

      var meta = document.createElement('p');
      meta.className = 'koi-card-meta';
      meta.textContent = [stay.type, stay.hub].filter(Boolean).join(' · ');
      body.appendChild(meta);

      var price = document.createElement('p');
      price.className = 'koi-card-price';
      price.textContent = money(stay.pricePerNight) + ' / night · sleeps ' + stay.sleeps;
      body.appendChild(price);

      var actions = document.createElement('div');
      actions.className = 'koi-card-actions';
      var details = document.createElement('button');
      details.type = 'button';
      details.className = 'koi-primary';
      details.textContent = 'View full details';
      details.addEventListener('click', function () {
        if (openStaysModal(stay.id)) return;
        toggleExtra();
      });
      actions.appendChild(details);
      body.appendChild(actions);

      var extra = document.createElement('p');
      extra.className = 'koi-card-extra';
      extra.hidden = true;
      extra.textContent =
        '★ ' + stay.rating + ' (' + stay.reviews + ' reviews) · ' +
        stay.distanceKm + ' km from venue (' + stay.walkMinutes + ' min walk) · ' +
        'Amenities: ' + (stay.amenities || []).join(', ') + '. ' +
        'Available ' + stay.availableFrom + ' to ' + stay.availableTo + '. ' +
        (typeof STAYS_DATA !== 'undefined' && STAYS_DATA.disclaimer ? STAYS_DATA.disclaimer : '');
      body.appendChild(extra);

      card.appendChild(body);
      /* stage is position:relative; the card positions itself inside it */
      var stage = section.querySelector('.koi-pond-stage');
      if (stage) stage.appendChild(card);
      details.focus();
    }

    function toggleExtra() {
      if (!card) return;
      var extra = card.querySelector('.koi-card-extra');
      if (extra) extra.hidden = !extra.hidden;
    }

    function closeCard() {
      if (card && card.parentNode) card.parentNode.removeChild(card);
      card = null;
    }

    function revealFromPoint(x, y) {
      var stay = pickListing();
      addRipple(x, y, 'burst');
      if (!stay) {
        if (live) live.textContent = 'No stay listings available right now.';
        return;
      }
      renderCard(stay);
      if (live) live.textContent = 'Revealed listing: ' + stay.name + ', ' + stay.type + ' in ' + stay.hub + ', ' + money(stay.pricePerNight) + ' per night.';
    }

    function revealRandom() {
      revealFromPoint(rand(W * 0.25, W * 0.75), rand(H * 0.3, H * 0.7));
    }

    /* ---------- fish physics + drawing ---------- */

    function stepFish(f) {
      var speedMul = reduced ? 0.35 : 1;
      var dartBoost = f.darting > 0 ? 4.2 : 1;

      /* wander toward target */
      var dx = f.targetX - f.x, dy = f.targetY - f.y;
      if (Math.hypot(dx, dy) < 24) newTarget(f);
      var desired = Math.atan2(dy, dx);
      var diff = desired - f.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      var turn = diff * 0.045;
      f.angle += turn;
      if (Math.abs(diff) > 0.12 && !reduced && Math.random() < 0.02) {
        addRipple(f.x, f.y, 'soft');
      }

      /* pointer scatter: gentle steer away */
      var pdx = f.x - pointer.x, pdy = f.y - pointer.y;
      var pdist = Math.hypot(pdx, pdy);
      if (pdist < SCATTER_RADIUS && pdist > 0.001) {
        var away = Math.atan2(pdy, pdx);
        var adiff = away - f.angle;
        while (adiff > Math.PI) adiff -= Math.PI * 2;
        while (adiff < -Math.PI) adiff += Math.PI * 2;
        f.angle += adiff * 0.06 * (1 - pdist / SCATTER_RADIUS);
        if (pdist < SCATTER_RADIUS * 0.5 && f.darting <= 0 && !reduced) f.darting = 12;
      }

      if (f.darting > 0) f.darting--;

      f.tailPhase += f.tailSpeed * speedMul * (f.darting > 0 ? 2.2 : 1);
      var speed = f.speed * speedMul * dartBoost * (reduced ? 1 : 1);
      f.x += Math.cos(f.angle) * speed;
      f.y += Math.sin(f.angle) * speed;

      /* keep in bounds */
      if (f.x < 8 || f.x > W - 8 || f.y < 8 || f.y > H - 8) {
        f.x = Math.min(Math.max(f.x, 8), W - 8);
        f.y = Math.min(Math.max(f.y, 8), H - 8);
        newTarget(f);
      }
    }

    function drawFish(f, t) {
      var s = f.size;
      var wiggle = Math.sin(f.tailPhase) * 0.22;

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);

      /* curved spine: sample points from head to tail with sine offset */
      var segs = 7;
      /* body drawn as a tapered shape around the curved spine */
      var bodyW = s * 0.62;
      ctx.beginPath();
      for (var j = 0; j <= segs; j++) {
        var uu = j / segs;
        var bxx = (0.5 - uu) * s * 2.2;
        var spineY = Math.sin(f.tailPhase - uu * 2.4) * s * 0.34 * uu;
        var halfW = bodyW * Math.sin(Math.PI * (0.18 + 0.82 * uu) * 0.5 + 0.35) * (1 - uu * 0.7);
        if (j === 0) ctx.moveTo(bxx, spineY - halfW);
        else ctx.lineTo(bxx, spineY - halfW);
      }
      for (var k = segs; k >= 0; k--) {
        var u2 = k / segs;
        var bx2 = (0.5 - u2) * s * 2.2;
        var sy2 = Math.sin(f.tailPhase - u2 * 2.4) * s * 0.34 * u2;
        var hw2 = bodyW * Math.sin(Math.PI * (0.18 + 0.82 * u2) * 0.5 + 0.35) * (1 - u2 * 0.7);
        ctx.lineTo(bx2, sy2 + hw2);
      }
      ctx.closePath();

      /* body fill with soft gradient */
      var grad = ctx.createLinearGradient(s * 1.1, 0, -s * 1.1, 0);
      grad.addColorStop(0, f.color);
      grad.addColorStop(1, shade(f.color, f.colorKey === 'white' ? -18 : 24));
      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0,0,0,' + (palette.isDark ? 0.35 : 0.14) + ')';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fill();
      ctx.shadowColor = 'transparent';

      /* patches for koi look */
      if (f.colorKey !== 'white') {
        ctx.fillStyle = palette.isDark ? 'rgba(247,244,238,' + (f.patchAlpha * 0.5) + ')' : 'rgba(247,244,238,' + f.patchAlpha + ')';
        ctx.beginPath();
        ctx.ellipse(s * 0.35, -s * 0.06, s * 0.34, s * 0.2, 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-s * 0.3, s * 0.08, s * 0.26, s * 0.14, -0.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(242,105,92,' + f.patchAlpha + ')';
        ctx.beginPath();
        ctx.ellipse(s * 0.3, 0, s * 0.3, s * 0.18, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      /* tail fin */
      var tailX = -s * 1.1;
      var tailY = Math.sin(f.tailPhase - 2.4) * s * 0.34;
      ctx.fillStyle = withAlpha(f.color, 0.45);
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.quadraticCurveTo(tailX - s * 0.7, tailY - s * 0.4 + wiggle * s, tailX - s * 0.9, tailY - s * 0.15 + wiggle * s * 1.4);
      ctx.quadraticCurveTo(tailX - s * 0.6, tailY, tailX - s * 0.9, tailY + s * 0.15 + wiggle * s * 1.4);
      ctx.quadraticCurveTo(tailX - s * 0.7, tailY + s * 0.4 + wiggle * s, tailX, tailY);
      ctx.fill();

      /* pectoral fins */
      ctx.fillStyle = withAlpha(f.color, 0.35);
      ctx.beginPath();
      ctx.ellipse(s * 0.25, bodyW * 0.8, s * 0.3, s * 0.1, 0.6 + wiggle * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s * 0.25, -bodyW * 0.8, s * 0.3, s * 0.1, -0.6 - wiggle * 0.4, 0, Math.PI * 2);
      ctx.fill();

      /* subtle spine highlight */
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var m = 0; m <= segs; m++) {
        var u3 = m / segs;
        var px3 = (0.5 - u3) * s * 2.2;
        var py3 = Math.sin(f.tailPhase - u3 * 2.4) * s * 0.34 * u3;
        if (m === 0) ctx.moveTo(px3, py3); else ctx.lineTo(px3, py3);
      }
      ctx.stroke();

      ctx.restore();
    }

    function shade(hex, amt) {
      var c = hex.replace('#', '');
      if (c.length !== 6) return hex;
      var r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
      r = Math.min(255, Math.max(0, r + amt));
      g = Math.min(255, Math.max(0, g + amt));
      b = Math.min(255, Math.max(0, b + amt));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function withAlpha(hex, a) {
      var c = hex.replace('#', '');
      if (c.length !== 6) return hex;
      return 'rgba(' + parseInt(c.slice(0, 2), 16) + ',' + parseInt(c.slice(2, 4), 16) + ',' + parseInt(c.slice(4, 6), 16) + ',' + a + ')';
    }

    function drawRipples() {
      for (var i = ripples.length - 1; i >= 0; i--) {
        var r = ripples[i];
        r.r += r.max > 36 ? 2.4 : 0.9;
        r.alpha *= 0.94;
        if (r.alpha < 0.02 || r.r > r.max * 2) { ripples.splice(i, 1); continue; }
        ctx.strokeStyle = withAlpha('#ffffff', r.alpha * (palette.isDark ? 0.7 : 1));
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r, r.r * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = withAlpha('#ffffff', r.alpha * 0.5 * (palette.isDark ? 0.7 : 1));
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r * 0.6, r.r * 0.37, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function drawWater() {
      ctx.fillStyle = palette.water;
      ctx.fillRect(0, 0, W, H);
      /* soft lily-pad blobs for depth */
      ctx.fillStyle = palette.isDark ? 'rgba(15,158,153,0.08)' : 'rgba(15,158,153,0.07)';
      ctx.beginPath();
      ctx.ellipse(W * 0.18, H * 0.75, 60, 34, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(W * 0.82, H * 0.25, 74, 40, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    /* ---------- frame loop ---------- */

    function frame() {
      if (!visible) { rafId = 0; return; }
      drawWater();
      for (var i = 0; i < fishes.length; i++) { stepFish(fishes[i]); drawFish(fishes[i]); }
      drawRipples();
      rafId = requestAnimationFrame(frame);
    }

    var rafId = 0;
    var reducedTimer = 0;

    function startLoop() {
      stopLoop();
      if (reduced) {
        /* slow drift instead of full-rate animation */
        reducedTimer = window.setInterval(function () {
          if (!visible) return;
          drawWater();
          fishes.forEach(function (f) { stepFish(f); drawFish(f); });
          drawRipples();
        }, 90);
      } else {
        rafId = requestAnimationFrame(frame);
      }
    }

    function stopLoop() {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      if (reducedTimer) { clearInterval(reducedTimer); reducedTimer = 0; }
    }

    /* ---------- events ---------- */

    function toCanvasXY(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('pointermove', function (e) {
      var p = toCanvasXY(e);
      pointer.x = p.x; pointer.y = p.y;
    });
    canvas.addEventListener('pointerleave', function () {
      pointer.x = -1e4; pointer.y = -1e4;
    });

    canvas.addEventListener('click', function (e) {
      var p = toCanvasXY(e);
      /* topmost (last drawn = last in array) fish within radius wins */
      for (var i = fishes.length - 1; i >= 0; i--) {
        var f = fishes[i];
        if (Math.hypot(f.x - p.x, f.y - p.y) < CLICK_RADIUS + f.size * 0.5) {
          if (!reduced) f.darting = 26;
          newTarget(f); /* dart toward a far corner */
          f.targetX = f.x < W / 2 ? W * 0.9 : W * 0.1;
          f.targetY = f.y < H / 2 ? H * 0.9 : H * 0.1;
          revealFromPoint(p.x, p.y);
          return;
        }
      }
    });

    if (revealBtn) revealBtn.addEventListener('click', revealRandom);

    /* theme flips redraw with new tokens at draw time — nothing cached except fish colors */
    var themeObserver = new MutationObserver(function () {
      palette = tokenPalette();
      fishes.forEach(function (f) { f.color = palette[f.colorKey]; });
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    var io = new IntersectionObserver(function (entries) {
      var wasVisible = visible;
      visible = entries[0] && entries[0].isIntersecting;
      if (visible && !wasVisible) startLoop();
      if (!visible && wasVisible) stopLoop();
    }, { threshold: 0.05 });
    io.observe(section);

    window.addEventListener('resize', resize);

    /* ---------- boot ---------- */

    resize();
    if (!W || !H) { /* hidden or zero-size: retry once laid out */
      window.requestAnimationFrame(function () { resize(); seedFish(); startLoop(); });
    } else {
      seedFish();
      startLoop();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
