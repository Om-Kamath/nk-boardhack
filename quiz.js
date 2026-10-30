/* HackBoard — Twin Forge: the builder-archetype quiz that forges each
 * visitor's digital twin.
 *
 * Renders into section#forge (the lead's markup provides the heading; this
 * file fills #forge-mount). If #forge is absent, the module no-ops silently
 * like koi.js does — but the shared profile API below is always exposed,
 * because twin.js/oracle.js depend on it.
 *
 * Shared contract (other files depend on this):
 *   window.HackBoardForge = {
 *     getProfile(),                      -> parsed profile or null
 *     saveProfile(patch),                -> shallow-merge, persist, emit
 *     resetProfile(),                    -> remove key, emit
 *     ARCHETYPES                         -> [{ id, name, tagline, boostTags, hue, boosts }]
 *   }
 *   localStorage key: 'hackboard:twin:profile'
 *   window event on save/reset: 'hackboard:twin-updated' (detail.profile)
 *
 * Behavior notes:
 *  - Styles are injected at runtime (#forge-styles); custom.css is untouched.
 *  - One question at a time; radio groups; Enter advances; Back preserves
 *    answers; progress bar + "Question N of 10".
 *  - Completion saves { archetypeId, archetypeName, archetypeTagline,
 *    boostTags, hue, createdAt } and announces via #sr-announcer.
 *  - Reset uses an in-UI inline confirm — never window.confirm.
 *  - English-first; no data-i18n attributes in this batch.
 *
 * SUGGESTED SCRIPT TAG (already wired by the lead, after koi.js):
 *   <script src="quiz.js"></script>
 */

