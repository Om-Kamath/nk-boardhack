/* HackBoard win predictor — a transparent heuristic, not a crystal ball.
 * Scores project archetypes against the patterns in this board's tracked
 * data: sponsor-track concentration (ETHGlobal 2026), the SalesShortcut
 * case, and the agent-heavy November 2026 field. Depends on data.js. */

(function () {
  "use strict";

  /* Base fit per (track, venue). Weights read as: how strongly this
   * combination matches where 2026 prize money actually went. */
  const WEIGHTS = {
    agents:   { online: 0.86, irl: 0.62, sponsor: 0.74 },
    defi:     { online: 0.58, irl: 0.81, sponsor: 0.88 },
    devtools: { online: 0.72, irl: 0.55, sponsor: 0.7 },
    identity: { online: 0.5,  irl: 0.6,  sponsor: 0.78 },
    health:   { online: 0.76, irl: 0.5,  sponsor: 0.48 },
    consumer: { online: 0.55, irl: 0.58, sponsor: 0.45 }
  };

  /* What to actually build, per track — grounded in tracked outcomes. */
  const ARCHETYPES = {
    agents: [
      "An agent that does a boring job end-to-end on real data (SalesShortcut won the ADK Hackathon this way, then became a company).",
      "A workflow tool with a human checkpoint — judges trust agents they can supervise.",
      "Skip the chat wrapper: anything that is 'just ChatGPT with a prompt' drowns in this field."
    ],
    defi: [
      "A payments primitive with an agent driving it — DeFi + agentic payments swept sponsor tracks at HackMoney, ETHOnline, and Tokyo.",
      "An on-chain risk or yield tool with a working mainnet fork demo.",
      "Skip generic NFT marketplace builds — this lane is saturated and unfunded in 2026."
    ],
    devtools: [
      "Infra that makes other hacks faster — sponsor judges (Vultr, Builder.io) reward tooling they would ship internally.",
      "A CLI or SDK with a killer 60-second demo; infra wins live on demo speed.",
      "Target the niche lanes instead of the crowded agent meta: UGREEN's NAS event pays $51K for local-first AI."
    ],
    identity: [
      "World ID / ENS-style verification layered onto a real workflow — identity tracks paid at Tokyo and New York.",
      "A security-agent build (CrowdStrike-shaped): detection plus response on real telemetry.",
      "Skip pure 'decentralized identity' essays — sponsors fund working integrations."
    ],
    health: [
      "Medical-data triage with visible citations — DSH Hacks V2's largest pool is AI + healthcare.",
      "A clinician-facing tool, not a consumer wellness app; judges reward domain specificity.",
      "Ship against a real dataset (MIMIC-style) even if mocked — plausibility carries this track."
    ],
    consumer: [
      "A social/civic agent with a real deployment path — Code for India rewards civic tooling over slideware.",
      "Consumer hacks win IRL fields on polish: cut scope until the demo is flawless.",
      "Skip me-too clones of trending apps; field fatigue is real."
    ]
  };

  const VENUE_NOTES = {
    online: "Big online fields mean volume competition — differentiation and demo quality decide it.",
    irl: "Small IRL fields pay less but convert far better for student and first-time teams.",
    sponsor: "Sponsor-track focused events concentrate the money: win the named track, not the general pool."
  };

  function score(track, venue) {
    const w = WEIGHTS[track] && WEIGHTS[track][venue];
    return typeof w === "number" ? w : 0.5;
  }

  function verdictLabel(p) {
    if (p >= 0.8) return "Strong lane";
    if (p >= 0.6) return "Fair lane";
    return "Hard lane";
  }

  function run(track, venue) {
    const p = score(track, venue);
    const pct = Math.round(p * 100);

    /* Best-matching open events for this track, soonest deadline first. */
    const matches = HACKBOARD_DATA.open
      .filter(function (ev) { return ev.tags.indexOf(track) !== -1 || (track === "agents" && ev.tags.indexOf("ai") !== -1); })
      .sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; })
      .slice(0, 3);

    return {
      pct: pct,
      label: verdictLabel(p),
      archetype: ARCHETYPES[track] || [],
      venueNote: VENUE_NOTES[venue] || "",
      matches: matches
    };
  }

  function render(track, venue) {
    const out = document.getElementById("pred-result");
    if (!out) return;
    const r = run(track, venue);

    out.innerHTML =
      '<h4>' + r.label + ' — <span class="prize">' + r.pct + "% fit</span></h4>" +
      '<div class="score-row">' +
        '<span class="score-name">vs. tracked 2026 winner patterns</span>' +
        '<div class="score-bar-track"><div class="score-bar-fill" style="width:' + r.pct + '%"></div></div>' +
        '<span class="score-pct">' + r.pct + "%</span>" +
      "</div>" +
      "<h4>What to build</h4><ul class=\"insight-list\">" +
        r.archetype.map(function (a) { return "<li>" + a + "</li>"; }).join("") +
      "</ul>" +
      '<div class="verdict">' + r.venueNote + "</div>" +
      (r.matches.length
        ? '<h4>Best open events for this track</h4><ul class="insight-list">' +
          r.matches.map(function (ev) {
            return '<li><strong>' + ev.name + '</strong> — ' + HackBoard.countdownLabel(ev.deadline) +
                   ' · <a href="' + ev.url + '" target="_blank" rel="noopener">event page ↗</a></li>';
          }).join("") + "</ul>"
        : "") +
      '<p class="pred-note">Heuristic based on tracked sponsor tracks and winner data from Oct 2026 — a directional read, not odds. Verify everything on the event page.</p>';
  }

  document.addEventListener("DOMContentLoaded", function () {
    const btn = document.getElementById("pred-run");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const track = document.getElementById("pred-track").value;
      const venue = document.getElementById("pred-venue").value;
      render(track, venue);
    });
  });

  window.HackBoardPredictor = { run: run, render: render, score: score };
})();
