/* Accessible demo-video generator — turn a project submission into a
 * narrated-style video with subtitles, entirely in the browser.
 *
 * How it works, honestly:
 * - Your title, description, and screenshots are composed into animated
 *   slides on a <canvas>; MediaRecorder records the canvas to a real
 *   downloadable .webm video.
 * - Subtitles are generated automatically from your description
 *   (one caption per sentence, timed to each slide) — burned into the
 *   video AND downloadable as a .vtt sidecar file.
 * - Optional voice-over preview uses the browser's speech synthesis.
 *   Browser speech can't be captured into the recording, so the track
 *   ships silent with burned-in captions — the captions carry the
 *   accessibility, not the audio.
 * - This is automatic composition from your text, not a generative
 *   video model — no GPU server, no API key, nothing uploaded.
 *
 * Depends on nothing outside the browser platform. */

(function () {
  "use strict";

  const TITLE = document.getElementById("vid-title");
  const TAGLINE = document.getElementById("vid-tagline");
  const DESC = document.getElementById("vid-desc");
  const IMAGES = document.getElementById("vid-images");
  const VOICE = document.getElementById("vid-voice");
  const RUN = document.getElementById("vid-generate");
  const RESULT = document.getElementById("vid-result");
  const CANVAS = document.getElementById("vid-canvas");

  const W = 1280, H = 720;
  const ACCENT = "#818cf8";
  const TEXT = "#f8fafc";
  const MUTED = "#94a3b8";

  /* ---------- Text helpers ---------- */

  function sentences(desc) {
    const m = String(desc || "").match(/[^.!?]+[.!?]*/g) || [];
    return m.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach(function (w) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function vttTime(sec) {
    const ms = Math.floor((sec % 1) * 1000);
    const s = Math.floor(sec);
    const p = function (n, l) { return String(n).padStart(l || 2, "0"); };
    return p(Math.floor(s / 3600)) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60) + "." + p(ms, 3);
  }

  /* ---------- Beat plan: title → description sentences → screenshots → outro ---------- */

  function buildBeats(title, tagline, desc, imgs) {
    const beats = [{ type: "title", text: title, sub: tagline, dur: 3 }];
    sentences(desc).slice(0, 8).forEach(function (s) {
      beats.push({ type: "text", text: s, dur: Math.max(2.5, Math.min(6, s.length / 14)) });
    });
    imgs.forEach(function (img) {
      beats.push({ type: "image", img: img, dur: 3.5 });
    });
    beats.push({ type: "outro", text: title, sub: "Demo — generated with HackBoard", dur: 2.5 });
    return beats;
  }

  /* ---------- Drawing ---------- */

  function drawBackground(ctx, t) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    /* Slow drift accent orb */
    const x = W * 0.85 + Math.sin(t / 2600) * 40;
    const y = H * 0.15 + Math.cos(t / 3100) * 30;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, 220);
    rg.addColorStop(0, "rgba(99,102,241,0.35)");
    rg.addColorStop(1, "rgba(99,102,241,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawCaption(ctx, text) {
    if (!text) return;
    ctx.font = "600 30px Inter, system-ui, sans-serif";
    const lines = wrap(ctx, text, W - 160).slice(0, 3);
    const lh = 38;
    const barH = lines.length * lh + 28;
    ctx.fillStyle = "rgba(2,6,23,0.82)";
    ctx.fillRect(60, H - barH - 44, W - 120, barH);
    ctx.fillStyle = TEXT;
    ctx.textAlign = "center";
    lines.forEach(function (l, i) {
      ctx.fillText(l, W / 2, H - barH - 44 + 32 + i * lh);
    });
  }

  function drawCover(ctx, img, progress) {
    const scale = 1.04 + progress * 0.06;  /* slow Ken Burns push */
    const r = Math.max(W / img.width, H / img.height) * scale;
    const dw = img.width * r, dh = img.height * r;
    ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  function drawBeat(ctx, beat, progress) {
    if (beat.type === "image" && beat.img) {
      drawCover(ctx, beat.img, progress);
      return;
    }
    ctx.textAlign = "center";
    if (beat.type === "title" || beat.type === "outro") {
      ctx.fillStyle = TEXT;
      ctx.font = "800 64px Inter, system-ui, sans-serif";
      wrap(ctx, beat.text, W - 200).slice(0, 3).forEach(function (l, i) {
        ctx.fillText(l, W / 2, H / 2 - 30 + i * 74);
      });
      if (beat.sub) {
        ctx.fillStyle = MUTED;
        ctx.font = "500 32px Inter, system-ui, sans-serif";
        wrap(ctx, beat.sub, W - 240).slice(0, 2).forEach(function (l, i) {
          ctx.fillText(l, W / 2, H / 2 + 70 + i * 42);
        });
      }
      /* progress bar accent line */
      ctx.fillStyle = ACCENT;
      ctx.fillRect(W / 2 - 60, H / 2 + 150, 120 * progress, 4);
    } else {
      ctx.fillStyle = TEXT;
      ctx.font = "600 48px Inter, system-ui, sans-serif";
      const lines = wrap(ctx, beat.text, W - 260).slice(0, 5);
      const startY = H / 2 - (lines.length - 1) * 33;
      lines.forEach(function (l, i) {
        ctx.globalAlpha = Math.min(1, progress * 4);
        ctx.fillText(l, W / 2, startY + i * 66);
        ctx.globalAlpha = 1;
      });
    }
  }

  /* ---------- Voice-over preview (not captured into the file) ---------- */

  function speak(text) {
    if (!VOICE.checked || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    speechSynthesis.speak(u);
  }

  /* ---------- Recording ---------- */

  function pickMime() {
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (let i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
    }
    return "";
  }

  function buildVtt(beats) {
    let t = 0;
    const cues = beats.map(function (b, i) {
      const start = t;
      t += b.dur;
      const text = b.type === "image" ? (b.caption || "") : (b.type === "title" || b.type === "outro" ? (b.text + (b.sub ? ". " + b.sub : "")) : b.text);
      return (i + 1) + "\n" + vttTime(start) + " --> " + vttTime(t) + "\n" + text;
    });
    return "WEBVTT\n\n" + cues.join("\n\n") + "\n";
  }

  function generate() {
    const title = TITLE.value.trim();
    const desc = DESC.value.trim();
    if (!title || !desc) {
      RESULT.innerHTML = '<div class="alert alert-error">A title and a short description are the minimum — the captions are generated from them.</div>';
      return;
    }
    if (!window.MediaRecorder || !CANVAS.captureStream) {
      RESULT.innerHTML = '<div class="alert alert-error">This browser can\'t record canvas video (MediaRecorder missing). Chrome, Edge, or Firefox current versions all work.</div>';
      return;
    }

    const files = Array.from(IMAGES.files || []);
    const loaders = files.map(function (f) {
      return new Promise(function (res) {
        const img = new Image();
        img.onload = function () { res(img); };
        img.onerror = function () { res(null); };
        img.src = URL.createObjectURL(f);
      });
    });

    RESULT.innerHTML = '<div class="alert alert-info">Rendering ' +
      (files.length ? "with " + files.length + " screenshot" + (files.length === 1 ? "" : "s") + " — " : "") +
      'keep this tab visible; the recorder captures the canvas live.</div>';

    Promise.all(loaders).then(function (imgs) {
      const beats = buildBeats(title, TAGLINE.value.trim(), desc, imgs.filter(Boolean));
      const totalMs = beats.reduce(function (a, b) { return a + b.dur; }, 0) * 1000;
      const ctx = CANVAS.getContext("2d");

      const mime = pickMime();
      const stream = CANVAS.captureStream(30);
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 4000000 } : undefined);
      const chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        RESULT.innerHTML =
          '<video class="vid-preview" controls src="' + url + '"></video>' +
          '<div class="vid-actions">' +
            '<a class="btn btn-primary" download="demo-video.webm" href="' + url + '">⬇ Download video (.webm)</a>' +
            '<a class="btn btn-secondary" download="demo-captions.vtt" href="' + URL.createObjectURL(new Blob([buildVtt(beats)], { type: "text/vtt" })) + '">⬇ Download captions (.vtt)</a>' +
          '</div>' +
          '<p class="text-muted text-sm" style="margin-top: var(--space-2);">Burned-in captions plus a WebVTT sidecar — upload the .vtt wherever the video is hosted. Generated locally in your browser; nothing was uploaded.</p>';
      };

      rec.start(250);
      const t0 = performance.now();
      let lastSpoken = -1;

      (function frame(now) {
        const t = now - t0;
        let acc = 0, idx = 0;
        for (let i = 0; i < beats.length; i++) {
          const d = beats[i].dur * 1000;
          if (t < acc + d) { idx = i; break; }
          acc += d;
          idx = i;
        }
        const beat = beats[idx];
        const local = Math.min(1, (t - acc) / (beat.dur * 1000));

        drawBackground(ctx, t);
        drawBeat(ctx, beat, local);
        drawCaption(ctx, beat.type === "image" ? "" : beat.text);

        if (idx !== lastSpoken) {
          lastSpoken = idx;
          speak(beat.type === "title" || beat.type === "outro" ? beat.text + ". " + (beat.sub || "") : beat.text);
        }

        if (t >= totalMs) { rec.stop(); speechSynthesis.cancel(); return; }
        requestAnimationFrame(frame);
      })(t0);
    });
  }

  /* ---------- Idle preview frame ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    if (!CANVAS) return;
    const ctx = CANVAS.getContext("2d");
    drawBackground(ctx, 0);
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.font = "500 30px Inter, system-ui, sans-serif";
    ctx.fillText("Your video renders here — fill the form and hit Generate", W / 2, H / 2);

    RUN.addEventListener("click", generate);

    IMAGES.addEventListener("change", function () {
      const n = (IMAGES.files || []).length;
      if (n) {
        document.getElementById("vid-image-note").textContent =
          n + " screenshot" + (n === 1 ? "" : "s") + " will play" + (n === 1 ? "" : " in order") + " after the description beats.";
      }
    });
  });
})();
