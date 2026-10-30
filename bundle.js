/* Builder Toolkit — batch 1 of the 50-feature expansion. Eighteen small,
 * real, client-side features that make HackBoard feel like a place you
 * keep coming back to:
 *
 *   1  Idea generator           (track × user × twist)
 *   2  Team-name generator
 *   3  Judge's verdict          (fun heuristic idea scorer)
 *   4  Demo-day checklist generator
 *   5  Pomodoro build timer     (25/5, WebAudio beep, sound toggle)
 *   6  Pitch rehearsal timer    (90 s, warns at 80)
 *   7  Builder streak tracker   (localStorage)
 *   8  Achievement badges       (localStorage)
 *   9  Weekly digest export     (.md from HACKBOARD_DATA)
 *  10  Event data export        (.json)
 *  11  Event data export        (.csv)
 *  12  Event roulette           ("surprise me" from open events)
 *  13  Time-value calculator    (prize ÷ team hours)
 *  14  Keyboard shortcut        ( / focuses the first filter input)
 *  15  Font-size control        (S / M / L, persists)
 *  16  Reduced-motion toggle    (persists)
 *  17  High-contrast toggle     (persists)
 *  18  Konami easter egg        (Judge mode overlay)
 *
 * Everything is local: prefs in localStorage, exports as Blob downloads,
 * sounds synthesized with WebAudio. No network calls, no uploads. */

