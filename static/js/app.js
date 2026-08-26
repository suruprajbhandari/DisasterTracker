/**
 * Nepal Multi-Source Disaster Tracker — Map & UI Logic
 * Fetches combined data from Flask proxy (rivers, earthquakes, EONET)
 * and renders each source with distinct marker styles on a Leaflet map.
 */

// ── Constants ─────────────────────────────────────
const NEPAL_CENTER  = [28.3949, 84.1240];
const ZOOM_DEFAULT  = 7;
const ZOOM_MIN      = 6;
const ZOOM_MAX      = 16;
const API_ENDPOINT  = "/api/all";
const REFRESH_MS    = 5 * 60 * 1000;

const NEPAL_BOUNDS = L.latLngBounds(
  L.latLng(25.5, 79.0),
  L.latLng(31.5, 89.5)
);

// ── State ─────────────────────────────────────────
let map;
let riverLayer, quakeLayer, eonetLayer;
let currentData = { rivers: [], earthquakes: [], eonet: [] };

// ── Init ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  fetchAllData();
  setupControls();
  setInterval(fetchAllData, REFRESH_MS);
});

// ── Map Setup ─────────────────────────────────────
function initMap() {
  map = L.map("map", {
    center: NEPAL_CENTER,
    zoom: ZOOM_DEFAULT,
    minZoom: ZOOM_MIN,
    maxZoom: ZOOM_MAX,
    maxBounds: NEPAL_BOUNDS,
    maxBoundsViscosity: 0.9,
    zoomControl: false,
  });

  // Base layers
  const streetLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });

  const satelliteLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a> World Imagery',
      maxZoom: 18,
    }
  );

  // Default to street view
  streetLayer.addTo(map);

  // Layer control
  const baseLayers = {
    "🗺️ Street View": streetLayer,
    "🛰️ Satellite View": satelliteLayer,
  };

  // Data overlay groups
  riverLayer = L.layerGroup().addTo(map);
  quakeLayer = L.layerGroup().addTo(map);
  eonetLayer = L.layerGroup().addTo(map);

  const overlays = {
    "🌊 River Stations": riverLayer,
    "🔴 Earthquakes": quakeLayer,
    "🟠 EONET Events": eonetLayer,
  };

  L.control.layers(baseLayers, overlays, { position: "topright", collapsed: true }).addTo(map);
  L.control.zoom({ position: "topright" }).addTo(map);
}

// ── Data Fetching ─────────────────────────────────
async function fetchAllData() {
  setStatus("loading", "Fetching data…");

  try {
    const resp = await fetch(API_ENDPOINT);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    currentData = data;

    renderRiverMarkers(data.rivers || []);
    renderQuakeMarkers(data.earthquakes || []);
    renderEonetMarkers(data.eonet || []);

    renderRiverList(data.rivers || []);
    renderQuakeList(data.earthquakes || []);
    renderEonetList(data.eonet || []);

    updateCounts(data.counts || {});

    const total = (data.counts?.rivers || 0) + (data.counts?.earthquakes || 0) + (data.counts?.eonet || 0);
    setStatus("live", `${total} data points loaded`);
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("error", "Failed to load data");
  }
}

