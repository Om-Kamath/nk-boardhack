/* HackBoard app logic — board rendering, filters, countdowns, winners.
 * Depends on data.js (HACKBOARD_DATA, countdownLabel). Predictor and
 * HackBot load as separate scripts on their own branches. */

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

  /* ---------- Event cards ---------- */

  function eventCard(ev, opts) {
    opts = opts || {};
    const card = document.createElement("article");
    card.className = "event-card";

    const due = opts.showDue !== false
      ? '<span class="due-chip' + (daysLeft(ev.deadline) <= 3 && daysLeft(ev.deadline) >= 0 ? " due-soon" : "") + '">' + countdownLabel(ev.deadline) + "</span>"
      : "";

    const loc = ev.location
      ? '<span class="event-meta">📍 ' + ev.location + " · " + fmtRange(ev.dates, ev.deadline) + "</span>"
      : '<span class="event-meta">🌐 Online · ' + fmtRange(ev.dates, ev.deadline) + "</span>";

    card.innerHTML =
      '<div class="flex items-center justify-between gap-2">' +
        "<h3>" + ev.name + "</h3>" + due +
      "</div>" +
      '<div class="prize">' + ev.prize + "</div>" +
      loc +
      '<p class="event-desc">' + ev.blurb + "</p>" +
      '<div class="event-meta">' +
        ev.tags.map(function (t) { return '<span class="tag">' + t + "</span>"; }).join("") +
      "</div>" +
      '<a class="btn btn-secondary btn-sm" href="' + ev.url + '" target="_blank" rel="noopener" style="margin-top: var(--space-2);">Register ↗</a>';

    return card;
  }

  /* ---------- Filters ---------- */

  const FILTERS = [
    { id: "all", label: "All", test: function () { return true; } },
    { id: "online", label: "Online", test: function (ev) { return ev.format === "online"; } },
    { id: "irl", label: "IRL", test: function (ev) { return ev.format === "irl"; } },
    { id: "ai", label: "AI & agents", test: function (ev) { return ev.tags.indexOf("ai") !== -1 || ev.tags.indexOf("agents") !== -1; } },
    { id: "students", label: "Students", test: function (ev) { return ev.tags.indexOf("students") !== -1; } },
    { id: "web3", label: "Web3", test: function (ev) { return ev.tags.indexOf("web3") !== -1; } },
    { id: "beginner", label: "Beginner-friendly", test: function (ev) { return ev.tags.indexOf("beginner") !== -1; } }
  ];

  let activeFilter = "all";

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
    const events = HACKBOARD_DATA.open
      .filter(f.test)
      .sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });

    grid.innerHTML = "";
    events.forEach(function (ev) { grid.appendChild(eventCard(ev)); });
    if (empty) empty.style.display = events.length ? "none" : "block";
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

  /* ---------- Init ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    renderFilters();
    renderEvents();
    renderConcluded();
    renderWinners();
  });

  /* Expose for the predictor / agent branches to reuse. */
  window.HackBoard = {
    fmtDate: fmtDate,
    fmtRange: fmtRange,
    eventCard: eventCard,
    daysLeft: daysLeft,
    countdownLabel: countdownLabel
  };
})();