(function () {
  "use strict";

  const DATA = window.HACKBOARD_DATA || {};
  const EVENTS = DATA.events || DATA.openEvents || [];
  const store = {
    get: function (k, d) { try { const v = localStorage.getItem("hb-" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("hb-" + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };

  const pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  const $ = function (id) { return document.getElementById(id); };

  function download(name, text, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime || "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function beep(freq, ms) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + ms / 1000);
      setTimeout(function () { ctx.close(); }, ms + 100);
    } catch (e) { /* audio blocked; silence is fine */ }
  }
  function soundOn() { return store.get("sound", true); }

  /* ---------- 1-3: idea generator, team names, judge's verdict ---------- */

  const TRACKS = ["AI agents", "on-chain payments", "climate data", "dev tooling", "healthcare records", "logistics", "accessibility", "security ops"];
  const USERS = ["nurses on night shift", "solo accountants", "warehouse leads", "small-landlord operators", "high-school counselors", "freight dispatchers", "librarians", "gym owners"];
  const TWISTS = ["runs entirely offline", "explains every decision it makes", "works over SMS", "costs less than lunch to run", "works with a flip-phone camera", "audits itself nightly", "survives zero connectivity", "trains on the user's own notes"];

  function generateIdea() {
    const idea = pick(TRACKS) + " for " + pick(USERS) + " that " + pick(TWISTS);
    const out = $("idea-out");
    if (out) out.innerHTML = '<p class="tool-idea">💡 ' + idea + '</p>' +
      '<div class="vid-actions"><button class="btn btn-secondary" id="idea-again">🎲 Another</button>' +
      '<button class="btn btn-primary" id="idea-judge">🧑‍⚖️ Judge it</button></div>';
    unlock("ideas");
    const again = $("idea-again"), judge = $("idea-judge");
    if (again) again.addEventListener("click", generateIdea);
    if (judge) judge.addEventListener("click", function () { judgeIdea(idea); });
  }

  function judgeIdea(idea) {
    const out = $("idea-out");
    if (!out) return;
    /* honest heuristic: hash the text, map to a score band, pick a matching note.
     * It's a smile, not an evaluation. */
    let h = 0;
    for (let i = 0; i < idea.length; i++) h = (h * 31 + idea.charCodeAt(i)) >>> 0;
    const score = 6 + (h % 5); /* 6–10, because every idea deserves a chance */
    const notes = [
      "Clean wedge, clear user. I'd want to see the Monday-morning version.",
      "The constraint is the feature. Keep it that way and demo it live.",
      "Strong track signal. Your real competition is the team that ships the boring version first.",
      "I've seen this fail twice — both skipped the 'who pays' slide. Don't.",
      "Genuinely unclonable if the offline mode is real. Prove that part first."
    ];
    const verdict = pick(notes);
    out.insertAdjacentHTML("beforeend",
      '<div class="judge-verdict"><strong>Score: ' + score + '/10</strong><p>' + verdict + '</p></div>');
    unlock("judged");
  }

  function generateTeamName() {
    const adj = ["Quantum", "Rusty", "Midnight", "Velvet", "Fault-Tolerant", "Caffeinated", "Recursive", "Ninety-Second", "Offline-First", "Screaming"];
    const noun = ["Cacti", "Compilers", "Pigeons", "Bureaucrats", "Minifiers", "Trash Pandas", "Semaphores", "Night Owls", "Rubber Ducks", "Llamas"];
    const out = $("teamname-out");
    if (out) out.innerHTML = '<p class="tool-idea">🚀 Team <strong>' + pick(adj) + " " + pick(noun) + "</strong></p>";
  }

  /* ---------- 4: demo-day checklist ---------- */

  const CHECKS = [
    "Ship a 60-second demo you can restart mid-sentence",
    "One number you can defend to the decimal",
    "Repo public, README with a GIF, license file present",
    "Backup: screen recording on a second device",
    "Dongle, charger, and a plan B when the venue Wi-Fi dies",
    "Name the judges' sponsors in the first 30 seconds",
    "Rehearse the ask out loud, twice, to a human",
    "Sleep. Seriously — schedule it."
  ];
  function generateChecklist() {
    const shuffled = CHECKS.slice().sort(function () { return Math.random() - 0.5; }).slice(0, 6);
    const out = $("checklist-out");
    if (out) out.innerHTML = '<ul class="tool-checklist">' +
      shuffled.map(function (c) { return "<li>" + c + "</li>"; }).join("") + "</ul>";
  }

  /* ---------- 5: pomodoro ---------- */

  let pomo = { running: false, phase: "build", left: 25 * 60, timer: null };
  function pomoRender() {
    const el = $("pomo-display");
    if (!el) return;
    const m = Math.floor(pomo.left / 60), s = pomo.left % 60;
    el.textContent = (pomo.phase === "build" ? "🔨 Build " : "☕ Break ") + m + ":" + String(s).padStart(2, "0");
  }
  function pomoTick() {
    pomo.left -= 1;
    if (pomo.left <= 0) {
      if (soundOn()) beep(pomo.phase === "build" ? 880 : 660, 400);
      pomo.phase = pomo.phase === "build" ? "break" : "build";
      pomo.left = (pomo.phase === "build" ? 25 : 5) * 60;
      unlock("finished-pomodoro");
    }
    pomoRender();
  }
  function pomoToggle() {
    pomo.running = !pomo.running;
    if (pomo.running) { pomo.timer = setInterval(pomoTick, 1000); unlock("pomodoro"); }
    else clearInterval(pomo.timer);
    const btn = $("pomo-toggle");
    if (btn) btn.textContent = pomo.running ? "⏸ Pause" : "▶ Start";
  }
  function pomoReset() {
    clearInterval(pomo.timer);
    pomo = { running: false, phase: "build", left: 25 * 60, timer: null };
    pomoRender();
    const btn = $("pomo-toggle");
    if (btn) btn.textContent = "▶ Start";
  }

  /* ---------- 6: pitch rehearsal timer ---------- */

  let pitchT = { left: 90, timer: null, warned: false };
  function pitchRender() {
    const el = $("pitchtimer-display");
    if (el) el.textContent = "🎤 " + pitchT.left + "s left";
  }
  function pitchTick() {
    pitchT.left -= 1;
    if (pitchT.left === 10 && !pitchT.warned) {
      pitchT.warned = true;
      if (soundOn()) beep(523, 300);
      const el = $("pitchtimer-display");
      if (el) el.textContent = "🎤 10s — land the ask!";
    } else pitchRender();
    if (pitchT.left <= 0) {
      clearInterval(pitchT.timer);
      if (soundOn()) beep(392, 600);
      unlock("pitch-done");
    }
  }
  function pitchStart() {
    clearInterval(pitchT.timer);
    pitchT = { left: 90, timer: null, warned: false };
    pitchT.timer = setInterval(pitchTick, 1000);
  }

  /* ---------- 7-8: streaks and achievements ---------- */

  const BADGES = {
    "ideas": ["💡", "First idea generated"],
    "judged": ["🧑‍⚖️", "Survived the judge"],
    "pomodoro": ["🍅", "Started a build sprint"],
    "finished-pomodoro": ["⏱", "Finished a full pomodoro"],
    "pitch-done": ["🎤", "Rehearsed a full pitch"],
    "exported": ["📦", "Exported HackBoard data"],
    "roulette": ["🎰", "Let fate pick an event"],
    "konami": ["🕹", "Found judge mode"]
  };
  function unlock(key) {
    const got = store.get("badges", {});
    if (!got[key]) { got[key] = true; store.set("badges", got); }
    renderBadges();
  }
  function renderBadges() {
    const el = $("badge-strip");
    if (!el) return;
    const got = store.get("badges", {});
    el.innerHTML = Object.keys(BADGES).map(function (k) {
      const on = !!got[k];
      return '<span class="tool-badge' + (on ? " earned" : "") + '" title="' + BADGES[k][1] + '">' + BADGES[k][0] + "</span>";
    }).join("");
  }
  function streakTick() {
    const today = new Date().toDateString();
    const s = store.get("streak", { last: null, count: 0 });
    if (s.last !== today) {
      const y = new Date(Date.now() - 86400000).toDateString();
      s.count = s.last === y ? s.count + 1 : 1;
      s.last = today;
      store.set("streak", s);
    }
    const el = $("streak-chip");
    if (el) el.textContent = "🔥 " + s.count + "-day streak" + (s.count >= 3 ? " — you're on a roll" : "");
  }

  /* ---------- 9-11: exports ---------- */

  function exportDigest() {
    const news = (DATA.news || []).map(function (n) { return "- **" + n.date + "** — " + n.text; }).join("\n");
    const winners = (DATA.winners || []).map(function (w) { return "- **" + w.title + "** (" + w.event + "): " + w.detail; }).join("\n");
    download("hackboard-digest.md",
      "# HackBoard weekly digest\n\n## News\n\n" + news + "\n\n## Winners to study\n\n" + winners + "\n",
      "text/markdown");
    unlock("exported");
  }
  function exportJSON() {
    download("hackboard-data.json", JSON.stringify(DATA, null, 2), "application/json");
    unlock("exported");
  }
  function exportCSV() {
    const rows = EVENTS.slice();
    const keys = rows.length ? Object.keys(rows[0]) : ["id"];
    const esc = function (v) { return '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"'; };
    const csv = [keys.map(esc).join(",")].concat(rows.map(function (r) {
      return keys.map(function (k) { return esc(r[k]); }).join(",");
    })).join("\r\n");
    download("hackboard-events.csv", csv, "text/csv");
    unlock("exported");
  }

  /* ---------- 12: roulette ---------- */

  function roulette() {
    const out = $("roulette-out");
    if (!out) return;
    if (!EVENTS.length) {
      out.innerHTML = '<p class="text-muted">Event data isn\'t loaded — the roulette is out of order today.</p>';
      return;
    }
    const e = pick(EVENTS);
    const name = e.name || e.title || e.id;
    const url = e.url || e.link || "";
    const when = e.deadline || e.date || "";
    out.innerHTML = '<p class="tool-idea">🎰 <strong>' + name + "</strong>" +
      (when ? " · " + when : "") + (url ? ' · <a href="' + url + '" target="_blank" rel="noopener">register</a>' : "") + "</p>";
    unlock("roulette");
  }

  /* ---------- 13: time-value calculator ---------- */

  function calcTimeValue() {
    const prize = parseFloat($("tv-prize") && $("tv-prize").value) || 0;
    const hours = parseFloat($("tv-hours") && $("tv-hours").value) || 0;
    const team = parseFloat($("tv-team") && $("tv-team").value) || 1;
    const out = $("tv-out");
    if (!out) return;
    if (!prize || !hours) { out.innerHTML = '<p class="text-muted">Fill both fields — prize pool and hours per person.</p>'; return; }
    const perHour = prize / (hours * team);
    const honest = perHour < 15;
    out.innerHTML = '<p class="tool-idea">💵 <strong>$' + perHour.toFixed(2) + '</strong> per person-hour' +
      (honest ? ' — below $15/hr. Fine for love of the game, bad as a job.' : ' — a real rate. Build it.') + "</p>";
  }

  /* ---------- 14-17: prefs and shortcuts ---------- */

  function focusSearch() {
    const input = document.querySelector('#hackathons input[type="search"], #hackathons input[type="text"], #event-grid ~ * input');
    if (input) { input.focus(); input.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  function setFont(size) {
    document.documentElement.classList.remove("font-sm", "font-md", "font-lg");
    document.documentElement.classList.add("font-" + size);
    store.set("font", size);
    syncPrefButtons();
  }
  function setMotion(on) {
    document.documentElement.classList.toggle("reduced-motion", on);
    store.set("reduced-motion", on);
    syncPrefButtons();
  }
  function setContrast(on) {
    document.documentElement.classList.toggle("high-contrast", on);
    store.set("high-contrast", on);
    syncPrefButtons();
  }
  function syncPrefButtons() {
    [["font-sm", "font-sm"], ["font-md", "font-md"], ["font-lg", "font-lg"]].forEach(function (p) {
      const b = $(p[0]); if (b) b.classList.toggle("active", document.documentElement.classList.contains(p[1]));
    });
    const rm = $("pref-motion"), hc = $("pref-contrast");
    if (rm) rm.classList.toggle("active", document.documentElement.classList.contains("reduced-motion"));
    if (hc) hc.classList.toggle("active", document.documentElement.classList.contains("high-contrast"));
  }

  /* ---------- 18: konami ---------- */

  const KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  let kIdx = 0;
  function konami(e) {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    kIdx = key === KONAMI[kIdx] ? kIdx + 1 : (key === KONAMI[0] ? 1 : 0);
    if (kIdx === KONAMI.length) {
      kIdx = 0;
      unlock("konami");
      judgeMode();
    }
  }
  function judgeMode() {
    let overlay = document.getElementById("judge-overlay");
    if (overlay) { overlay.remove(); return; }
    overlay = document.createElement("div");
    overlay.id = "judge-overlay";
    overlay.innerHTML = '<div class="judge-overlay-card"><h3>🧑‍⚖️ Judge mode unlocked</h3>' +
      '<p>You found the code. The judges are watching — slightly more proudly now.</p>' +
      '<button class="btn btn-primary" id="judge-close">Back to building</button></div>';
    document.body.appendChild(overlay);
    $("judge-close").addEventListener("click", function () { overlay.remove(); });
  }

  /* ---------- boot ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    /* restore prefs */
    const f = store.get("font", "md"); document.documentElement.classList.add("font-" + f);
    if (store.get("reduced-motion", false)) document.documentElement.classList.add("reduced-motion");
    if (store.get("high-contrast", false)) document.documentElement.classList.add("high-contrast");

    /* idea + team + checklist */
    if ($("idea-gen")) $("idea-gen").addEventListener("click", generateIdea);
    if ($("teamname-gen")) $("teamname-gen").addEventListener("click", generateTeamName);
    if ($("checklist-gen")) $("checklist-gen").addEventListener("click", generateChecklist);

    /* timers */
    if ($("pomo-toggle")) $("pomo-toggle").addEventListener("click", pomoToggle);
    if ($("pomo-reset")) $("pomo-reset").addEventListener("click", pomoReset);
    pomoRender();
    if ($("pitchtimer-start")) $("pitchtimer-start").addEventListener("click", pitchStart);
    pitchRender();

    /* exports + roulette + calculator */
    if ($("export-md")) $("export-md").addEventListener("click", exportDigest);
    if ($("export-json")) $("export-json").addEventListener("click", exportJSON);
    if ($("export-csv")) $("export-csv").addEventListener("click", exportCSV);
    if ($("roulette-btn")) $("roulette-btn").addEventListener("click", roulette);
    if ($("tv-calc")) $("tv-calc").addEventListener("click", calcTimeValue);

    /* prefs */
    ["font-sm", "font-md", "font-lg"].forEach(function (id) {
      const b = $(id); if (b) b.addEventListener("click", function () { setFont(id.slice(5)); });
    });
    if ($("pref-motion")) $("pref-motion").addEventListener("click", function () { setMotion(!document.documentElement.classList.contains("reduced-motion")); });
    if ($("pref-contrast")) $("pref-contrast").addEventListener("click", function () { setContrast(!document.documentElement.classList.contains("high-contrast")); });
    syncPrefButtons();

    /* keyboard */
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); focusSearch(); }
    });
    document.addEventListener("keydown", konami);

    streakTick();
    renderBadges();
  });
})();