// ── River Markers (Blue Water Drops) ──────────────
function renderRiverMarkers(rivers) {
  riverLayer.clearLayers();

  rivers.forEach((r) => {
    const discharge = r.discharge_m3s !== null ? `${r.discharge_m3s} m³/s` : "No data";
    const sparkline = buildSparkline(r.all_discharges || []);

    const marker = L.marker([r.latitude, r.longitude], {
      icon: createCircleIcon("#3b82f6", "💧", "rgba(59,130,246,0.5)"),
    });

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-source-badge source-river">💧 River Station</div>
        <h3>${esc(r.name)}</h3>
        <div class="popup-detail"><span class="detail-icon">📍</span><span>${esc(r.region)}</span></div>
        <div class="popup-detail"><span class="detail-icon">🌊</span><span>Discharge: <strong>${discharge}</strong></span></div>
        ${r.date ? `<div class="popup-detail"><span class="detail-icon">📅</span><span>${r.date}</span></div>` : ""}
        ${sparkline}
      </div>
    `, { maxWidth: 320, className: "dark-popup" });

    riverLayer.addLayer(marker);
  });
}

function buildSparkline(values) {
  if (!values || values.length < 2) return "";
  const filtered = values.filter((v) => v !== null);
  if (filtered.length < 2) return "";

  const max = Math.max(...filtered);
  const min = Math.min(...filtered);
  const range = max - min || 1;
  const w = 200, h = 40, pad = 4;

  const points = filtered.map((v, i) => {
    const x = pad + (i / (filtered.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  }).join(" ");

  return `
    <div style="margin-top:8px;">
      <div style="font-size:0.68rem; color:var(--clr-text-dim); margin-bottom:4px;">7-day discharge trend</div>
      <svg width="${w}" height="${h}" style="background:rgba(59,130,246,0.06); border-radius:6px;">
        <polyline points="${points}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  `;
}

// ── Earthquake Markers (Red Pulses) ───────────────
function renderQuakeMarkers(quakes) {
  quakeLayer.clearLayers();

  quakes.forEach((q) => {
    const mag = q.magnitude || 0;
    const size = Math.max(20, Math.min(48, mag * 10));
    const time = q.time ? formatDate(new Date(q.time).toISOString()) : "Unknown";

    const marker = L.marker([q.latitude, q.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="quake-marker" style="
          width:${size}px; height:${size}px;
          --pulse-size: ${size * 2.5}px;
        "><span style="font-size:${Math.max(10, size * 0.38)}px;">${mag.toFixed(1)}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 4],
      }),
    });

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-source-badge source-quake">🔴 Earthquake</div>
        <h3>${esc(q.title)}</h3>
        <div class="popup-detail"><span class="detail-icon">📊</span><span>Magnitude: <strong>${mag.toFixed(1)}</strong></span></div>
        <div class="popup-detail"><span class="detail-icon">📍</span><span>${esc(q.place)}</span></div>
        <div class="popup-detail"><span class="detail-icon">⬇️</span><span>Depth: ${q.depth_km ?? "?"}km</span></div>
        <div class="popup-detail"><span class="detail-icon">🕐</span><span>${time}</span></div>
        <div class="popup-divider"></div>
        ${q.url ? `<a class="popup-link" href="${q.url}" target="_blank" rel="noopener noreferrer">📄 USGS Details ↗</a>` : ""}
      </div>
    `, { maxWidth: 320, className: "dark-popup" });

    quakeLayer.addLayer(marker);
  });
}

// ── EONET Markers (Orange Warnings) ───────────────
function renderEonetMarkers(events) {
  eonetLayer.clearLayers();

  events.forEach((event) => {
    const isOpen = event.status === "open";
    event.geometries.forEach((geom) => {
      if (geom.type !== "Point") return;

      const marker = L.marker([geom.latitude, geom.longitude], {
        icon: createCircleIcon(
          isOpen ? "#f97316" : "#78716c",
          "⚠️",
          isOpen ? "rgba(249,115,22,0.5)" : "rgba(120,113,108,0.3)"
        ),
        opacity: isOpen ? 1 : 0.65,
      });

      const cats = event.categories.join(", ") || "Unknown";
      const date = geom.date ? formatDate(geom.date) : "—";
      const statusBadge = isOpen
        ? '<span class="event-status-badge status-open">🟢 Open</span>'
        : '<span class="event-status-badge status-closed">⚪ Closed</span>';

      let sourcesHTML = (event.sources || []).map(
        (s) => `<a class="popup-link" href="${s.url}" target="_blank" rel="noopener noreferrer">📄 ${s.id || "Source"} ↗</a>`
      ).join(" ");

      marker.bindPopup(`
        <div class="popup-content">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <div class="popup-source-badge source-eonet">🟠 EONET</div>
            ${statusBadge}
          </div>
          <h3>${esc(event.title)}</h3>
          <div class="popup-detail"><span class="detail-icon">🏷️</span><span>Category: ${esc(cats)}</span></div>
          <div class="popup-detail"><span class="detail-icon">📅</span><span>${date}</span></div>
          ${event.closed ? `<div class="popup-detail"><span class="detail-icon">🔒</span><span>Closed: ${formatDate(event.closed)}</span></div>` : ""}
          <div class="popup-divider"></div>
          ${sourcesHTML}
          ${event.link ? `<a class="popup-link" href="${event.link}" target="_blank" rel="noopener noreferrer">🌐 EONET Details ↗</a>` : ""}
        </div>
      `, { maxWidth: 320, className: "dark-popup" });

      eonetLayer.addLayer(marker);
    });
  });
}

// ── Shared Marker Factory ─────────────────────────
function createCircleIcon(color, emoji, glow) {
  const size = 32;
  return L.divIcon({
    className: "",
    html: `<div class="disaster-marker" style="
      width:${size}px; height:${size}px;
      background:${color}; --glow-color:${glow};
      font-size:14px;
    ">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

// ── Sidebar: River List ───────────────────────────
function renderRiverList(rivers) {
  const el = document.getElementById("content-rivers");
  if (rivers.length === 0) {
    el.innerHTML = emptyMsg("No river station data available.");
    return;
  }

  el.innerHTML = rivers.map((r) => {
    const val = r.discharge_m3s !== null ? `${r.discharge_m3s} m³/s` : "No data";
    const level = getFloodLevel(r.discharge_m3s);
    return `
      <div class="event-card" onclick="flyTo(${r.latitude}, ${r.longitude})">
        <div class="event-card-title">💧 ${esc(r.name)}</div>
        <div class="event-card-meta">
          <span class="event-tag cat-flood">${val}</span>
          <span class="event-tag ${level.css}">${level.label}</span>
          ${r.date ? `<span class="event-date">${r.date}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function getFloodLevel(discharge) {
  if (discharge === null || discharge === undefined) return { label: "No data", css: "cat-default" };
  if (discharge > 5000) return { label: "⚠️ High", css: "cat-wildfire" };
  if (discharge > 1000) return { label: "Moderate", css: "cat-landslide" };
  return { label: "Normal", css: "cat-flood" };
}

// ── Sidebar: Earthquake List ──────────────────────
function renderQuakeList(quakes) {
  const el = document.getElementById("content-earthquakes");
  if (quakes.length === 0) {
    el.innerHTML = emptyMsg("No earthquakes recorded in the last 30 days.");
    return;
  }

  el.innerHTML = quakes.map((q) => {
    const mag = q.magnitude || 0;
    const time = q.time ? formatDate(new Date(q.time).toISOString()) : "";
    const magClass = mag >= 5 ? "cat-wildfire" : mag >= 3 ? "cat-landslide" : "cat-default";
    return `
      <div class="event-card" onclick="flyTo(${q.latitude}, ${q.longitude})">
        <div class="event-card-title">🔴 M${mag.toFixed(1)} — ${esc(q.place || "Nepal Region")}</div>
        <div class="event-card-meta">
          <span class="event-tag ${magClass}">M ${mag.toFixed(1)}</span>
          <span class="event-tag cat-default">${q.depth_km ?? "?"}km deep</span>
          <span class="event-date">${time}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ── Sidebar: EONET List ───────────────────────────
function renderEonetList(events) {
  const el = document.getElementById("content-eonet");
  if (events.length === 0) {
    el.innerHTML = emptyMsg("No recent events found in the NASA EONET feed for this region. Try adjusting the date range.");
    return;
  }

  el.innerHTML = events.map((e) => {
    const cats = e.categories.join(", ") || "Unknown";
    const isOpen = e.status === "open";
    const lastGeom = e.geometries[e.geometries.length - 1];
    const date = lastGeom ? formatDate(lastGeom.date) : "";
    const lat = lastGeom?.latitude || NEPAL_CENTER[0];
    const lng = lastGeom?.longitude || NEPAL_CENTER[1];
    return `
      <div class="event-card" onclick="flyTo(${lat}, ${lng})">
        <div class="event-card-title">🟠 ${esc(e.title)}</div>
        <div class="event-card-meta">
          <span class="event-tag cat-storm">${esc(cats)}</span>
          <span class="event-status-badge ${isOpen ? 'status-open' : 'status-closed'}">${isOpen ? '● Open' : '○ Closed'}</span>
          <span class="event-date">${date}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ── Sidebar Counts ────────────────────────────────
function updateCounts(counts) {
  document.getElementById("count-rivers").textContent = counts.rivers ?? 0;
  document.getElementById("count-earthquakes").textContent = counts.earthquakes ?? 0;
  document.getElementById("count-eonet").textContent = counts.eonet ?? 0;
}

// ── Empty State ───────────────────────────────────
function emptyMsg(text) {
  return `
    <div class="state-message state-message-sm">
      <p>${text}</p>
      <button class="btn-retry" onclick="fetchAllData()">⟳ Refresh</button>
    </div>
  `;
}

// ── Map Navigation ────────────────────────────────
function flyTo(lat, lng) {
  map.flyTo([lat, lng], 10, { duration: 1 });
}

// ── Controls ──────────────────────────────────────
function setupControls() {
  // Refresh button
  const btn = document.getElementById("btn-refresh");
  btn.addEventListener("click", () => {
    btn.classList.add("spinning");
    fetchAllData().finally(() => setTimeout(() => btn.classList.remove("spinning"), 600));
  });

  // Panel toggle
  const panel = document.getElementById("side-panel");
  const toggle = document.getElementById("panel-toggle");
  const closeBtn = document.getElementById("panel-close");

  toggle.addEventListener("click", () => {
    panel.classList.remove("collapsed");
    toggle.classList.remove("visible");
  });

  closeBtn.addEventListener("click", () => {
    panel.classList.add("collapsed");
    toggle.classList.add("visible");
  });

  // Section toggles (collapsible accordion)
  document.querySelectorAll(".section-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      const content = document.getElementById(`content-${section}`);
      const expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", !expanded);
      content.classList.toggle("collapsed", expanded);
      btn.querySelector(".section-chevron").textContent = expanded ? "▸" : "▾";
    });
  });
}

// ── Status ────────────────────────────────────────
function setStatus(type, text) {
  const badge = document.getElementById("status-badge");
  badge.className = `status-badge ${type}`;
  badge.innerHTML = `<span class="status-dot"></span> ${text}`;
}

// ── Utilities ─────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
