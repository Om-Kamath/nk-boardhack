/* HackBoard app logic — board rendering, filters, countdowns, winners.
 * Batch 2 adds: sort + prize-range controls, persisted prefs, watchlist,
 * compare view, calendar, .ics export, reminders, team board, share/copy,
 * ticking countdowns, richer empty state, and screen-reader announcements.
 * Depends on data.js (HACKBOARD_DATA, countdownLabel, daysLeft). */

(function () {
  "use strict";

  const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  function fmtDate(iso) {
    return DATE_FMT.format(new Date(iso + "T00:00:00Z"));
  }

  function fmtRange(startIso, deadlineIso) {
    const start = fmtDate(startIso);
    const end = fmtDate(deadlineIso);
    return start === end ? end : start + "–" + end;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function store(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
  }
  function saveStore(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked — stays per-session */ }
  }

  /* ---------- Screen-reader announcements ---------- */

  function announce(msg) {
    const el = document.getElementById("sr-announcer");
    if (el) { el.textContent = ""; setTimeout(function () { el.textContent = msg; }, 30); }
  }

  /* ---------- Toast ---------- */

  let toastTimer = null;
  function toast(msg) {
    let t = document.getElementById("hb-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "hb-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------- RSVP — “going or not, with who”, saved on this device ---------- */

  const RSVP_KEY = "hackboard:rsvp:v1";

  function loadRsvp() {
    return store(RSVP_KEY, {});
  }

  function saveRsvp(d) {
    saveStore(RSVP_KEY, d);
  }

  function rsvpFor(id) {
    const d = loadRsvp()[id];
    return { going: d ? d.going || null : null, crew: d && d.crew ? d.crew : [] };
  }

  function rsvpRow(ev) {
    const r = rsvpFor(ev.id);
    const crew = r.crew.map(function (n, i) {
      return '<span class="crew-chip">' + escapeHtml(n) +
        '<button class="crew-x" data-ev="' + ev.id + '" data-idx="' + i + '" aria-label="Remove ' + escapeHtml(n) + '">×</button></span>';
    }).join("");
    return (
      '<div class="rsvp-row" data-ev="' + ev.id + '">' +
        '<button class="rsvp-btn rsvp-going' + (r.going === true ? " active" : "") + '">🎉 Going</button>' +
        '<button class="rsvp-btn rsvp-not' + (r.going === false ? " active" : "") + '">Can\'t go</button>' +
        '<span class="crew-add"><input class="input crew-input" type="text" placeholder="Add a friend…" maxlength="24" data-ev="' + ev.id + '">' +
        '<button class="btn btn-ghost btn-sm crew-add-btn" data-ev="' + ev.id + '">+ Add</button></span>' +
        (crew ? '<span class="crew-list">' + crew + '</span>' : "") +
      '</div>'
    );
  }

  function wireRsvp(card, ev) {
    const row = card.querySelector(".rsvp-row");
    if (!row) return;
    row.querySelector(".rsvp-going").addEventListener("click", function () {
      const d = loadRsvp(); const cur = d[ev.id] || {};
      const turningOn = cur.going !== true;
      d[ev.id] = { going: turningOn ? true : null, crew: cur.crew || [] };
      saveRsvp(d); renderEvents();
      if (turningOn && window.HackBoardCelebrate) window.HackBoardCelebrate();
    });
    row.querySelector(".rsvp-not").addEventListener("click", function () {
      const d = loadRsvp(); const cur = d[ev.id] || {};
      d[ev.id] = { going: cur.going === false ? null : false, crew: cur.crew || [] };
      saveRsvp(d); renderEvents();
    });
    const add = function () {
      const inp = row.querySelector(".crew-input");
      const name = inp.value.trim();
      if (!name) return;
      const d = loadRsvp(); const cur = d[ev.id] || {};
      d[ev.id] = { going: cur.going || null, crew: (cur.crew || []).concat([name]).slice(0, 12) };
      saveRsvp(d); renderEvents();
    };
    row.querySelector(".crew-add-btn").addEventListener("click", add);
    row.querySelector(".crew-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
    row.querySelectorAll(".crew-x").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const d = loadRsvp(); const cur = d[ev.id] || {};
        (cur.crew || []).splice(Number(btn.dataset.idx), 1);
        d[ev.id] = { going: cur.going || null, crew: cur.crew || [] };
        saveRsvp(d); renderEvents();
      });
    });
  }

  /* ---------- Watchlist (star + note, per device) ---------- */

  const WATCH_KEY = "hackboard:watch:v1";

  function watchFor(id) {
    const d = store(WATCH_KEY, {})[id];
    return { starred: !!(d && d.starred), note: d ? d.note || "" : "" };
  }

  function setWatch(id, patch) {
    const d = store(WATCH_KEY, {});
    const cur = d[id] || { starred: false, note: "" };
    d[id] = Object.assign(cur, patch);
    if (!d[id].starred && !d[id].note) delete d[id];
    saveStore(WATCH_KEY, d);
  }

  /* ---------- Compare selection ---------- */

  const compareSet = [];

  /* ---------- Prize parsing (display strings → comparable numbers) ---------- */

  function prizeValue(ev) {
    const m = String(ev.prize).match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k|K|m|M)?/);
    if (!m) return 0;
    let n = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(n)) return 0;
    if (m[2] === "k" || m[2] === "K") n *= 1e3;
    if (m[2] === "m" || m[2] === "M") n *= 1e6;
    return n;
  }

  /* ---------- Exports: .ics, share, copy ---------- */

  function icsFor(ev) {
    const pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    const dt = function (iso) { return iso.replace(/-/g, ""); };
    const endD = new Date(ev.deadline + "T00:00:00Z");
    endD.setUTCDate(endD.getUTCDate() + 1);
    const endIso = endD.toISOString().slice(0, 10);
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HackBoard//EN",
      "BEGIN:VEVENT",
      "UID:" + ev.id + "@hackboard.local",
      "DTSTAMP:" + dt(new Date().toISOString().slice(0, 10)) + "T000000Z",
      "DTSTART;VALUE=DATE:" + dt(ev.dates),
      "DTEND;VALUE=DATE:" + dt(endIso),
      "SUMMARY:" + ev.name.replace(/[,;\\]/g, " "),
      "DESCRIPTION:" + String(ev.blurb).replace(/[,;\\]/g, " ").slice(0, 160),
      "URL:" + ev.url,
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
  }

  function downloadFile(name, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function summaryText(ev) {
    return ev.name + " — " + (ev.location || "Online") + " · " + fmtRange(ev.dates, ev.deadline) +
      " · " + ev.prize + " · " + ev.url;
  }

  function shareEvent(ev) {
    if (navigator.share) {
      navigator.share({ title: ev.name, text: summaryText(ev), url: ev.url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(summaryText(ev)).then(function () { toast("Summary copied — share link anywhere."); });
    } else {
      toast("Sharing not supported in this browser.");
    }
  }

  /* ---------- Event cards ---------- */

  function eventCard(ev, opts) {
    opts = opts || {};
    const card = document.createElement("article");
    card.className = "event-card";

    const due = opts.showDue !== false
      ? '<span class="due-chip" data-deadline="' + ev.deadline + '"' +
        (daysLeft(ev.deadline) <= 3 && daysLeft(ev.deadline) >= 0 ? ' data-due-soon="1"' : "") + ">" +
        countdownLabel(ev.deadline) + "</span>"
      : "";

    const loc = ev.location
      ? '<span class="event-meta">📍 ' + ev.location + " · " + fmtRange(ev.dates, ev.deadline) + "</span>"
      : '<span class="event-meta">🌐 Online · ' + fmtRange(ev.dates, ev.deadline) + "</span>";

    const hostLine = ev.host
      ? '<div class="event-meta host-line">🏡 Hosted by ' + escapeHtml(ev.host) + (ev.venue ? " · " + escapeHtml(ev.venue) : "") + "</div>"
      : "";
    const hostIntel = ev.hostInsight
      ? '<details class="host-details"><summary>Host intel</summary><p class="host-insight">' + escapeHtml(ev.hostInsight) + "</p></details>"
      : "";
    const rsvp = opts.showDue !== false && ev.format === "irl" ? rsvpRow(ev) : "";
    const w = watchFor(ev.id);
    const watching = watchFor(ev.id).starred;
    const note = watchFor(ev.id).note;
    const inCompare = compareSet.indexOf(ev.id) !== -1;

    card.innerHTML =
      '<div class="flex items-center justify-between gap-2">' +
        "<h3>" + ev.name + "</h3>" + due +
      "</div>" +
      '<div class="prize">' + ev.prize + "</div>" +
      loc +
      hostLine +
      '<p class="event-desc">' + ev.blurb + "</p>" +
      hostIntel +
      rsvp +
      '<div class="event-meta">' +
        ev.tags.map(function (t) { return '<span class="tag">' + t + "</span>"; }).join("") +
      "</div>" +
      '<div class="card-actions">' +
        '<a class="btn btn-secondary btn-sm" href="' + ev.url + '" target="_blank" rel="noopener">Register ↗</a>' +
        '<button class="btn btn-ghost btn-sm act-watch' + (watching ? " active" : "") + '" data-ev="' + ev.id + '" aria-pressed="' + (watching ? "true" : "false") + '" title="Watchlist">' + (watching ? "★ Watching" : "☆ Watch") + "</button>" +
        '<button class="btn btn-ghost btn-sm act-compare' + (inCompare ? " active" : "") + '" data-ev="' + ev.id + '" aria-pressed="' + (inCompare ? "true" : "false") + '" title="Compare (up to 3)">' + (inCompare ? "☑ Comparing" : "☐ Compare") + "</button>" +
        '<button class="btn btn-ghost btn-sm act-share" data-ev="' + ev.id + '" title="Share">↗ Share</button>' +
        '<button class="btn btn-ghost btn-sm act-copy" data-ev="' + ev.id + '" title="Copy summary">⧉ Copy</button>' +
        '<button class="btn btn-ghost btn-sm act-ics" data-ev="' + ev.id + '" title="Add to calendar (.ics)">📅 .ics</button>' +
      "</div>" +
      (watching
        ? '<div class="watch-note"><label class="text-sm text-muted" for="note-' + ev.id + '">Why you\'re watching it</label>' +
          '<input class="input watch-input" id="note-' + ev.id + '" data-ev="' + ev.id + '" type="text" maxlength="120" placeholder="e.g. judges love a live demo" value="' + escapeHtml(note) + '"></div>'
        : "");

    if (rsvp) wireRsvp(card, ev);
    wireCardActions(card, ev);
    return card;
  }

  function wireCardActions(card, ev) {
    const watch = card.querySelector(".act-watch");
    if (watch) watch.addEventListener("click", function () {
      const cur = watchFor(ev.id);
      setWatch(ev.id, { starred: !cur.starred });
      renderEvents();
      announce(!cur.starred ? "Added " + ev.name + " to watchlist" : "Removed " + ev.name + " from watchlist");
    });
    const cmp = card.querySelector(".act-compare");
    if (cmp) cmp.addEventListener("click", function () {
      const i = compareSet.indexOf(ev.id);
      if (i !== -1) compareSet.splice(i, 1);
      else if (compareSet.length >= 3) { toast("Compare holds three events — remove one first."); return; }
      else compareSet.push(ev.id);
      renderEvents();
      renderCompare();
    });
    const share = card.querySelector(".act-share");
    if (share) share.addEventListener("click", function () { shareEvent(ev); });
    const copy = card.querySelector(".act-copy");
    if (copy) copy.addEventListener("click", function () {
      if (navigator.clipboard) navigator.clipboard.writeText(summaryText(ev)).then(function () { toast("Summary copied."); });
      else toast("Clipboard not available here.");
    });
    const ics = card.querySelector(".act-ics");
    if (ics) ics.addEventListener("click", function () {
      downloadFile(ev.id + ".ics", icsFor(ev), "text/calendar");
      toast("Calendar file downloaded.");
    });
    const note = card.querySelector(".watch-input");
    if (note) note.addEventListener("change", function () {
      setWatch(ev.id, { note: note.value.trim() });
      toast("Watch note saved.");
    });
  }

  /* ---------- Compare view ---------- */

  function renderCompare() {
    const bar = document.getElementById("compare-bar");
    const out = document.getElementById("compare-out");
    if (!bar || !out) return;

    if (!compareSet.length) { bar.hidden = true; out.innerHTML = ""; return; }

    bar.hidden = false;
    bar.innerHTML = "Comparing " + compareSet.length + "/3 — " +
      compareSet.map(function (id) {
        const ev = findEvent(id);
        return '<span class="tag">' + (ev ? escapeHtml(ev.name) : id) +
          '<button class="crew-x" data-uncompare="' + id + '" aria-label="Remove from compare">×</button></span>';
      }).join(" ") +
      ' <button id="compare-clear" class="btn btn-ghost btn-sm">Clear</button>';

    if (compareSet.length < 2) { out.innerHTML = '<p class="text-muted text-sm">Pick at least one more event to compare side by side.</p>'; return; }

    const evs = compareSet.map(findEvent).filter(Boolean);
    const rows = [
      ["Deadline", function (e) { return fmtDate(e.deadline); }],
      ["Dates", function (e) { return fmtRange(e.dates, e.deadline); }],
      ["Format", function (e) { return e.format === "irl" ? (e.location || "IRL") : "Online"; }],
      ["Prize", function (e) { return e.prize; }],
      ["Tracks", function (e) { return e.tags.join(", "); }],
      ["", function (e) { return '<a href="' + e.url + '" target="_blank" rel="noopener">Register ↗</a>'; }]
    ];

    out.innerHTML =
      '<div class="card" style="overflow-x:auto;"><table class="compare-table"><thead><tr><th></th>' +
      evs.map(function (e) { return "<th>" + escapeHtml(e.name) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr><td>" + r[0] + "</td>" + evs.map(function (e) { return "<td>" + r[1](e) + "</td>"; }).join("") + "</tr>";
      }).join("") +
      "</tbody></table></div>";

    bar.querySelectorAll("[data-uncompare]").forEach(function (b) {
      b.addEventListener("click", function () {
        const i = compareSet.indexOf(b.dataset.uncompare);
        if (i !== -1) compareSet.splice(i, 1);
        renderEvents(); renderCompare();
      });
    });
    const clear = document.getElementById("compare-clear");
    if (clear) clear.addEventListener("click", function () {
      compareSet.length = 0; renderEvents(); renderCompare();
    });
  }

  function findEvent(id) {
    return HACKBOARD_DATA.open.find(function (e) { return e.id === id; }) ||
           HACKBOARD_DATA.concluded.find(function (e) { return e.id === id; });
  }

  /* ---------- Filters, sort, prize range, persistence ---------- */

  const FILTERS = [
    { id: "all", label: "All", test: function () { return true; } },
    { id: "online", label: "Online", test: function (ev) { return ev.format === "online"; } },
    { id: "irl", label: "IRL", test: function (ev) { return ev.format === "irl"; } },
    { id: "nyc", label: "NYC", test: function (ev) { return ev.hub === "NYC"; } },
    { id: "sf", label: "SF", test: function (ev) { return ev.hub === "SF"; } },
    { id: "sanjose", label: "San Jose", test: function (ev) { return ev.hub === "San Jose"; } },
    { id: "boston", label: "Boston", test: function (ev) { return ev.hub === "Boston"; } },
    { id: "seattle", label: "Seattle", test: function (ev) { return ev.hub === "Seattle"; } },
    { id: "plans", label: "🎉 My plans", test: function (ev) { return rsvpFor(ev.id).going === true; } },
    { id: "watch", label: "★ Watchlist", test: function (ev) { return watchFor(ev.id).starred; } },
    { id: "ai", label: "AI & agents", test: function (ev) { return ev.tags.indexOf("ai") !== -1 || ev.tags.indexOf("agents") !== -1; } },
    { id: "students", label: "Students", test: function (ev) { return ev.tags.indexOf("students") !== -1; } },
    { id: "web3", label: "Web3", test: function (ev) { return ev.tags.indexOf("web3") !== -1; } },
    { id: "beginner", label: "Beginner-friendly", test: function (ev) { return ev.tags.indexOf("beginner") !== -1; } }
  ];

  const PREFS_KEY = "hackboard:prefs:v1";
  const prefs = Object.assign({ filter: "all", sort: "deadline", prize: "0" }, store(PREFS_KEY, {}));

  let activeFilter = prefs.filter;

  function savePrefs() {
    saveStore(PREFS_KEY, prefs);
  }

  function renderFilters() {
    const wrap = document.getElementById("filters");
    if (!wrap) return;
    wrap.innerHTML = "";
    FILTERS.forEach(function (f) {
      const btn = document.createElement("button");
      btn.className = "filter-chip" + (f.id === activeFilter ? " active" : "");
      btn.textContent = f.label;
      btn.addEventListener("click", function () {
        activeFilter = f.id;
        prefs.filter = f.id;
        savePrefs();
        renderFilters();
        renderEvents();
      });
      wrap.appendChild(btn);
    });
  }

  function renderEvents() {
    const grid = document.getElementById("event-grid");
    const empty = document.getElementById("no-results");
    if (!grid) return;

    const f = FILTERS.find(function (x) { return x.id === activeFilter; }) || FILTERS[0];
    const minPrize = Number(prefs.prize) || 0;

    let events = HACKBOARD_DATA.open.filter(f.test).filter(function (ev) {
      return prizeValue(ev) >= minPrize;
    });

    events.sort(function (a, b) {
      if (prefs.sort === "name") return a.name < b.name ? -1 : 1;
      if (prefs.sort === "prize") return prizeValue(b) - prizeValue(a);
      return a.deadline < b.deadline ? -1 : 1;
    });

    grid.innerHTML = "";
    events.forEach(function (ev) { grid.appendChild(eventCard(ev)); });
    if (empty) empty.style.display = events.length ? "none" : "block";
    announce(events.length + " events shown");
  }

  function resetBoardPrefs() {
    prefs.filter = "all"; prefs.sort = "deadline"; prefs.prize = "0";
    activeFilter = "all";
    savePrefs();
    const sortSel = document.getElementById("sort-select");
    const prizeSel = document.getElementById("prize-select");
    if (sortSel) sortSel.value = "deadline";
    if (prizeSel) prizeSel.value = "0";
    renderFilters(); renderEvents();
  }

  function renderConcluded() {
    const grid = document.getElementById("concluded-grid");
    if (!grid) return;
    grid.innerHTML = "";
    HACKBOARD_DATA.concluded
      .slice()
      .sort(function (a, b) { return a.deadline < b.deadline ? 1 : -1; })
      .forEach(function (ev) {
        const card = eventCard(ev, { showDue: false });
        card.style.opacity = "0.75";
        grid.appendChild(card);
      });
  }

  /* ---------- Winners ---------- */

  function renderWinners() {
    const grid = document.getElementById("winners-grid");
    if (!grid) return;
    grid.innerHTML = "";
    HACKBOARD_DATA.winners.forEach(function (w) {
      const card = document.createElement("article");
      card.className = "event-card";
      const badge = w.status === "won"
        ? '<span class="winner-tag">✔ announced</span>'
        : '<span class="pending-tag">⏳ pending</span>';
      card.innerHTML =
        '<div class="flex items-center justify-between gap-2">' +
          "<h3>" + w.title + "</h3>" + badge +
        "</div>" +
        '<span class="event-meta">' + w.event + "</span>" +
        '<p class="event-desc">' + w.detail + "</p>";
      grid.appendChild(card);
    });
  }

  /* ---------- Deadline calendar ---------- */

  let calMonthOffset = 0;

  function renderCalendar() {
    const wrap = document.getElementById("calendar-grid");
    const title = document.getElementById("calendar-title");
    if (!wrap) return;

    const base = new Date();
    base.setUTCDate(1);
    base.setUTCMonth(base.getUTCMonth() + calMonthOffset);
    const year = base.getUTCFullYear(), month = base.getUTCMonth();

    if (title) {
      title.textContent = base.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    }

    const byDay = {};
    HACKBOARD_DATA.open.forEach(function (ev) {
      (byDay[ev.deadline] = byDay[ev.deadline] || []).push(ev);
    });

    const first = new Date(Date.UTC(year, month, 1));
    const startDow = first.getUTCDay(); /* 0 = Sun */
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const todayIso = new Date().toISOString().slice(0, 10);

    let html = ["S", "M", "T", "W", "T", "F", "S"].map(function (d) {
      return '<div class="cal-dow">' + d + "</div>";
    }).join("");
    for (let i = 0; i < startDow; i++) html += '<div class="cal-day cal-pad"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = year + "-" + ("0" + (month + 1)).slice(-2) + "-" + ("0" + d).slice(-2);
      const evs = byDay[iso] || [];
      html += '<div class="cal-day' + (iso === todayIso ? " cal-today" : "") + '">' +
        '<span class="cal-num">' + d + "</span>" +
        evs.slice(0, 2).map(function (e) {
          return '<span class="cal-ev" title="' + escapeHtml(e.name) + " · " + escapeHtml(e.prize) + '">' + escapeHtml(e.name) + "</span>";
        }).join("") +
        (evs.length > 2 ? '<span class="cal-ev cal-more">+' + (evs.length - 2) + " more</span>" : "") +
        "</div>";
    }
    wrap.innerHTML = html;
    const hint = document.getElementById("calendar-hint");
    if (hint) hint.textContent = "Deadlines land on their day — " +
      Object.keys(byDay).filter(function (iso) { return iso.slice(0, 7) === year + "-" + ("0" + (month + 1)).slice(-2); }).length + " due this month.";
  }

  /* ---------- Deadline reminders (while HackBoard is open) ---------- */

  const REMIND_KEY = "hackboard:remind:last";

  function deadlineSoonList() {
    return HACKBOARD_DATA.open.filter(function (ev) {
      const d = daysLeft(ev.deadline);
      return d >= 0 && d <= 3;
    });
  }

  function notifyDeadlines() {
    const soon = deadlineSoonList();
    if (!soon.length) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(REMIND_KEY) === today) return;
    try {
      localStorage.setItem(REMIND_KEY, today);
      new Notification("HackBoard — deadlines ahead", {
        body: soon.map(function (e) { return e.name + " · " + countdownLabel(e.deadline); }).join("\n"),
        tag: "hackboard-deadlines"
      });
    } catch (e) { /* notifications unavailable */ }
  }

  function wireReminders() {
    const btn = document.getElementById("remind-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (!("Notification" in window)) { toast("This browser doesn't support notifications."); return; }
      if (Notification.permission === "granted") { notifyDeadlines(); toast("Reminders on while HackBoard is open — checked daily."); return; }
      Notification.requestPermission().then(function (p) {
        if (p === "granted") { notifyDeadlines(); toast("Reminders on while HackBoard is open — checked daily."); }
        else toast("No worries — you can turn these on later.");
      });
    });
    if ("Notification" in window && Notification.permission === "granted") notifyDeadlines();
  }

  /* ---------- Team-matching board (local, on this device) ---------- */

  const TEAM_KEY = "hackboard:team:v1";

  function renderTeamBoard() {
    const list = document.getElementById("team-list");
    if (!list) return;
    const posts = store(TEAM_KEY, []);
    if (!posts.length) {
      list.innerHTML = '<p class="text-muted text-sm">No posts yet. The board is on your device only — nothing here is shared with other builders.</p>';
      return;
    }
    list.innerHTML = posts.map(function (p, i) {
      return '<div class="card team-post"><div class="flex items-center justify-between gap-2">' +
        "<strong>" + escapeHtml(p.name) + '</strong><button class="btn btn-ghost btn-sm team-del" data-idx="' + i + '" aria-label="Remove post">×</button></div>' +
        '<span class="event-meta">' + escapeHtml(p.event) + "</span>" +
        '<p class="event-desc">' + escapeHtml(p.looking) + "</p></div>";
    }).join("");
    list.querySelectorAll(".team-del").forEach(function (b) {
      b.addEventListener("click", function () {
        const posts = store(TEAM_KEY, []);
        posts.splice(Number(b.dataset.idx), 1);
        saveStore(TEAM_KEY, posts);
        renderTeamBoard();
      });
    });
  }

  function wireTeamForm() {
    const form = document.getElementById("team-form");
    if (!form) return;
    const evSel = document.getElementById("team-event");
    if (evSel) {
      HACKBOARD_DATA.open.forEach(function (ev) {
        const opt = document.createElement("option");
        opt.value = ev.id;
        opt.textContent = ev.name;
        evSel.appendChild(opt);
      });
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const name = document.getElementById("team-name").value.trim();
      const looking = document.getElementById("team-looking").value.trim();
      const evName = evSel && evSel.selectedIndex > 0 ? evSel.options[evSel.selectedIndex].text : "Any event";
      if (!name || !looking) return;
      const posts = store(TEAM_KEY, []);
      posts.unshift({ name: name, looking: looking, event: evName, at: new Date().toISOString().slice(0, 10) });
      saveStore(TEAM_KEY, posts.slice(0, 50));
      form.reset();
      renderTeamBoard();
      toast("Posted — visible on this device only.");
    });
  }

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    renderFilters();
    renderEvents();
    renderConcluded();
    renderWinners();
    renderCompare();
    renderCalendar();
    renderTeamBoard();
    wireTeamForm();
    wireReminders();
    wireBoardControls();

    /* Sort + prize-range controls, persisted. */
    const sortSel = document.getElementById("sort-select");
    const prizeSel = document.getElementById("prize-select");
    if (sortSel) {
      sortSel.value = prefs.sort;
      sortSel.addEventListener("change", function () { prefs.sort = sortSel.value; savePrefs(); renderEvents(); });
    }
    if (prizeSel) {
      prizeSel.value = prefs.prize;
      prizeSel.addEventListener("change", function () { prefs.prize = prizeSel.value; savePrefs(); renderEvents(); });
    }
    const calPrev = document.getElementById("cal-prev");
    const calNext = document.getElementById("cal-next");
    if (calPrev) calPrev.addEventListener("click", function () { calMonthOffset--; renderCalendar(); });
    if (calNext) calNext.addEventListener("click", function () { calMonthOffset++; renderCalendar(); });

    /* Ticking countdowns — refresh due chips every 30s without a full re-render. */
    setInterval(function () {
      document.querySelectorAll("[data-deadline]").forEach(function (chip) {
        chip.textContent = countdownLabel(chip.dataset.deadline);
      });
    }, 30000);

    announce("HackBoard loaded — " + HACKBOARD_DATA.open.length + " open hackathons");
  });

  function wireBoardControls() {
    const reset = document.getElementById("reset-filters");
    if (reset) reset.addEventListener("click", resetBoardPrefs);
  }

  /* Expose for the predictor / agent branches to reuse. */
  window.HackBoard = {
    fmtDate: fmtDate,
    fmtRange: fmtRange,
    eventCard: eventCard,
    daysLeft: daysLeft,
    countdownLabel: countdownLabel,
    rsvpFor: rsvpFor,
    escapeHtml: escapeHtml,
    prizeValue: prizeValue,
    toast: toast,
    downloadFile: downloadFile,
    announce: announce,
    resetBoardPrefs: resetBoardPrefs
  };
})();
