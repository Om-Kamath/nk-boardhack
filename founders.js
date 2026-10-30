/* Founders & the VC lens — founder spotlights with AI-generated
 * "explain the product" videos, built on the same canvas + MediaRecorder
 * machinery as the demo-video generator.
 *
 * Honesty rules baked in:
 * - The SalesShortcut story is real (sourced from tracked data.js notes /
 *   Devpost's blog) but the portrait is an AI illustration, NOT the real
 *   founders — every card says so.
 * - "Amara" and "Dev" are clearly fictional composite personas built from
 *   real sponsor-track patterns (HackMoney 2026, CrowdStrike AgentWorks).
 *   No real person is quoted, named, or voiced.
 * - Videos are composed locally: illustrated portrait + scripted narration
 *   captions, recorded to .webm with a .vtt sidecar. Nothing is uploaded. */

(function () {
  "use strict";

  const W = 1280, H = 720;

  const FOUNDERS = [
    {
      id: "salesshortcut",
      name: "SalesShortcut founding team",
      tag: "Grand prize — Agent Development Kit Hackathon, with Google Cloud",
      story: "The one every builder should study: an agent-oriented sales tool that didn't stay a demo. It became a company with paying customers, and Devpost's blog cites it as the model hackathon outcome — a tool, not a demo.",
      real: true,
      img: "assets/founder-sales.png",
      narration: [
        "We walked in with one rule: build a tool we would actually use on Monday morning.",
        "So instead of a clever demo, we shipped an agent that does real sales work on real customer data.",
        "By the final day it wasn't a hackathon project anymore — it had paying customers.",
        "Devpost's blog now holds it up as the model outcome. A tool, not a demo. That's the bar."
      ]
    },
    {
      id: "amara",
      name: "Amara — fintech agent builder",
      tag: "Fictional persona, built from the real HackMoney 2026 pattern",
      story: "A composite persona, not a real person. At HackMoney 2026 the $75K pool concentrated in on-chain finance primitives and AI-assisted payment flows — the same pattern repeated at ETHOnline and Tokyo. Amara is that trend seen through one builder's eyes.",
      real: false,
      img: "assets/founder-fintech.png",
      narration: [
        "Hi, I'm Amara — and to be clear from the start, I'm an illustrated persona, not a real founder.",
        "I build payment agents: contracts that move money the moment conditions are met, with no human in the loop.",
        "Sponsors keep paying for the same shape of build — on-chain primitives with an agent layer on top.",
        "My advice: pick the track where the money keeps landing, and build the boring, reliable version of it."
      ]
    },
    {
      id: "dev",
      name: "Dev — security agent builder",
      tag: "Fictional persona, built from the CrowdStrike AgentWorks watch",
      story: "A composite persona, not a real person. CrowdStrike AgentWorks winners just landed — security-agent builds on Falcon MCP. Which agent shape CrowdStrike paid for is a live signal about their 2027 sponsor tracks.",
      real: false,
      img: "assets/founder-sec.png",
      narration: [
        "Hey, I'm Dev — also an illustrated persona, and equally honest about it.",
        "I build security agents on Falcon MCP — the kind that flag the weird login before any human notices.",
        "Sponsors pay for agents that map onto what they already sell. Watch what CrowdStrike paid for, not what it demoed.",
        "That's the whole trick: build for the sponsor's roadmap, not the leaderboard."
      ]
    }
  ];

  /* ---------- shared canvas helpers (same pattern as video.js) ---------- */

  function sentences(lines) { return lines; }

  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach(function (w) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function vttTime(sec) {
    const ms = Math.floor((sec % 1) * 1000), s = Math.floor(sec);
    const p = function (n, l) { return String(n).padStart(l || 2, "0"); };
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60) + "." + p(ms, 3);
  }

  function pickMime() {
    const c = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (let i = 0; i < c.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i];
    }
    return "";
  }

  /* ---------- per-founder video ---------- */

  function playFounderStory(f, mount) {
    if (!window.MediaRecorder) {
      mount.innerHTML = '<div class="alert alert-error">This browser can\'t record canvas video.</div>';
      return;
    }
    const img = new Image();
    img.onload = function () { record(img); };
    img.onerror = function () {
      mount.innerHTML = '<div class="alert alert-error">Portrait failed to load.</div>';
    };
    img.src = f.img;

    function record(portrait) {
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      canvas.className = "vid-preview";
      const ctx = canvas.getContext("2d");

      const beats = f.narration.map(function (line, i) {
        return { text: line, dur: Math.max(2.8, Math.min(6, line.length / 13)), isLast: i === f.narration.length - 1 };
      });
      const totalMs = beats.reduce(function (a, b) { return a + b.dur; }, 0) * 1000;

      function drawBackground(t) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#0f172a");
        g.addColorStop(1, "#1e293b");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      function drawPortrait(local) {
        /* portrait occupies the left 45%, slow zoom */
        const zoneW = W * 0.45;
        const scale = 1.02 + local * 0.05;
        const r = Math.max(zoneW / portrait.width, H / portrait.height) * scale;
        const dw = portrait.width * r, dh = portrait.height * r;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, zoneW, H);
        ctx.clip();
        ctx.drawImage(portrait, (zoneW - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.restore();
        /* soft divider */
        const g = ctx.createLinearGradient(zoneW - 40, 0, zoneW + 40, 0);
        g.addColorStop(0, "rgba(15,23,42,0)");
        g.addColorStop(1, "#0f172a");
        ctx.fillStyle = g;
        ctx.fillRect(zoneW - 40, 0, 80, H);
      }

      function drawCaption(text) {
        ctx.textAlign = "left";
        ctx.font = "600 32px Inter, system-ui, sans-serif";
        const lines = wrap(ctx, text, W * 0.5).slice(0, 4);
        const lh = 40;
        const barH = lines.length * lh + 26;
        ctx.fillStyle = "rgba(2,6,23,0.82)";
        ctx.fillRect(W * 0.45 + 30, H - barH - 40, W * 0.5, barH);
        ctx.fillStyle = "#f8fafc";
        lines.forEach(function (l, i) {
          ctx.fillText(l, W * 0.45 + 50, H - barH - 40 + 30 + i * lh);
        });
      }

      function drawTag() {
        ctx.textAlign = "right";
        ctx.font = "500 22px Inter, system-ui, sans-serif";
        ctx.fillStyle = "rgba(148,163,184,0.9)";
        ctx.fillText("AI-generated illustration — not real footage", W - 40, 50);
        ctx.font = "700 30px Inter, system-ui, sans-serif";
        ctx.fillStyle = "#f8fafc";
        ctx.fillText(f.name, W - 40, 90);
      }

      const stream = canvas.captureStream(30);
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3500000 } : undefined);
      const chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }));

        let t = 0;
        const vtt = "WEBVTT\n\n" + beats.map(function (b, i) {
          const start = t; t += b.dur;
          return (i + 1) + "\n" + vttTime(start) + " --> " + vttTime(t) + "\n" + b.text;
        }).join("\n\n") + "\n";

        mount.innerHTML =
          '<video class="vid-preview" controls src="' + url + '"></video>' +
          '<div class="vid-actions">' +
            '<a class="btn btn-primary" download="' + f.id + '-founder-story.webm" href="' + url + '">⬇ Download video (.webm)</a>' +
            '<a class="btn btn-secondary" download="' + f.id + '-captions.vtt" href="' + URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })) + '">⬇ Captions (.vtt)</a>' +
          "</div>" +
          '<p class="text-muted text-sm" style="margin-top: var(--space-2);">AI-generated: illustrated portrait and scripted narration composed from tracked public info' +
          (f.real ? " — the portrait is NOT the real founding team." : " — the persona is fictional by design.") + "</p>";
      };

      mount.innerHTML = '<div class="alert alert-info">Recording — a few seconds, hang tight…</div>';
      rec.start(250);
      const t0 = performance.now();
      let acc = 0, idx = 0;

      (function frame(now) {
        const t = now - t0;
        acc = 0; idx = 0;
        for (let i = 0; i < beats.length; i++) {
          const d = beats[i].dur * 1000;
          if (t < acc + d) { idx = i; break; }
          acc += d; idx = i;
        }
        const beat = beats[idx];
        const local = Math.min(1, (t - acc) / (beat.dur * 1000));
        drawBackground(t);
        drawPortrait(local);
        drawTag();
        drawCaption(beat.text);
        if (t >= totalMs) { rec.stop(); return; }
        requestAnimationFrame(frame);
      })(t0);
    }
  }

  /* ---------- voice preview (speechSynthesis — spoken, never recorded or uploaded) ---------- */

  let voiceBtn = null; /* button of the narration currently speaking */

  function stopVoice() {
    if (window.speechSynthesis) speechSynthesis.cancel();
    if (voiceBtn) { voiceBtn.textContent = "🎙 Voice preview"; voiceBtn = null; }
  }

  function toggleFounderVoice(f, btn) {
    if (!("speechSynthesis" in window) || !window.SpeechSynthesisUtterance) {
      if (window.HackBoard) window.HackBoard.toast("Voice preview isn't supported in this browser.");
      return; /* graceful no-op */
    }
    if (voiceBtn === btn) { stopVoice(); return; } /* re-click while speaking → cancel */
    stopVoice();
    voiceBtn = btn;
    btn.textContent = "⏹ Stop voice";
    let remaining = f.narration.length;
    f.narration.forEach(function (line) {
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.98;
      const done = function () {
        remaining -= 1;
        if (remaining <= 0 && voiceBtn === btn) stopVoice();
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  /* ---------- rendering ---------- */

  function renderCards() {
    const grid = document.getElementById("founder-cards");
    if (!grid) return;
    grid.innerHTML = FOUNDERS.map(function (f) {
      return '<article class="card founder-card">' +
        '<div class="founder-photo-wrap">' +
          '<img class="founder-photo" src="' + f.img + '" alt="AI-generated illustration of ' + f.name + '">' +
          '<span class="badge badge-info founder-badge">AI illustration</span>' +
        "</div>" +
        '<h3>' + f.name + "</h3>" +
        '<p class="founder-tag text-muted text-sm">' + f.tag + "</p>" +
        '<p class="founder-story">' + f.story + "</p>" +
        '<button class="btn btn-secondary founder-play" data-founder="' + f.id + '">▶ Watch them explain it (AI video)</button>' +
        '<button class="btn btn-ghost founder-voice" data-founder="' + f.id + '">🎙 Voice preview</button>' +
        '<div class="founder-video" id="fv-' + f.id + '"></div>' +
      "</article>";
    }).join("");

    grid.querySelectorAll(".founder-play").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const f = FOUNDERS.find(function (x) { return x.id === btn.dataset.founder; });
        playFounderStory(f, document.getElementById("fv-" + f.id));
      });
    });

    grid.querySelectorAll(".founder-voice").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const f = FOUNDERS.find(function (x) { return x.id === btn.dataset.founder; });
        toggleFounderVoice(f, btn);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", renderCards);
})();