(function () {
  'use strict';

  var STORAGE_KEY = 'hackboard:twin:profile';
  var EVENT_NAME = 'hackboard:twin-updated';

  /* ---------- archetypes (hue picks koi color later; 0–360) ---------- */

  var ARCHETYPES = [
    {
      id: 'mission-metalhead',
      name: 'Mission Metalhead',
      tagline: 'You build for the cause — and the cause is not negotiable.',
      boostTags: ['climate', 'health', 'open-source'],
      hue: 165,
      boosts: 'What boosts you: impact tracks with teeth — climate, health, and open-source briefs where the fix outlives the weekend.'
    },
    {
      id: 'night-owl-shipwright',
      name: 'Night-Owl Shipwright',
      tagline: 'You ship at 3 a.m., and the boat holds.',
      boostTags: ['open-source', 'hardware', 'ml'],
      hue: 262,
      boosts: 'What boosts you: build-heavy tracks — hardware, devtools, open source — anywhere working beats flashy.'
    },
    {
      id: 'demo-day-showman',
      name: 'Demo-Day Showman',
      tagline: 'You live for the 90 seconds when the whole room leans in.',
      boostTags: ['ai-agents', 'ml', 'web3'],
      hue: 12,
      boosts: 'What boosts you: anything the judges can watch, gasp at, and replay — AI demos and slick web3 reveals love you back.'
    },
    {
      id: 'bounty-mercenary',
      name: 'Bounty Mercenary',
      tagline: 'You hunt prize pools the way other people chase sunsets.',
      boostTags: ['fintech', 'web3', 'ai-agents'],
      hue: 38,
      boosts: 'What boosts you: cash pools, sponsor bounties, and leaderboards with your name on them — sort the board by prize and go.'
    }
  ];

  function byId(id) {
    for (var i = 0; i < ARCHETYPES.length; i++) {
      if (ARCHETYPES[i].id === id) return ARCHETYPES[i];
    }
    return ARCHETYPES[0];
  }

  /* ---------- questions (each answer weights 1–2 archetypes) ---------- */

  var QUESTIONS = [
    {
      q: 'Hackathon kickoff is Friday night. Where are you?',
      options: [
        { text: 'Ranking every sponsor bounty by cash-per-hour.', weights: { 'bounty-mercenary': 2 } },
        { text: 'Writing the demo\u2019s opening line — judges love a cold open.', weights: { 'demo-day-showman': 2 } },
        { text: 'Re-reading the mission brief so the build actually matters.', weights: { 'mission-metalhead': 2 } },
        { text: 'Loading the 3 a.m. playlist and stacking snacks.', weights: { 'night-owl-shipwright': 2 } }
      ]
    },
    {
      q: 'Your demo crashes 4 minutes in. What\u2019s the move?',
      options: [
        { text: 'Flip it: \u201cAnd THIS is why the world needs our product.\u201d', weights: { 'demo-day-showman': 2 } },
        { text: 'Roll the backup video you cut at 4 a.m. — always be shipping.', weights: { 'night-owl-shipwright': 2 } },
        { text: 'Blame the WiFi, grin, and land the last feature slide.', weights: { 'bounty-mercenary': 1, 'demo-day-showman': 1 } }
      ]
    },
    {
      q: 'A sponsor says \u201cbuild something for us.\u201d You hear\u2026',
      options: [
        { text: '\u201cPrize money,\u201d and you\u2019re already at the table.', weights: { 'bounty-mercenary': 2 } },
        { text: '\u201cWho actually needs this?\u201d', weights: { 'mission-metalhead': 2 } },
        { text: '\u201cContent for the closing demo reel.\u201d', weights: { 'demo-day-showman': 1, 'night-owl-shipwright': 1 } }
      ]
    },
    {
      q: '3 a.m. Sunday. Honest status?',
      options: [
        { text: 'Shipping. This is the hour everything clicks.', weights: { 'night-owl-shipwright': 2 } },
        { text: 'Asleep on purpose — the stage needs a rested face.', weights: { 'demo-day-showman': 2 } },
        { text: 'Redrawing the leaderboard math with fresh eyes.', weights: { 'bounty-mercenary': 2 } }
      ]
    },
    {
      q: 'Which team job do you quietly take?',
      options: [
        { text: 'Intel — reading every past winner like scouting reports.', weights: { 'bounty-mercenary': 2 } },
        { text: 'Hype — rehearsing the pitch in the elevator mirror.', weights: { 'demo-day-showman': 2 } },
        { text: 'Conscience — keeping the build honest to the mission.', weights: { 'mission-metalhead': 1, 'night-owl-shipwright': 1 } }
      ]
    },
    {
      q: 'A win only counts if\u2026',
      options: [
        { text: 'the check clears and the badge lands on the r\u00e9sum\u00e9.', weights: { 'bounty-mercenary': 2 } },
        { text: 'a stranger says \u201cthis fixed my week.\u201d', weights: { 'mission-metalhead': 2 } },
        { text: 'the audience gasps on the clip.', weights: { 'demo-day-showman': 2 } }
      ]
    },
    {
      q: 'Pick your stack for the weekend.',
      options: [
        { text: 'Boring, battle-tested, ships by dawn.', weights: { 'night-owl-shipwright': 2 } },
        { text: 'The framework that dropped Tuesday — learn it live.', weights: { 'night-owl-shipwright': 1, 'demo-day-showman': 1 } },
        { text: 'Whatever the top sponsor track pays best.', weights: { 'bounty-mercenary': 2 } }
      ]
    },
    {
      q: 'It\u2019s over. Submission is in. You\u2026',
      options: [
        { text: 'Push it all to open source with a README worth reading.', weights: { 'mission-metalhead': 1, 'night-owl-shipwright': 1 } },
        { text: 'Post the demo everywhere before the results page loads.', weights: { 'demo-day-showman': 2 } },
        { text: 'Start the application for the next one. Streaks compound.', weights: { 'bounty-mercenary': 2 } }
      ]
    },
    {
      q: 'Cause or cash?',
      options: [
        { text: 'Both — find the event where the cause carries a prize pool.', weights: { 'bounty-mercenary': 1, 'mission-metalhead': 1 } },
        { text: 'Cause first. Cash is a nice side effect.', weights: { 'mission-metalhead': 2 } },
        { text: 'Cash first. The cause can sponsor me next time.', weights: { 'bounty-mercenary': 2 } }
      ]
    },
    {
      q: 'Finish the sentence: \u201cThe team I remember is the one that\u2026\u201d',
      options: [
        { text: 'cleared more bounties than anyone this season.', weights: { 'bounty-mercenary': 2 } },
        { text: 'built the thing people still open on Mondays.', weights: { 'mission-metalhead': 1, 'night-owl-shipwright': 1 } },
        { text: 'had that demo. THE demo.', weights: { 'demo-day-showman': 2 } }
      ]
    }
  ];

  /* ---------- pure scoring ---------- */

  /* Highest score wins; ties go to the archetype that scored in a LATER
   * question (its momentum is more recent). Exact dead heats fall back to
   * ARCHETYPES order. */
  function tally(answers) {
    var scores = {};
    var lastTouched = {};
    ARCHETYPES.forEach(function (a) {
      scores[a.id] = 0;
      lastTouched[a.id] = -1;
    });
    answers.forEach(function (optionIndex, qIndex) {
      if (optionIndex === undefined || optionIndex === null) return;
      var opt = QUESTIONS[qIndex] && QUESTIONS[qIndex].options[optionIndex];
      if (!opt || !opt.weights) return;
      for (var id in opt.weights) {
        if (!Object.prototype.hasOwnProperty.call(opt.weights, id)) continue;
        scores[id] = (scores[id] || 0) + opt.weights[id];
        lastTouched[id] = qIndex;
      }
    });
    var max = -1;
    ARCHETYPES.forEach(function (a) {
      if (scores[a.id] > max) max = scores[a.id];
    });
    var best = null;
    ARCHETYPES.forEach(function (a) {
      if (scores[a.id] !== max) return;
      if (!best || lastTouched[a.id] > lastTouched[best.id]) best = a;
    });
    return best;
  }

  /* ---------- profile API (shared contract) ---------- */

  function readProfile() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null; /* corrupted JSON or storage unavailable */
    }
  }

  function writeProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) { /* private mode / quota — profile stays session-only */ }
  }

  function dispatchTwinUpdated(profile) {
    try {
      var evt;
      if (typeof window.CustomEvent === 'function') {
        evt = new window.CustomEvent(EVENT_NAME, { detail: { profile: profile } });
      } else {
        evt = { type: EVENT_NAME, detail: { profile: profile } };
      }
      window.dispatchEvent(evt);
    } catch (e) { /* never let announcing break the save */ }
  }

  function saveProfile(patch) {
    var current = readProfile() || {};
    var next = {};
    var k;
    for (k in current) {
      if (Object.prototype.hasOwnProperty.call(current, k)) next[k] = current[k];
    }
    for (k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
    }
    writeProfile(next);
    dispatchTwinUpdated(next);
    return next;
  }

  function resetProfile() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* nothing to remove */ }
    dispatchTwinUpdated(null);
  }

  window.HackBoardForge = {
    getProfile: readProfile,
    saveProfile: saveProfile,
    resetProfile: resetProfile,
    ARCHETYPES: ARCHETYPES
  };

  /* ---------- tiny DOM helpers ---------- */

  function el(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function makeButton(className, text, onClick) {
    var btn = el('button', className);
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function announce(message) {
    var live = document.getElementById('sr-announcer');
    if (live) live.textContent = message;
  }

  /* ---------- styles (injected; custom.css untouched) ---------- */

  var STYLE_CSS = [
    '.forge-prior{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;',
    '  max-width:640px;margin:var(--space-4,1rem) auto 0;padding:.7rem 1rem;',
    '  border:1px solid var(--border-default,rgba(0,0,0,0.12));border-radius:var(--radius-md,12px);',
    '  background:var(--surface-muted,rgba(0,0,0,0.03));font-size:.9rem;color:var(--text-secondary,rgba(0,0,0,0.62));}',
    '.forge-prior strong{color:var(--text-primary,#111);}',
    '.forge-hue-dot{width:.8rem;height:.8rem;border-radius:50%;flex:none;',
    '  background:hsl(var(--forge-hue,168),72%,50%);}',
    '.forge-quiz{max-width:640px;margin:var(--space-5,1.25rem) auto 0;}',
    '.forge-progress{display:flex;justify-content:space-between;align-items:baseline;',
    '  margin:0 0 var(--space-2,0.5rem);font-size:.85rem;color:var(--text-secondary,rgba(0,0,0,0.62));}',
    '.forge-bar{height:6px;border-radius:999px;overflow:hidden;',
    '  background:var(--surface-muted,rgba(0,0,0,0.06));margin-bottom:var(--space-5,1.25rem);}',
    '.forge-bar-fill{height:100%;border-radius:999px;width:0;',
    '  background:var(--accent-teal,#0f9e99);transition:width .25s ease;}',
    '.forge-q{border:none;margin:0;padding:0;}',
    '.forge-q legend{font-size:1.15rem;font-weight:700;line-height:1.35;',
    '  margin:0 0 var(--space-3,0.75rem);padding:0;color:var(--text-primary,#111);}',
    '.forge-opt{display:flex;align-items:flex-start;gap:.6rem;padding:.7rem .9rem;margin-bottom:.5rem;',
    '  border:1px solid var(--border-default,rgba(0,0,0,0.12));border-radius:var(--radius-md,12px);',
    '  background:var(--surface-base,#fff);color:var(--text-primary,#111);cursor:pointer;',
    '  transition:border-color .15s ease,box-shadow .15s ease;}',
    '.forge-opt:hover{border-color:var(--border-focus,#0f9e99);}',
    '.forge-opt:focus-within{box-shadow:0 0 0 2px var(--border-focus,#0f9e99);}',
    '.forge-opt input{margin-top:.2rem;accent-color:var(--accent-teal,#0f9e99);flex:none;}',
    '.forge-opt-text{line-height:1.45;}',
    '.forge-nav{display:flex;justify-content:space-between;gap:var(--space-3,0.75rem);',
    '  margin-top:var(--space-4,1rem);}',
    '.forge-btn{padding:.55rem 1.15rem;border-radius:999px;font:inherit;font-size:.9rem;cursor:pointer;',
    '  border:1px solid var(--border-default,rgba(0,0,0,0.14));background:transparent;',
    '  color:var(--text-primary,#111);}',
    '.forge-btn-primary{background:var(--accent-teal,#0f9e99);border-color:transparent;color:#fff;}',
    '.forge-btn:disabled{opacity:.45;cursor:not-allowed;}',
    '.forge-btn:focus-visible{outline:2px solid var(--border-focus,#0f9e99);outline-offset:2px;}',
    '.forge-result{max-width:640px;margin:var(--space-5,1.25rem) auto 0;padding:var(--space-6,1.5rem);',
    '  text-align:center;border:1px solid var(--border-default,rgba(0,0,0,0.12));',
    '  border-radius:var(--radius-lg,20px);background:var(--surface-base,#fff);',
    '  box-shadow:var(--shadow-lifted-card,0 12px 40px rgba(0,0,0,0.12));}',
    '.forge-result h3{display:flex;align-items:center;justify-content:center;gap:.5rem;',
    '  margin:0 0 var(--space-2,0.5rem);font-size:1.5rem;color:var(--text-primary,#111);}',
    'html.dark .forge-result h3{color:hsl(var(--forge-hue,168),70%,66%);}',
    'html.light .forge-result h3{color:hsl(var(--forge-hue,168),65%,36%);}',
    '.forge-tagline{margin:0 0 var(--space-3,0.75rem);color:var(--text-secondary,rgba(0,0,0,0.62));}',
    '.forge-boosts{margin:0 0 var(--space-5,1.25rem);font-size:.92rem;line-height:1.5;}',
    '.forge-result-actions{display:flex;justify-content:center;align-items:center;gap:.6rem;flex-wrap:wrap;}',
    '.forge-confirm{display:inline-flex;align-items:center;gap:.5rem;flex-wrap:wrap;',
    '  font-size:.85rem;color:var(--text-secondary,rgba(0,0,0,0.62));}',
    '.forge-done{font-size:.95rem;color:var(--text-secondary,rgba(0,0,0,0.62));}'
  ].join('');

  function injectStyles() {
    if (document.getElementById('forge-styles')) return;
    var style = document.createElement('style');
    style.id = 'forge-styles';
    style.textContent = STYLE_CSS;
    document.head.appendChild(style);
  }

  /* ---------- quiz UI ---------- */

  var mountNode = null;

  function buildPriorStrip(profile) {
    var arch = byId(profile.archetypeId);
    var strip = el('p', 'forge-prior');
    strip.style.setProperty('--forge-hue', String(arch.hue));
    var dot = el('span', 'forge-hue-dot');
    dot.setAttribute('aria-hidden', 'true');
    strip.appendChild(dot);
    var text = el('span');
    text.textContent = 'Forged earlier: ';
    var strong = el('strong');
    strong.textContent = arch.name;
    text.appendChild(strong);
    text.appendChild(document.createTextNode(' — ' + arch.tagline + ' Retake below anytime.'));
    strip.appendChild(text);
    return strip;
  }

  function renderResult(box, archetype) {
    clearChildren(box);
    box.className = 'forge-result';
    box.style.setProperty('--forge-hue', String(archetype.hue));

    var heading = el('h3');
    heading.setAttribute('tabindex', '-1');
    var dot = el('span', 'forge-hue-dot');
    dot.setAttribute('aria-hidden', 'true');
    heading.appendChild(dot);
    heading.appendChild(document.createTextNode(archetype.name));
    box.appendChild(heading);

    var tagline = el('p', 'forge-tagline');
    tagline.textContent = archetype.tagline;
    box.appendChild(tagline);

    var boosts = el('p', 'forge-boosts');
    boosts.textContent = archetype.boosts;
    box.appendChild(boosts);

    var actions = el('div', 'forge-result-actions');
    actions.appendChild(makeButton('forge-btn forge-btn-primary', 'Retake', function () {
      renderInto(mountNode);
    }));

    var clearZone = el('span');
    actions.appendChild(clearZone);
    buildClearControl(clearZone, function () {
      renderInto(mountNode);
    });

    box.appendChild(actions);
    if (typeof heading.focus === 'function') heading.focus();
  }

  function buildClearControl(zone, onCleared) {
    function armConfirm() {
      clearChildren(zone);
      zone.className = 'forge-confirm';
      zone.appendChild(document.createTextNode('Wipe your twin from this browser?'));
      zone.appendChild(makeButton('forge-btn', 'Yes, clear it', function () {
        resetProfile();
        announce('Your twin was cleared from this browser.');
        if (onCleared) onCleared();
      }));
      zone.appendChild(makeButton('forge-btn', 'Keep it', function () {
        clearChildren(zone);
        zone.className = '';
        zone.appendChild(makeButton('forge-btn', 'Clear my twin', armConfirm));
      }));
    }
    zone.appendChild(makeButton('forge-btn', 'Clear my twin', armConfirm));
  }

  function buildQuiz() {
    var box = el('div', 'forge-quiz');
    var answers = [];
    var index = 0;

    var progressText = el('span', 'forge-progress-text');
    var progress = el('p', 'forge-progress');
    progress.setAttribute('role', 'status');
    progress.appendChild(progressText);

    var fill = el('div', 'forge-bar-fill');
    var bar = el('div', 'forge-bar');
    bar.appendChild(fill);

    var fieldset = document.createElement('fieldset');
    fieldset.className = 'forge-q';

    var form = document.createElement('form');
    form.className = 'forge-form';
    form.setAttribute('novalidate', 'novalidate');
    form.appendChild(fieldset);
    form.addEventListener('submit', function (e) {
      if (e && e.preventDefault) e.preventDefault();
    });
    form.addEventListener('keydown', function (e) {
      if (!e) return;
      var key = e.key !== undefined ? e.key : (e.keyCode === 13 ? 'Enter' : '');
      if (key !== 'Enter') return;
      if (e.preventDefault) e.preventDefault();
      if (answers[index] !== undefined && answers[index] !== null) advance();
    });

    var backBtn = makeButton('forge-btn', 'Back', function () {
      if (index > 0) {
        index--;
        renderQuestion(true);
      }
    });
    var nextBtn = makeButton('forge-btn forge-btn-primary', 'Next', advance);
    var nav = el('div', 'forge-nav');
    nav.appendChild(backBtn);
    nav.appendChild(nextBtn);

    box.appendChild(progress);
    box.appendChild(bar);
    box.appendChild(form);
    box.appendChild(nav);

    function renderQuestion(focusLegend) {
      var q = QUESTIONS[index];
      clearChildren(fieldset);

      var legend = document.createElement('legend');
      legend.textContent = q.q;
      legend.setAttribute('tabindex', '-1');
      fieldset.appendChild(legend);

      q.options.forEach(function (opt, optionIndex) {
        var label = el('label', 'forge-opt');
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = 'forge-answer';
        input.value = String(optionIndex);
        if (answers[index] === optionIndex) input.checked = true;
        input.addEventListener('change', function () {
          if (!input.checked) return;
          answers[index] = optionIndex;
          nextBtn.disabled = false;
        });
        var text = el('span', 'forge-opt-text');
        text.textContent = opt.text;
        label.appendChild(input);
        label.appendChild(text);
        fieldset.appendChild(label);
      });

      backBtn.disabled = index === 0;
      nextBtn.textContent = index === QUESTIONS.length - 1 ? 'See my twin' : 'Next';
      nextBtn.disabled = answers[index] === undefined || answers[index] === null;
      progressText.textContent = 'Question ' + (index + 1) + ' of ' + QUESTIONS.length + ' — pick one, move on.';
      fill.style.width = Math.round(((index + 1) / QUESTIONS.length) * 100) + '%';

      if (focusLegend && typeof legend.focus === 'function') legend.focus();
    }

    function advance() {
      if (answers[index] === undefined || answers[index] === null) return;
      if (index === QUESTIONS.length - 1) {
        complete();
        return;
      }
      index++;
      renderQuestion(true);
    }

    function complete() {
      var archetype = tally(answers);
      saveProfile({
        archetypeId: archetype.id,
        archetypeName: archetype.name,
        archetypeTagline: archetype.tagline,
        boostTags: archetype.boostTags.slice(),
        hue: archetype.hue,
        createdAt: Date.now()
      });
      announce('Your twin is forged: ' + archetype.name + '. ' + archetype.tagline);
      renderResult(box, archetype);
    }

    renderQuestion(false);
    return box;
  }

  function renderInto(mount) {
    if (!mount) return;
    clearChildren(mount);
    var prior = readProfile();
    if (prior && prior.archetypeId && byId(prior.archetypeId).id === prior.archetypeId) {
      mount.appendChild(buildPriorStrip(prior));
    }
    mount.appendChild(buildQuiz());
  }

  /* ---------- boot ---------- */

  function init() {
    var section = document.getElementById('forge');
    if (!section) return; /* no-op until the lead wires the markup */
    injectStyles();
    mountNode = document.getElementById('forge-mount') || section;
    renderInto(mountNode);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
