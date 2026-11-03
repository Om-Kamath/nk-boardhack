/* Venue Entrance Finder — drop a photo of the hackathon venue and see
 * where the doors are.
 *
 * How it works, honestly:
 * 1. The photo's GPS coordinates are read client-side (EXIF). The image
 *    itself never leaves the browser.
 * 2. Coordinates go out only as a small radius query to OpenStreetMap
 *    services (Nominatim for the building name, Overpass for tagged
 *    entrance nodes).
 * 3. Entrances render on a Leaflet map; `entrance=main` gets a distinct
 *    marker.
 *
 * Coverage depends on OSM mappers having tagged entrances at that
 * building — when they haven't, the map still centers on the photo and
 * says so plainly. No keys, no upload of the photo, no vision model. */

(function () {
  "use strict";

  const ZONE = document.getElementById("ef-drop");
  const FILE_IN = document.getElementById("ef-file");
  const RESULT = document.getElementById("ef-result");

  const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
  const OVERPASS_TIMEOUT_MS = 15000;
  const RADIUS_M = 150;
  const leaflet = { loaded: false };

  /* ---------- EXIF GPS extraction (client-side, JPEG only) ---------- */

  function readGpsFromJpeg(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if ((marker & 0xff00) !== 0xff00) break;
      const size = view.getUint16(offset, false);
      if (marker === 0xffe1 && offset + 10 < view.byteLength) {
        /* APP1 — check for "Exif\0\0" */
        const tag = view.getUint32(offset + 2, false);
        if (tag === 0x45786966) return parseTiffGps(view, offset + 10);
      }
      offset += size;
    }
    return null;
  }

  function parseTiffGps(view, tiffStart) {
    const little = view.getUint16(tiffStart, false) === 0x4949;
    function u32(p) { return view.getUint32(p, little); }
    function u16(p) { return view.getUint16(p, little); }

    let ifd = tiffStart + u32(tiffStart + 4);
    const entries = u16(ifd);
    ifd += 2;
    let gpsIfd = 0;
    for (let i = 0; i < entries; i++) {
      const e = ifd + i * 12;
      if (u16(e) === 0x8825) { gpsIfd = tiffStart + u32(e + 8); break; }
    }
    if (!gpsIfd) return null;

    const dms = {};   /* tag -> [deg, min, sec] */
    let latRef = "N", lonRef = "E";
    const gpsEntries = u16(gpsIfd);
    for (let i = 0; i < gpsEntries; i++) {
      const e = gpsIfd + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const valOff = type === 5 ? tiffStart + u32(e + 8) : e + 8;  /* RATIONALs live at an offset */

      if (tag === 0x0001) latRef = String.fromCharCode(view.getUint8(e + 8));
      else if (tag === 0x0002) dms.lat = readRationals(view, valOff, count, little);
      else if (tag === 0x0003) lonRef = String.fromCharCode(view.getUint8(e + 8));
      else if (tag === 0x0004) dms.lon = readRationals(view, valOff, count, little);
    }
    if (!dms.lat || !dms.lon) return null;
    const dec = function (d) { return d[0] + d[1] / 60 + (d[2] || 0) / 3600; };
    return {
      lat: dec(dms.lat) * (latRef === "S" ? -1 : 1),
      lon: dec(dms.lon) * (latRef === "W" ? -1 : 1)
    };
  }

  function readRationals(view, off, count, little) {
    const out = [0, 0, 0];
    for (let i = 0; i < Math.min(count, 3); i++) {
      const num = view.getUint32(off + i * 8, little);
      const den = view.getUint32(off + i * 8 + 4, little);
      out[i] = den ? num / den : 0;
    }
    return out;
  }

  /* ---------- OSM lookups ---------- */

  function reverseGeocode(lat, lon) {
    const url = "https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=" +
      lat + "&lon=" + lon;
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.name ? j.name : (j && j.display_name ? j.display_name.split(",")[0] : ""); })
      .catch(function () { return ""; });
  }

  function fetchEntrances(lat, lon) {
    const q = '[out:json][timeout:10];node(around:' + RADIUS_M + "," + lat + "," + lon + ')["entrance"];out;';
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, OVERPASS_TIMEOUT_MS);
    return fetch(OVERPASS_URL, {
      method: "POST",
      body: "data=" + encodeURIComponent(q),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: ctrl.signal
    })
      .then(function (r) { if (!r.ok) throw new Error("overpass " + r.status); return r.json(); })
      .then(function (j) { return (j && j.elements) || []; })
      .finally(function () { clearTimeout(timer); });
  }

  /* ---------- Leaflet (lazy-loaded on first use) ---------- */

  function loadLeaflet() {
    if (leaflet.loaded) return Promise.resolve();
    ["https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"].forEach(function (href) {
      if (!document.querySelector('link[href="' + href + '"]')) {
        const l = document.createElement("link");
        l.rel = "stylesheet"; l.href = href;
        document.head.appendChild(l);
      }
    });
    return new Promise(function (res, rej) {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = function () { leaflet.loaded = true; res(); };
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function renderMap(lat, lon, entrances, buildingName) {
    const el = document.getElementById("ef-map");
    if (!el || !window.L) return;

    const map = L.map(el, { scrollWheelZoom: false }).setView([lat, lon], 18);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    L.circleMarker([lat, lon], {
      radius: 6, color: "#6366f1", fillOpacity: 0.9
    }).addTo(map).bindTooltip("📍 where the photo was taken", { direction: "top" });

    entrances.forEach(function (n) {
      const isMain = (n.tags && n.tags.entrance) === "main";
      L.circleMarker([n.lat, n.lon], {
        radius: isMain ? 9 : 6,
        color: isMain ? "#22c55e" : "#16a34a",
        fillColor: isMain ? "#22c55e" : "#86efac",
        fillOpacity: 0.95
      }).addTo(map).bindPopup(
        "<strong>" + (isMain ? "Main entrance" : "Entrance") + "</strong>" +
        (n.tags && n.tags.name ? "<br>" + n.tags.name : "")
      );
    });

    const note = entrances.length
      ? entrances.length + " tagged entrance" + (entrances.length === 1 ? "" : "s") + " found within " + RADIUS_M + "m."
      : "No entrances tagged in OpenStreetMap here yet — the map still shows the exact spot the photo was taken; look for the marked building face.";
    document.getElementById("ef-summary").textContent =
      (buildingName ? buildingName + " — " : "") + note;
  }

  /* ---------- Orchestration ---------- */

  function status(html) { RESULT.innerHTML = html; }

  function handleFile(file) {
    if (!file || file.type.indexOf("image/") !== 0) {
      status('<div class="alert alert-error">That\'s not an image — drop a JPG photo of the venue.</div>');
      return;
    }

    status('<div class="alert alert-info">Reading the photo\'s location data…</div>');

    file.arrayBuffer().then(function (buf) {
      const gps = readGpsFromJpeg(buf);
      if (!gps) {
        status('<div class="alert alert-warning">No GPS data in this photo (screenshots and shared images usually strip it). Take the photo directly with the venue camera app — or paste the venue address and I\'ll map it another way.</div>');
        return;
      }

      status('<div class="alert alert-info">Found coordinates (' + gps.lat.toFixed(5) + ", " + gps.lon.toFixed(5) + ') — asking OpenStreetMap for tagged entrances…</div>');

      Promise.all([reverseGeocode(gps.lat, gps.lon), fetchEntrances(gps.lat, gps.lon), loadLeaflet()])
        .then(function (res) {
          const name = res[0], entrances = res[1];
          status(
            '<div id="ef-map" class="ef-map"></div>' +
            '<p class="ef-summary" id="ef-summary"></p>' +
            '<p class="pred-note">Photo stays on your device; only the coordinates went to OpenStreetMap as a radius query. Entrance coverage depends on mapper data — verify doors on arrival.</p>'
          );
          renderMap(gps.lat, gps.lon, entrances, name);
        })
        .catch(function (err) {
          status('<div class="alert alert-error">The OpenStreetMap lookup failed (' + err.message + '). Try again in a moment — Overpass is community-run.</div>');
        });
    }).catch(function () {
      status('<div class="alert alert-error">Couldn\'t read that file.</div>');
    });
  }

  /* ---------- Wiring ---------- */

  document.addEventListener("DOMContentLoaded", function () {
    if (!ZONE) return;

    ["dragover", "dragenter"].forEach(function (evt) {
      ZONE.addEventListener(evt, function (e) { e.preventDefault(); ZONE.classList.add("drop-active"); });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      ZONE.addEventListener(evt, function (e) { e.preventDefault(); ZONE.classList.remove("drop-active"); });
    });
    ZONE.addEventListener("drop", function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    ZONE.addEventListener("click", function () { FILE_IN.click(); });
    FILE_IN.addEventListener("change", function () {
      if (FILE_IN.files && FILE_IN.files[0]) handleFile(FILE_IN.files[0]);
      FILE_IN.value = "";
    });

    /* Paste an image straight onto the page. */
    document.addEventListener("paste", function (e) {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image/") === 0) {
          handleFile(items[i].getAsFile());
          break;
        }
      }
    });
  });
})();
