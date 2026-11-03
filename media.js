/* HackBoard media batch — charts, generators, exports, confetti, sound toggle.
 *
 * Every module lazy-inits on DOMContentLoaded and no-ops when its DOM section
 * is absent, so the file is safe to load before the lead wires the #media
 * section. Colors for charts/timeline are read from the design tokens at
 * draw time and redrawn when documentElement's theme class flips, so both
 * light and dark themes stay legible.
 *
 * Everything is local: no uploads, no network calls. Depends on data.js
 * (HACKBOARD_DATA) and app.js (window.HackBoard); predictor share card
 * reuses window.HackBoardPredictor.run for the same data the UI shows. */

(function () {
  "use strict";

  /* ---------- shared helpers ---------- */

  function cssVar(name, fallback) {
    try {
      let v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || "").trim();
      /* unresolved var() chains mean the token is missing — use the fallback */
      if (v && v.indexOf("var(") !== 0) return v;
    } catch (e) { /* CSSOM unavailable — fall through */ }
    return fallback;
  }

  function palette() {
    /* documentElement.classList is the theme source of truth (theme.js
     * sets html.dark / html.light); tokens resolve theme-correct colors. */
    return {
      isDark: document.documentElement.classList.contains("dark"),
      base: cssVar("--surface-base", "#ffffff"),
      text: cssVar("--text-primary", "#080808"),
      sub: cssVar("--text-secondary", "rgba(0,0,0,0.64)"),
      line: cssVar("--border-default", "rgba(0,0,0,0.08)"),
      accent: cssVar("--border-focus", "#29a2ff")
    };
  }

  const FONT = "Inter, system-ui, sans-serif";

  function toast(msg) {
    if (window.HackBoard && window.HackBoard.toast) { window.HackBoard.toast(msg); return; }
    /* eslint-disable no-console */
    console.log("[media] " + msg);
  }

  function announce(msg) {
    if (window.HackBoard && window.HackBoard.announce) window.HackBoard.announce(msg);
  }

  /* dpr-aware backing store; drawing stays in logical coordinates */
  function fitCanvas(canvas, w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
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

  function truncateTo(ctx, text, maxW) {
    let s = String(text);
    if (ctx.measureText(s).width <= maxW) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }

  function fmtUsd(n) { return "$" + Math.round(n).toLocaleString("en-US"); }

  function downloadPng(canvas, filename) {
    if (!canvas.toBlob) { toast("PNG export isn't supported in this browser."); return; }
    canvas.toBlob(function (blob) {
      if (!blob) { toast("PNG export failed — try again."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
      toast("PNG downloaded.");
    }, "image/png");
  }

  function copyText(text, okMsg, fallbackShow) {
    const manual = function () {
      if (fallbackShow) fallbackShow();
      toast("Clipboard unavailable — copy from the text shown below.");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, manual);
    } else manual();
  }

  /* redraw registry — theme flips re-render registered charts */
  const onThemeFlip = [];
  if ("MutationObserver" in window) {
    let queued = false;
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        onThemeFlip.forEach(function (fn) { fn(); });
      });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  /* ---------- module: sponsor-track radar ---------- */

  function tagFreqs() {
    const freq = {};
    HACKBOARD_DATA.open.forEach(function (ev) {
      (ev.tags || []).forEach(function (t) { freq[t] = (freq[t] || 0) + 1; });
    });
    return Object.keys(freq)
      .map(function (t) { return { tag: t, n: freq[t] }; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, 8);
  }

  function drawRadar(canvas, data) {
    const W = 640, H = 420, pad = 110, top = 26, bottom = 30;
    const p = palette();
    const ctx = fitCanvas(canvas, W, H);
    ctx.clearRect(0, 0, W, H);

    ctx.textBaseline = "middle";
    ctx.font = "500 13px " + FONT;

    if (!data.length) {
      ctx.fillStyle = p.sub;
      ctx.textAlign = "center";
      ctx.fillText("No open events to chart yet.", W / 2, H / 2);
      return;
    }

    const cx = W / 2, cy = top + (H - top - bottom) / 2, R = Math.min((W - pad * 2) / 2, (H - top - bottom) / 2);
    const n = data.length;
    const max = data[0].n;
    const angle = function (i) { return -Math.PI / 2 + (i * 2 * Math.PI) / n; };
    const pt = function (i, frac) {
      return { x: cx + Math.cos(angle(i)) * R * frac, y: cy + Math.sin(angle(i)) * R * frac };
    };

    /* rings + spokes */
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(function (f) {
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const q = pt(i % n, f);
        if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    });
    for (let i = 0; i < n; i++) {
      const q = pt(i, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    /* axis labels — tag name + count */
    for (let i = 0; i < n; i++) {
      const a = angle(i);
      const lx = cx + Math.cos(a) * (R + 14);
      const ly = cy + Math.sin(a) * (R + 14);
      ctx.fillStyle = p.text;
      ctx.textAlign = Math.cos(a) > 0.35 ? "left" : Math.cos(a) < -0.35 ? "right" : "center";
      ctx.textBaseline = Math.sin(a) > 0.35 ? "top" : Math.sin(a) < -0.35 ? "bottom" : "middle";
      ctx.fillText(data[i].tag + " · " + data[i].n, lx, ly);
    }

    /* data polygon */
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const q = pt(i % n, data[i % n].n / max);
      if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = p.accent;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const q = pt(i, data[i].n / max);
      ctx.beginPath();
      ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = p.accent;
      ctx.fill();
    }
  }

  function initRadar() {
    const canvas = document.getElementById("radar-chart");
    if (!canvas) return;
    const data = tagFreqs();
    drawRadar(canvas, data);
    const note = document.getElementById("radar-note");
    if (note) {
      note.textContent = data.length
        ? "Top " + data.length + " tracks across " + HACKBOARD_DATA.open.length + " open events — “" +
          data[0].tag + "” leads with " + data[0].n + " listings."
        : "";
    }
    onThemeFlip.push(function () { drawRadar(canvas, data); });
  }

  /* ---------- module: prize-pool horizontal bars ---------- */

  function niceStep(rough) {
    const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
    const unit = rough / pow;
    const mult = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10;
    return mult * pow;
  }

  function drawPrizeBars(canvas, rows) {
    const W = 640, H = 420, left = 185, right = 95, top = 18, bottom = 50;
    const p = palette();
    const ctx = fitCanvas(canvas, W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = "middle";

    if (!rows.length) {
      ctx.fillStyle = p.sub;
      ctx.font = "500 14px " + FONT;
      ctx.textAlign = "center";
      ctx.fillText("No announced cash pools to chart yet.", W / 2, H / 2);
      return;
    }

    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const slot = plotH / rows.length;
    const barH = Math.min(26, slot * 0.6);
    const max = rows[0].value;
    const step = niceStep(max / 4);
    const xMax = Math.ceil(max / step) * step;
    const xOf = function (v) { return left + (v / xMax) * plotW; };

    /* gridlines + x ticks */
    ctx.font = "500 12px " + FONT;
    ctx.fillStyle = p.sub;
    ctx.textAlign = "center";
    for (let v = 0; v <= xMax; v += step) {
      const x = xOf(v);
      ctx.strokeStyle = p.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotH);
      ctx.stroke();
      ctx.fillText(fmtUsd(v), x, H - bottom / 2);
    }

    /* bars + names + value labels */
    rows.forEach(function (r, i) {
      const y = top + i * slot + (slot - barH) / 2;
      const w = Math.max(2, (r.value / xMax) * plotW);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = p.accent;
      ctx.fillRect(left, y, w, barH);
      ctx.globalAlpha = 1;

      ctx.font = "600 12px " + FONT;
      ctx.fillStyle = p.text;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(truncateTo(ctx, r.name, left - 14), left - 10, y + barH / 2);

      ctx.font = "500 12px " + FONT;
      ctx.fillStyle = p.sub;
      ctx.textAlign = "left";
      ctx.fillText(fmtUsd(r.value), left + w + 8, y + barH / 2);
    });

    /* axis titles */
    ctx.font = "600 12px " + FONT;
    ctx.fillStyle = p.sub;
    ctx.textAlign = "center";
    ctx.fillText("Announced prize pool (USD)", left + plotW / 2, H - 10);
  }

  function initPrizeChart() {
    const canvas = document.getElementById("prize-chart");
    if (!canvas) return;
    const value = function (ev) {
      return window.HackBoard && window.HackBoard.prizeValue ? window.HackBoard.prizeValue(ev) : 0;
    };
    const rows = HACKBOARD_DATA.open
      .map(function (ev) { return { name: ev.name, value: value(ev) }; })
      .filter(function (r) { return r.value > 0; })
      .sort(function (a, b) { return b.value - a.value; })
      .slice(0, 8);
    drawPrizeBars(canvas, rows);
    onThemeFlip.push(function () { drawPrizeBars(canvas, rows); });
  }

  /* ---------- module: season-recap timeline (DOM) ---------- */

  function buildTimeline(root) {
    const events = HACKBOARD_DATA.concluded.slice()
      .sort(function (a, b) { return a.deadline < b.deadline ? -1 : 1; });

    if (!events.length) {
      root.innerHTML = '<p class="text-muted text-sm">No concluded events yet this season — the recap timeline will fill in as deadlines pass.</p>';
      return;
    }

    const p = palette();
    const fmt = window.HackBoard && window.HackBoard.fmtDate
      ? window.HackBoard.fmtDate
      : function (iso) { return iso; };

    const track = document.createElement("div");
    track.setAttribute("role", "list");
    track.style.minWidth = Math.max(760, events.length * 150) + "px";
    track.style.position = "relative";
    track.style.paddingTop = "36px";

    const rail = document.createElement("div");
    rail.style.cssText = "position:absolute;top:13px;left:8px;right:18px;height:2px;background:" + p.line + ";";
    const arrow = document.createElement("div");
    arrow.style.cssText = "position:absolute;top:3px;right:2px;color:" + p.line + ";font-size:16px;line-height:1;";
    arrow.textContent = "▸";
    track.appendChild(rail);
    track.appendChild(arrow);

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:var(--space-2);position:relative;";
    events.forEach(function (ev) {
      const item = document.createElement("div");
      item.setAttribute("role", "listitem");
      item.style.cssText = "flex:1;min-width:130px;text-align:center;padding:0 6px;";
      item.innerHTML =
        '<span style="display:block;width:12px;height:12px;border-radius:50%;margin:-29px auto 8px;' +
          'background:' + p.accent + ';box-shadow:0 0 0 3px ' + p.base + ';"></span>' +
        '<div style="font-size:12px;color:' + p.sub + ';">' + fmt(ev.deadline) + "</div>" +
        '<div style="font-size:13px;font-weight:600;color:' + p.text + ';">' + ev.name + "</div>" +
        '<div style="font-size:12px;color:' + p.sub + ';">' + ev.prize + "</div>";
      row.appendChild(item);
    });

    track.appendChild(row);
    root.innerHTML = "";
    root.appendChild(track);
  }

  function initTimeline() {
    const root = document.getElementById("timeline-out");
    if (!root) return;
    buildTimeline(root);
    onThemeFlip.push(function () { buildTimeline(root); });
  }

  /* ---------- module: poster generator ---------- */

  const POSTER_W = 1200, POSTER_H = 675;

  function drawPoster(canvas, title, tagline) {
    const ctx = canvas.getContext("2d");
    const W = POSTER_W, H = POSTER_H;

    /* pastel gradient background */
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#ffd9e8");
    g.addColorStop(0.5, "#cfe8ff");
    g.addColorStop(1, "#d9ffe3");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    /* soft decorative circles */
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath(); ctx.arc(W - 90, 80, 130, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(70, H - 60, 100, 0, Math.PI * 2); ctx.fill();

    /* brand chip */
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    roundRect(ctx, 48, 44, 210, 52, 26);
    ctx.fill();
    ctx.fillStyle = "#312e81";
    ctx.font = "700 26px " + FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("⚡ HackBoard", 72, 71);

    /* title */
    ctx.fillStyle = "#1f2937";
    ctx.font = "800 68px " + FONT;
    ctx.textAlign = "center";
    const tLines = wrapText(ctx, title || "Your project name", W - 200).slice(0, 3);
    let ty = 220 + (3 - Math.min(3, tLines.length)) * 30;
    tLines.forEach(function (l) { ctx.fillText(l, W / 2, ty); ty += 80; });

    /* tagline */
    ctx.fillStyle = "#475569";
    ctx.font = "500 32px " + FONT;
    const sLines = tagline ? wrapText(ctx, tagline, W - 320).slice(0, 2) : [];
    let sy = ty - 30;
    sLines.forEach(function (l) { ctx.fillText(l, W / 2, sy); sy += 44; });
    if (!sLines.length) {
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("what it does in one line", W / 2, ty - 30);
    }

    /* footer */
    ctx.strokeStyle = "rgba(31,41,55,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W / 2 - 130, H - 92); ctx.lineTo(W / 2 + 130, H - 92); ctx.stroke();
    ctx.fillStyle = "#312e81";
    ctx.font = "600 26px " + FONT;
    ctx.fillText("built at a hackathon ⚡", W / 2, H - 54);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function posterCaption(title, tagline) {
    const t = title || "Your project name";
    const s = tagline ? " — " + tagline : "";
    return "“" + t + s + "” — built at a hackathon ⚡ #HackBoard";
  }

  function initPoster() {
    const canvas = document.getElementById("poster-canvas");
    const titleIn = document.getElementById("poster-title");
    const tagIn = document.getElementById("poster-tagline");
    if (!canvas || !titleIn || !tagIn) return;

    const redraw = function () {
      drawPoster(canvas, titleIn.value.trim(), tagIn.value.trim());
    };
    redraw();
    titleIn.addEventListener("input", redraw);
    tagIn.addEventListener("input", redraw);

    const dl = document.getElementById("poster-download");
    if (dl) dl.addEventListener("click", function () {
      redraw();
      downloadPng(canvas, "hackboard-poster.png");
    });

    const cap = document.getElementById("poster-copy-caption");
    if (cap) cap.addEventListener("click", function () {
      const text = posterCaption(titleIn.value.trim(), tagIn.value.trim());
      const show = function () {
        const out = document.getElementById("poster-caption-text");
        if (out) out.textContent = text;
      };
      copyText(text, "Caption copied — pair it with the poster.", show);
      show();
    });
  }

  /* ---------- module: sticker generator ---------- */

  const STICKER_SIZE = 600;
  const PASTELS = ["#ffd9e8", "#cfe8ff", "#d9ffe3", "#fff3c4", "#e7dbff"];
  /* classic bolt in a 24×22 box */
  const BOLT = [[13, 0], [3, 12.5], [10, 12.5], [9, 22], [19, 9.5], [12, 9.5]];

  function pickPastel(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return PASTELS[h % PASTELS.length];
  }

  function drawSticker(canvas, name) {
    const ctx = canvas.getContext("2d");
    const S = STICKER_SIZE, cx = S / 2, cy = S / 2;
    const pastel = pickPastel(name || "HackBoard");
    ctx.clearRect(0, 0, S, S);

    /* die-cut circle + white ring + dashed inner ring */
    ctx.beginPath(); ctx.arc(cx, cy, 285, 0, Math.PI * 2);
    ctx.fillStyle = pastel; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 262, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 14; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 236, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]); ctx.stroke(); ctx.setLineDash([]);

    /* lightning bolt */
    const bs = 6.4, bw = 22 * bs, bx = cx - bw / 2 - 6, by = 108;
    ctx.beginPath();
    BOLT.forEach(function (pt, i) {
      const px = bx + pt[0] * bs, py = by + pt[1] * bs;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = "#fbbf24";
    ctx.fill();
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.stroke();

    /* event name */
    ctx.fillStyle = "#1f2937";
    ctx.font = "700 46px " + FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapText(ctx, name || "HackBoard", 360).slice(0, 3);
    let ty = cy + 55 + (3 - Math.min(3, lines.length)) * 10;
    lines.forEach(function (l) { ctx.fillText(l, cx, ty); ty += 54; });
  }

  function initSticker() {
    const canvas = document.getElementById("sticker-canvas");
    const nameIn = document.getElementById("sticker-name");
    if (!canvas || !nameIn) return;

    const list = document.getElementById("sticker-events");
    if (list) {
      list.innerHTML = "";
      HACKBOARD_DATA.open.forEach(function (ev) {
        const opt = document.createElement("option");
        opt.value = ev.name;
        list.appendChild(opt);
      });
    }

    const redraw = function () { drawSticker(canvas, nameIn.value.trim()); };
    redraw();
    nameIn.addEventListener("input", redraw);

    const dl = document.getElementById("sticker-download");
    if (dl) dl.addEventListener("click", function () {
      redraw();
      downloadPng(canvas, "hackboard-sticker.png");
    });
  }

  /* ---------- module: HackBot chat export ---------- */

  function domToMarkdown(node) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return "";
    const tag = node.tagName;
    if (tag === "BR") return "\n";
    const kids = Array.prototype.map.call(node.childNodes, domToMarkdown).join("");
    if (tag === "A") {
      const label = node.textContent.replace(/\s+↗\s*$/, "");
      return "[" + label + "](" + node.href + ")";
    }
    if (tag === "STRONG" || tag === "B") return "**" + kids + "**";
    if (tag === "EM" || tag === "I") return "*" + kids + "*";
    if (tag === "CODE") return "`" + kids + "`";
    return kids;
  }

  function chatToMarkdown() {
    const box = document.getElementById("agent-messages");
    if (!box) return null;
    const msgs = Array.prototype.filter.call(box.querySelectorAll(".msg"), function (m) {
      return !m.classList.contains("typing") && domToMarkdown(m).trim();
    });
    if (!msgs.length) return null;
    const lines = msgs.map(function (m) {
      const who = m.classList.contains("msg-user") ? "You" : "HackBot";
      return "**" + who + ":** " + domToMarkdown(m).trim();
    });
    return [
      "# HackBot chat — exported from HackBoard",
      "_" + new Date().toISOString().slice(0, 10) + " · device-local chat, nothing was uploaded._",
      "",
      lines.join("\n\n"),
      ""
    ].join("\n");
  }

  function initChatExport() {
    const btn = document.getElementById("chat-export");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const md = chatToMarkdown();
      if (!md) { toast("Open HackBot and chat first — nothing to export yet."); return; }
      if (window.HackBoard && window.HackBoard.downloadFile) {
        window.HackBoard.downloadFile("hackbot-chat-" + new Date().toISOString().slice(0, 10) + ".md", md, "text/markdown");
        toast("Chat exported as Markdown.");
      } else {
        toast("Export unavailable — HackBoard core didn't load.");
      }
    });
  }

  /* ---------- module: predictor share card ---------- */

  const CARD_W = 1200, CARD_H = 675;

  function predDataFromDom(track, venue) {
    /* fallback when the predictor module didn't load — parse what's on screen */
    const out = document.getElementById("pred-result");
    if (!out) return null;
    const h4 = out.querySelector("h4");
    if (!h4) return null;
    const m = (h4.textContent || "").match(/^(.*?)\s*—\s*(\d+)%\s*fit$/);
    const verdict = out.querySelector(".verdict");
    const matches = Array.prototype.map.call(out.querySelectorAll("a"), function (a) {
      return a.textContent.replace(/\s+↗\s*$/, "");
    }).filter(Boolean).slice(0, 3);
    return {
      pct: m ? Number(m[2]) : 0,
      label: m ? m[1] : (h4.textContent || "").trim(),
      archetype: [],
      venueNote: verdict ? verdict.textContent.trim() : "",
      matches: matches,
      track: track, venue: venue
    };
  }

  function drawPredictorCard(canvas, d, trackLabel, venueLabel) {
    const ctx = fitCanvas(canvas, CARD_W, CARD_H);
    const W = CARD_W, H = CARD_H;

    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0f172a");
    g.addColorStop(1, "#1e293b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#93c5fd";
    ctx.font = "700 26px " + FONT;
    ctx.fillText("⚡ HackBoard — win predictor", 60, 58);

    ctx.textAlign = "center";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "500 24px " + FONT;
    ctx.fillText("Track: " + trackLabel + " · Venue: " + venueLabel, W / 2, 118);

    ctx.fillStyle = "#93c5fd";
    ctx.font = "800 120px " + FONT;
    ctx.fillText(d.pct + "% fit", W / 2, 232);

    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 46px " + FONT;
    ctx.fillText(d.label, W / 2, 316);

    /* venue note */
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "500 24px " + FONT;
    const note = wrapText(ctx, d.venueNote || "", W - 200).slice(0, 2);
    let y = 372;
    note.forEach(function (l) { ctx.fillText(l, W / 2, y); y += 34; });

    /* what to build */
    if (d.archetype && d.archetype.length) {
      ctx.textAlign = "left";
      ctx.fillStyle = "#f8fafc";
      ctx.font = "600 24px " + FONT;
      ctx.fillText("What to build:", 80, y + 10);
      let by = y + 48;
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "400 22px " + FONT;
      d.archetype.slice(0, 2).forEach(function (a) {
        wrapText(ctx, "• " + a, W - 180).slice(0, 2).forEach(function (l) {
          ctx.fillText(l, 80, by);
          by += 30;
        });
      });
    }

    /* matches */
    if (d.matches && d.matches.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#94a3b8";
      ctx.font = "500 22px " + FONT;
      ctx.fillText("Best open events: " + d.matches.join(" · "), W / 2, H - 96);
    }

    ctx.fillStyle = "#64748b";
    ctx.font = "400 18px " + FONT;
    ctx.fillText("Directional read from tracked 2026 winner data — verify on the event page.", W / 2, H - 48);
  }

  function initPredictorCard() {
    const btn = document.getElementById("pred-card");
    if (!btn) return;
    btn.addEventListener("click", function () {
      const trackSel = document.getElementById("pred-track");
      const venueSel = document.getElementById("pred-venue");
      if (!trackSel || !venueSel) return;
      const track = trackSel.value;
      const venue = venueSel.value;
      const trackLabel = trackSel.options[trackSel.selectedIndex].text;
      const venueLabel = venueSel.options[venueSel.selectedIndex].text;

      /* #pred-result gate: share what the user actually sees */
      const out = document.getElementById("pred-result");
      if (!out || !out.querySelector("h4")) { toast("Run the predictor first — then share the card."); return; }

      let d = window.HackBoardPredictor && window.HackBoardPredictor.run
        ? window.HackBoardPredictor.run(track, venue)
        : null;
      if (!d) d = predDataFromDom(track, venue);
      if (!d) { toast("Couldn't read the prediction — run it again."); return; }
      d.track = track; d.venue = venue;

      const canvas = document.createElement("canvas");
      drawPredictorCard(canvas, d, trackLabel, venueLabel);
      downloadPng(canvas, "predictor-share.png");
    });
  }

  /* ---------- module: RSVP confetti ---------- */

  let confettiState = null; /* { canvas, raf } — one burst at a time */

  function HackBoardCelebrate() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10000;";
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    document.body.appendChild(canvas);

    /* cancel any burst still on screen */
    if (confettiState) {
      cancelAnimationFrame(confettiState.raf);
      if (confettiState.canvas.parentNode) confettiState.canvas.parentNode.removeChild(confettiState.canvas);
    }

    const colors = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb7185"];
    const parts = [];
    const cannons = [{ x: 0, y: H, dir: 1 }, { x: W, y: H, dir: -1 }];
    cannons.forEach(function (c) {
      for (let i = 0; i < 70; i++) {
        parts.push({
          x: c.x, y: c.y,
          vx: c.dir * (2 + Math.random() * 7),
          vy: -(9 + Math.random() * 8),
          size: 5 + Math.random() * 6,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.3,
          color: colors[Math.floor(Math.random() * colors.length)],
          round: Math.random() < 0.3
        });
      }
    });

    const t0 = performance.now();
    const DUR = 2200;
    function frame(now) {
      const t = now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - DUR * 0.7) / (DUR * 0.3));
      let alive = false;
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.rot += p.vr;
        if (p.y < H + 20) alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      if (t < DUR && alive) {
        confettiState.raf = requestAnimationFrame(frame);
      } else {
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        confettiState = null;
      }
    }
    confettiState = { canvas: canvas, raf: requestAnimationFrame(frame) };
  }

  /* RSVP wiring happens in app.js at click time — expose immediately so no
   * celebration is missed between DOMContentLoaded and media init. */
  window.HackBoardCelebrate = HackBoardCelebrate;

  /* ---------- module: sound toggle (bundle.js reads localStorage 'hb-sound') ---------- */

  function soundOn() {
    try {
      const raw = localStorage.getItem("hb-sound");
      return raw === null ? true : JSON.parse(raw) !== false;
    } catch (e) {
      return true; /* storage blocked — bundle's own default is on */
    }
  }

  function initSoundToggle() {
    const box = document.getElementById("hb-sound-toggle");
    if (!box) return;
    box.checked = soundOn();
    box.addEventListener("change", function () {
      try {
        /* bundle.js parses the key with JSON.parse — write JSON, not raw text */
        localStorage.setItem("hb-sound", JSON.stringify(box.checked));
      } catch (e) {
        toast("Couldn't save the sound preference in this browser.");
        return;
      }
      toast(box.checked ? "Toolkit sounds on." : "Toolkit sounds off.");
      announce(box.checked ? "Toolkit sounds on" : "Toolkit sounds off");
    });
  }

  /* ---------- init — each module lazy-inits when its DOM exists ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    initRadar();
    initPrizeChart();
    initTimeline();
    initPoster();
    initSticker();
    initChatExport();
    initPredictorCard();
    initSoundToggle();
  });
})();
