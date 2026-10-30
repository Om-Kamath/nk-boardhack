/* Investor pitch-script generator — turn project inputs into a timed,
 * stage-directed script for presenting the project to investors.
 *
 * How it works, honestly:
 * - Template-driven composition: a proven pitch arc (hook → problem →
 *   solution → why now → market → traction → team → ask) with your
 *   sentences dropped into each beat. It is a script tool, not an AI
 *   model — the quality of the script tracks the quality of your inputs,
 *   and blank fields fall back to bracketed prompts so you know what to
 *   say in the room.
 * - Output: readable script with timing marks and stage directions,
 *   copyable, downloadable as .md, and one click pipes the hook /
 *   one-liner / traction into the demo-video generator below.
 * - Fully client-side; nothing you write leaves the page. */

(function () {
  "use strict";

  const F = {
    name: document.getElementById("pitch-name"),
    oneliner: document.getElementById("pitch-oneliner"),
    problem: document.getElementById("pitch-problem"),
    solution: document.getElementById("pitch-solution"),
    whynow: document.getElementById("pitch-whynow"),
    market: document.getElementById("pitch-market"),
    traction: document.getElementById("pitch-traction"),
    team: document.getElementById("pitch-team"),
    ask: document.getElementById("pitch-ask")
  };
  const RUN = document.getElementById("pitch-generate");
  const RESULT = document.getElementById("pitch-result");

  /* ---------- The pitch arc: 90 seconds, 8 beats ---------- */

  function val(el) { return el.value.trim(); }
  function or(el, fallback) { return val(el) || fallback; }

  function buildScript() {
    const name = or(F.name, "[project name]");
    const oneliner = or(F.oneliner, "[one sentence: what it does and for whom]");
    const problem = or(F.problem, "[the specific problem, and who feels it weekly]");
    const solution = or(F.solution, "[how your product removes that pain — the mechanism, not the feature list]");
    const whynow = or(F.whynow, "[what changed recently that makes this possible today]");
    const market = or(F.market, "[who pays, how many of them, at what price]");
    const traction = or(F.traction, "[what exists today: users, pilots, revenue, waitlist]");
    const team = or(F.team, "[why this team wins it]");
    const ask = or(F.ask, "[the specific ask: money, intro, pilot, next milestone]");

    return [
      {
        t: "0:00 · The hook",
        dur: "10 sec",
        dir: "[stand still, no slides. Say it to one person, not the room.]",
        lines: [
          name + " is " + oneliner + ".",
          "Here's the problem we couldn't stop thinking about: " + problem
        ]
      },
      {
        t: "0:10 · The problem",
        dur: "15 sec",
        dir: "[name the pain in their world, not your technology.]",
        lines: [
          "Today, " + problem,
          "And every workaround costs the same three things: time, money, and people giving up."
        ]
      },
      {
        t: "0:25 · The solution",
        dur: "20 sec",
        dir: "[one mechanism, one example. Resist the feature tour.]",
        lines: [
          name + " fixes this by " + solution,
          "The user experience in one sentence: they " + oneliner + " — that's the whole product."
        ]
      },
      {
        t: "0:45 · Why now",
        dur: "10 sec",
        dir: "[this beat is what separates fundable from merely good.]",
        lines: [
          "This works now because " + whynow,
          "Twelve months ago this was a research project. Today it's a product."
        ]
      },
      {
        t: "0:55 · The market",
        dur: "10 sec",
        dir: "[bottom-up beats top-down: who pays, not TAM slides.]",
        lines: [
          "The buyers are " + market,
          "We don't need the whole market — the first hundred customers are already reachable."
        ]
      },
      {
        t: "1:05 · Traction",
        dur: "10 sec",
        dir: "[numbers or artifacts, never adjectives.]",
        lines: [
          "Where we are today: " + traction
        ]
      },
      {
        t: "1:15 · Team",
        dur: "5 sec",
        dir: "[five seconds. Confidence, not resumes.]",
        lines: [
          "And the team: " + team
        ]
      },
      {
        t: "1:20 · The ask",
        dur: "10 sec",
        dir: "[specific number, specific use. Then stop talking — the silence is the close.]",
        lines: [
          ask,
          "That's " + name + ". Happy to go deeper on any part of it."
        ]
      }
    ];
  }

  function renderScript(beats) {
    let html = '<div class="pitch-script">';
    beats.forEach(function (b) {
      html += '<div class="pitch-beat">' +
        '<div class="flex items-baseline justify-between gap-2"><strong>' + b.t + "</strong>" +
        '<span class="text-muted text-sm">' + b.dur + "</span></div>" +
        '<p class="pitch-dir">' + b.dir.replace(/^\[|\]$/g, "") + "</p>" +
        b.lines.map(function (l) { return '<p class="pitch-line">“' + l + '”</p>'; }).join("") +
        "</div>";
    });
    html += "</div>";
    return html;
  }

  function toMarkdown(beats) {
    const name = val(F.name) || "Project";
    let out = "# Investor pitch script — " + name + "\n\n~90 seconds. Bracketed lines are stage directions, not spoken.\n\n";
    beats.forEach(function (b) {
      out += "**[" + b.t + " — " + b.dur + "]**\n\n";
      out += "_" + b.dir.replace(/^\[|\]$/g, "") + "_\n\n";
      b.lines.forEach(function (l) { out += "> " + l + "\n\n"; });
    });
    out += "---\n\n**Delivery notes**\n\n- Rehearse to 80 seconds — you will run over live.\n- The ask beat is the only beat you may not cut for time.\n- One person delivers the hook and the ask; the same face opens and closes.\n- Bring one number you can defend to the decimal. Bring nothing else.\n";
    return out;
  }

  function generate() {
    const beats = buildScript();
    const md = toMarkdown(beats);

    RESULT.innerHTML =
      renderScript(beats) +
      '<div class="vid-actions">' +
        '<button id="pitch-copy" class="btn btn-secondary">📋 Copy script</button>' +
        '<a class="btn btn-secondary" download="investor-pitch.md" href="' + URL.createObjectURL(new Blob([md], { type: "text/markdown" })) + '">⬇ Download (.md)</a>' +
        '<button id="pitch-to-video" class="btn btn-primary">🎬 Send to demo-video generator</button>' +
      "</div>";

    document.getElementById("pitch-copy").addEventListener("click", function () {
      const btn = this;
      navigator.clipboard.writeText(md).then(function () {
        btn.textContent = "✓ Copied";
        setTimeout(function () { btn.textContent = "📋 Copy script"; }, 1600);
      });
    });

    document.getElementById("pitch-to-video").addEventListener("click", function () {
      document.getElementById("vid-title").value = val(F.name);
      document.getElementById("vid-tagline").value = val(F.oneliner);
      document.getElementById("vid-desc").value = [val(F.solution), val(F.market), val(F.traction)]
        .filter(Boolean).map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1) + "."; }).join(" ");
      document.getElementById("video").scrollIntoView({ behavior: "smooth" });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!RUN) return;
    RUN.addEventListener("click", generate);
  });
})();
