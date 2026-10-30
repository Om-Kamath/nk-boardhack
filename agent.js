/* HackBot — HackBoard's in-site agent.
 * Two jobs: (1) talk about what's new with the tracked hackathons — news,
 * deadlines, prizes, winners; (2) read a CV (pasted or uploaded) and match
 * the person to the open events on this board.
 *
 * Fully client-side: it answers from data.js only, so it never leaks user
 * data and works offline. Depends on HACKBOARD_DATA, countdownLabel,
 * daysLeft, HackBoard.*. */

(function () {
  "use strict";

  /* ---------- DOM handles ---------- */

  const panel = document.getElementById("agent-panel");
  const launcher = document.getElementById("agent-launcher");
  const closeBtn = document.getElementById("agent-close");
  const messages = document.getElementById("agent-messages");
  const form = document.getElementById("agent-form");
  const input = document.getElementById("agent-input");
  const fileInput = document.getElementById("agent-cv-file");
  const cvBtn = document.getElementById("agent-cv-btn");
  const cvZone = document.getElementById("agent-cv-zone");
  const newsBtn = document.getElementById("agent-news-btn");

  let cvText = null;
  let greeted = false;

  /* ---------- Formatting helpers ---------- */

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* Minimal markdown: **bold**, [text](url), line breaks. Input is
   * escaped first, so no raw HTML can pass through from data or user. */
  function md(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1 ↗</a>')
      .replace(/\n/g, "<br>");
  }

  function addMsg(text, who) {
    const el = document.createElement("div");
    el.className = "msg msg-" + who;
    el.innerHTML = md(text);
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function typing() {
    const el = document.createElement("div");
    el.className = "msg msg-bot typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function botReply(text, delay) {
    const t = typing();
    setTimeout(function () {
      t.remove();
      addMsg(text, "bot");
    }, delay || 450 + Math.random() * 350);
  }

  function eventLine(ev) {
    return "**" + ev.name + "** — " + ev.prize + " · " + HackBoard.countdownLabel(ev.deadline) +
      " · [event page](" + ev.url + ")";
  }

  /* ---------- Intent: news ---------- */

  function replyNews() {
    const items = HACKBOARD_DATA.news.map(function (n) { return "• " + n.text; }).join("\n");
    botReply("Here's what's new on the board:\n\n" + items + "\n\nAsk me about any of these — deadlines, prizes, or who's expected to win.");
  }

  /* ---------- Intent: deadlines ---------- */

  function replyDeadlines() {
    const sorted = HACKBOARD_DATA.open
      .slice()
      .sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });
    const lines = sorted.map(function (ev) { return "• " + eventLine(ev); }).join("\n");
    botReply("Open hackathons, soonest deadline first:\n\n" + lines);
  }

  /* ---------- Intent: prizes ---------- */

  function replyPrizes() {
    /* Curated by tracked pool size — prize strings mix currencies and
     * credits, so sorting on parsed digits is unreliable. */
    const big = ["kiroween", "paypal-ai-hackathon", "ugreen-ai-nas", "dsh-hacks-v2"]
      .map(function (id) { return HACKBOARD_DATA.open.find(function (e) { return e.id === id; }); })
      .filter(Boolean);
    botReply("Biggest pools open right now:\n\n" + big.map(eventLine).join("\n") +
      "\n\nHeads up: the biggest pool also draws the biggest field. Smaller IRL events pay less but convert far better for a first win.");
  }

  /* ---------- Intent: winners ---------- */

  function replyWinners() {
    botReply(
      "Recent winners and who's next:\n\n" +
      HACKBOARD_DATA.winners.map(function (w) {
        return "• **" + w.title + "** (" + w.event + ") — " + w.detail;
      }).join("\n") +
      "\n\nThe confirmed pattern: tools that do a real job on real data beat demos. SalesShortcut is the case study."
    );
  }

  /* ---------- CV matching ---------- */

  const SKILL_MAP = {
    agents: ["agent", "agentic", "autonomous", "orchestration", "mcp", "tool use", "function calling", "langchain", "crew", "langgraph"],
    ai: ["machine learning", "ml", "deep learning", "nlp", "llm", "pytorch", "tensorflow", "genai", "generative", "rag", "embedding", "transformer", "computer vision"],
    web3: ["solidity", "evm", "smart contract", "web3", "defi", "blockchain", "ethereum", "nft", "wallet"],
    fintech: ["fintech", "payments", "paypal", "stripe", "banking", "trading", "finance", "lending", "quant"],
    health: ["health", "healthcare", "medical", "clinical", "patient", "biotech", "hospital", "diagnosis", "genomic"],
    hardware: ["hardware", "nas", "iot", "embedded", "raspberry", "arduino", "edge", "on-device"],
    students: ["student", "university", "college", "undergraduate", "graduate", "sophomore", "freshman", "campus", "computer science"],
    beginner: ["beginner", "first hackathon", "new to", "entry-level", "junior", "learning"],
    social: ["social good", "public sector", "civic", "open source", "india", "nonprofit", "education", "accessibility"],
    devtools: ["devops", "cli", "sdk", "infrastructure", "kubernetes", "docker", "cloud", "api", "compiler"]
  };

  function detectSkills(text) {
    const t = text.toLowerCase();
    const found = {};
    Object.keys(SKILL_MAP).forEach(function (domain) {
      SKILL_MAP[domain].forEach(function (kw) {
        if (t.indexOf(kw) !== -1) found[domain] = (found[domain] || 0) + 1;
      });
    });
    return found;
  }

  function matchEvents(skills) {
    return HACKBOARD_DATA.open
      .map(function (ev) {
        let s = 0;
        const reasons = [];
        ev.tags.forEach(function (tag) {
          if (skills[tag]) {
            s += 2 + Math.min(skills[tag], 3) * 0.5;
            reasons.push("your " + tag + " experience");
          }
        });
        /* Deadline pressure nudges urgency but never dominates fit. */
        const d = HackBoard.daysLeft(ev.deadline);
        if (d >= 0 && d <= 7) s += 0.5;
        return { ev: ev, s: s, reasons: reasons };
      })
      .filter(function (m) { return m.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 3);
  }

  function replyCvMatch(source) {
    if (!cvText) {
      botReply("I don't have a CV yet. Upload a .txt file with the button above, or just paste your resume text here — I'll read it and tell you which open hackathons fit you best.");
      return;
    }
    const skills = detectSkills(cvText);
    const matches = matchEvents(skills);

    if (!matches.length) {
      botReply("I read your CV but couldn't match it to any open event with confidence. Tell me one thing instead: what do you actually like building — agents, web3, hardware, health tech? I'll route you from there.");
      return;
    }

    const lines = matches.map(function (m, i) {
      return (i + 1) + ". " + eventLine(m.ev) + "\n   Why: " + (m.reasons.join(", ") || "general fit") + ".";
    }).join("\n");
    botReply("Based on your CV" + (source === "upload" ? " (uploaded file)" : "") + ", my top picks:\n\n" + lines +
      "\n\nDeadlines move — verify on the event page before you commit. Want me to go deeper on any of these?");
  }

  function looksLikeCv(text) {
    if (text.length < 280) return false;
    const t = text.toLowerCase();
    return ["resume", "cv", "experience", "education", "skills", "bachelor", "intern", "projects"].some(function (kw) { return t.indexOf(kw) !== -1; });
  }

  function readCvFile(file) {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      botReply("PDFs are hard to read in-browser without heavy libraries — paste the text of your CV here (or save it as .txt and upload that) and I'll match you.");
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      cvText = String(reader.result || "");
      addMsg("📄 Uploaded " + escapeHtml(file.name) + " (" + Math.max(1, Math.round(cvText.length / 1000)) + "k chars)", "user");
      replyCvMatch("upload");
    };
    reader.onerror = function () {
      botReply("That file didn't read cleanly. Try pasting the text directly into the chat.");
    };
    reader.readAsText(file);
  }

  /* ---------- Intent routing ---------- */

  function route(text) {
    const t = text.toLowerCase().trim();

    if (looksLikeCv(text)) {
      cvText = text;
      replyCvMatch("pasted");
      return;
    }

    if (/(^|\s)(hi|hello|hey|yo|sup)\b/.test(t)) {
      botReply("Hey! I'm HackBot. I know everything on this board — ask **what's new**, **what's due**, **biggest prizes**, **who won**, or drop your CV and I'll tell you which hackathon to register in.");
      return;
    }

    if (/(help|what can you|options)/.test(t)) {
      botReply("Things I can do:\n• **What's new** — the latest on this season's events\n• **Deadlines** — everything open, soonest first\n• **Prizes** — biggest pools right now\n• **Winners** — who won, who's pending\n• **CV matching** — upload or paste your resume and I'll rank the hackathons you should register in");
      return;
    }

    if (/(news|new|update|latest|announce)/.test(t)) return replyNews();
    if (/(deadline|due|when|close|last day)/.test(t)) return replyDeadlines();
    if (/(prize|money|pool|payout|reward|cash)/.test(t)) return replyPrizes();
    if (/(win|won|winner|result|outcome)/.test(t)) return replyWinners();

    if (/(cv|resume|match me|which.*(register|join|enter)|recommend|suggest|where should)/.test(t)) {
      if (cvText) return replyCvMatch("pasted");
      botReply("Upload a CV (.txt) with the button above, or paste your resume text here — experience, skills, projects. I'll rank the open hackathons for you.");
      return;
    }

    if (/(thank|thanks|cool|nice|great)/.test(t)) {
      botReply("Anytime. The next deadline on this board is DSH Hacks V2 — go register before it closes.");
      return;
    }

    /* Fallback: still useful. */
    botReply("I track hackathons, not general chat — try **what's new**, **deadlines**, **prizes**, **winners**, or paste your CV for a match.");
  }

  /* ---------- Wiring ---------- */

  function openPanel() {
    panel.classList.add("open");
    if (!greeted) {
      greeted = true;
      botReply("Hey — I'm HackBot 🤖 I talk about everything on this board: **what's new**, **deadlines**, **prizes**, **winners**. Or give me your CV (upload above, or paste it) and I'll tell you which hackathon to register in.", 300);
    }
    input.focus();
  }

  function closePanel() { panel.classList.remove("open"); }

  document.addEventListener("DOMContentLoaded", function () {
    if (!panel) return;
    launcher.addEventListener("click", function () {
      panel.classList.contains("open") ? closePanel() : openPanel();
    });
    closeBtn.addEventListener("click", closePanel);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      addMsg(text, "user");
      input.value = "";
      route(text);
    });

    cvBtn.addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) readCvFile(fileInput.files[0]);
      fileInput.value = "";
    });
    newsBtn.addEventListener("click", replyNews);

    /* Drag-and-drop onto the CV zone. */
    ["dragover", "dragenter"].forEach(function (evt) {
      cvZone.addEventListener(evt, function (e) {
        e.preventDefault();
        cvZone.classList.add("drop-active");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      cvZone.addEventListener(evt, function (e) {
        e.preventDefault();
        cvZone.classList.remove("drop-active");
      });
    });
    cvZone.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        readCvFile(e.dataTransfer.files[0]);
      }
    });
  });
})();
