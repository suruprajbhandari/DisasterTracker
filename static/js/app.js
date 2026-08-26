/**
 * Nepal Multi-Source Disaster Tracker — Satellite-First Flood Analytics
 * Priorities: deep flood forecasting > earthquake monitoring > EONET macro
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
let riverLayer, quakeLayer, eonetLayer, reliefwebLayer;
let currentData = { rivers: [], earthquakes: [], eonet: [], reliefweb: [] };

// ── Init ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  fetchAllData();
  setupControls();
  setInterval(fetchAllData, REFRESH_MS);
});

// ── Map Setup — Dual Layers ───────────────────────
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

  const yesterday = new Date(Date.now() - 864e5).toISOString().split('T')[0];
  
  const baseLayers = {
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 18,
          attribution: 'Tiles &copy; Esri'
      }),
      nasa: L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`, {
          maxNativeZoom: 9,
          maxZoom: 18,
          attribution: 'NASA GIBS'
      }),
      street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
      })
  };

  // Default to satellite
  baseLayers.satellite.addTo(map);

  // Data overlay groups
  riverLayer = L.layerGroup().addTo(map);
  quakeLayer = L.layerGroup().addTo(map);
  eonetLayer = L.layerGroup().addTo(map);
  reliefwebLayer = L.layerGroup().addTo(map);
  const overlays = {
    "💧 Flood Stations (GloFAS)": riverLayer,
    "🚨 ReliefWeb Incidents": reliefwebLayer,
    "🔴 Earthquakes (USGS)": quakeLayer,
    "🟠 EONET Macro Events": eonetLayer,
  };

  L.control.zoom({ position: "topright" }).addTo(map);

  // Custom Layer Control Logic
  function switchBaseLayer(selectedKey) {
      Object.values(baseLayers).forEach(layer => {
          if (map.hasLayer(layer)) {
              map.removeLayer(layer);
          }
      });
      baseLayers[selectedKey].addTo(map);
      
      document.querySelectorAll('.layer-btn').forEach(btn => btn.classList.remove('active'));
      const activeBtn = document.getElementById(`btn-${selectedKey}`);
      if (activeBtn) activeBtn.classList.add('active');
  }

  const btnSat = document.getElementById('btn-satellite');
  const btnNasa = document.getElementById('btn-nasa');
  const btnStreet = document.getElementById('btn-street');
  if (btnSat) btnSat.addEventListener('click', () => switchBaseLayer('satellite'));
  if (btnNasa) btnNasa.addEventListener('click', () => switchBaseLayer('nasa'));
  if (btnStreet) btnStreet.addEventListener('click', () => switchBaseLayer('street'));
}

// ── Data Fetching ─────────────────────────────────
async function fetchAllData() {
  setStatus("loading", "Fetching data…");

  try {
    const resp = await fetch(API_ENDPOINT);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    currentData = data;

    const rivers = data.rivers || [];
    const reliefweb = data.reliefweb || [];
    const earthquakes = data.earthquakes || [];
    const eonet = data.eonet || [];

    // Check if ALL data feeds are completely empty/failed
    if (rivers.length === 0 && reliefweb.length === 0 && earthquakes.length === 0 && eonet.length === 0) {
      throw new Error("All data sources returned empty arrays.");
    }

    renderRiverMarkers(rivers);
    renderReliefWebMarkers(reliefweb);
    renderQuakeMarkers(earthquakes);
    renderEonetMarkers(eonet);

    renderRiverList(rivers);
    renderReliefWebList(reliefweb);
    renderQuakeList(earthquakes);
    renderEonetList(eonet);

    updateCounts(data.counts || {});
    updateTopAlert(rivers);

    const total = rivers.length + earthquakes.length + eonet.length + reliefweb.length;
    setStatus("live", `${total} data points loaded`);
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("error", "Failed to load data");
  }
}

// ═══════════════════════════════════════════════════
// RIVER MARKERS — Large, dominant, primary focus
// ═══════════════════════════════════════════════════
function renderRiverMarkers(rivers) {
  riverLayer.clearLayers();

  rivers.forEach((r) => {
    const risk = evaluateRiverRisk(r);
    const markerSize = 44; // Large, dominant

    const marker = L.marker([r.latitude, r.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="river-marker ${risk.markerClass}" style="
          width:${markerSize}px; height:${markerSize}px;
          background:${risk.color}dd;
          box-shadow: 0 0 15px ${risk.color};
        ">💧</div>`,
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
        popupAnchor: [0, -markerSize / 2 - 6],
      }),
      zIndexOffset: 500, // Rivers always on top
    });

    marker.bindPopup(() => buildRiverPopup(r, risk), {
      maxWidth: 340, minWidth: 280, maxHeight: 400,
      autoPan: true, autoPanPaddingTopLeft: [60, 60], autoPanPaddingBottomRight: [60, 60],
      closeButton: true, className: "custom-disaster-popup"
    });

    riverLayer.addLayer(marker);
  });
}

function buildRiverPopup(r, risk) {
  const today = r.discharge_m3s !== null ? r.discharge_m3s : "—";
  const maxFc = r.max_forecast_m3s !== null ? r.max_forecast_m3s : "—";
  const chart = buildForecastChart(r.forecast_discharges, r.forecast_max_discharges, r.forecast_dates);

  const transboundaryBadge = r.transboundary 
    ? `<div class="event-tag cat-warning" style="background:rgba(251,146,60,0.2); color:#fb923c; border:1px solid rgba(251,146,60,0.4); margin-bottom:8px;">⚠️ Upstream Transboundary / Border Entry</div>` 
    : '';

  const steepGorgeBadge = (r.name.includes("Bhotekoshi") || r.name.includes("Trishuli"))
    ? `<div class="event-tag risk-critical" style="margin-bottom:8px;">⚠️ Steep Himalayan Gorge: Vulnerable to sudden GLOF / transboundary surges from Tibet.</div>`
    : '';

  const gdacsEvent = (currentData.gdacs || []).find(g => 
    Math.abs(g.latitude - r.latitude) < 0.5 && Math.abs(g.longitude - r.longitude) < 0.5
  );
  
  const gdacsBadge = gdacsEvent
    ? `<div class="event-tag risk-critical" style="margin-bottom:8px;">🚨 GDACS Hazard: ${esc(gdacsEvent.alert_level)} Alert</div>`
    : '';

  const rainStr = r.rainfall_24h_mm !== null ? `${r.rainfall_24h_mm} mm` : "—";

  return `
    <div class="popup-content popup-river-enhanced">
      <div class="popup-source-badge source-river" style="background:${risk.color}33; color:${risk.color}; border:1px solid ${risk.color}55;">
        ${risk.badge} · ${risk.label}
      </div>
      <h3>${esc(r.name)}</h3>
      <div class="popup-detail"><span class="detail-icon">📍</span><span>${esc(r.region)}</span></div>
      <div class="popup-detail"><span class="detail-icon">🌧️</span><span>24h Rainfall: <strong>${rainStr}</strong> (Open-Meteo)</span></div>
      ${transboundaryBadge}
      ${steepGorgeBadge}
      ${gdacsBadge}

      <div class="popup-divider"></div>

      <!-- Forecast comparison -->
      <div class="forecast-grid">
        <div class="forecast-cell">
          <div class="forecast-label">Today's Discharge</div>
          <div class="forecast-value value-current">${today} <small>m³/s</small></div>
        </div>
        <div class="forecast-cell">
          <div class="forecast-label">7-Day Max Forecast</div>
          <div class="forecast-value value-max">${maxFc} <small>m³/s</small></div>
        </div>
      </div>

      <!-- Risk level -->
      <div class="risk-badge" style="background:${risk.color}22; color:${risk.color}; border:1px solid ${risk.color}55;">
        Status: ${risk.label}
      </div>

      <!-- Forecast chart -->
      ${chart}

      <div class="popup-divider"></div>

      <!-- Downstream risk -->
      <div class="popup-context">
        <div class="context-heading">⚠️ Downstream Risk Assessment</div>
        <p>${esc(r.downstream_risk || "No downstream risk data available for this station.")}</p>
      </div>

      <!-- Flood source -->
      <div class="popup-context">
        <div class="context-heading">🔬 Flood Model Source</div>
        <p>Water levels driven by GloFAS basin models, factoring in monsoon runoff, upstream snowmelt, and precipitation forecasts from ECMWF.</p>
      </div>

      <div class="popup-attribution">
        Data: <strong>Open-Meteo GloFAS Forecast</strong> · Copernicus Emergency Management Service
      </div>
    </div>
  `;
}

function buildForecastChart(discharges, maxDischarges, dates) {
  if (!discharges || discharges.length < 2) return "";
  const d = discharges.filter(v => v !== null);
  const m = (maxDischarges || []).filter(v => v !== null);
  if (d.length < 2) return "";

  const all = [...d, ...m];
  const maxVal = Math.max(...all);
  const minVal = Math.min(...all);
  const range = maxVal - minVal || 1;
  const w = 300, h = 70, pad = 6;

  const mapPoints = (arr) => arr.map((v, i) => {
    const x = pad + (i / (arr.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - minVal) / range) * (h - 2 * pad);
    return `${x},${y}`;
  }).join(" ");

  const dischargeLine = mapPoints(d);
  const maxLine = m.length >= 2 ? mapPoints(m) : "";

  // Date labels (first and last)
  const firstDate = (dates && dates[0]) ? dates[0].slice(5) : "";
  const lastDate = (dates && dates[dates.length - 1]) ? dates[dates.length - 1].slice(5) : "";

  return `
    <div class="forecast-chart">
      <div class="chart-title">7-Day Discharge Forecast</div>
      <svg viewBox="0 0 ${w} ${h}" class="chart-svg">
        ${maxLine ? `<polyline points="${maxLine}" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="4,3" stroke-linecap="round" opacity="0.7"/>` : ""}
        <polyline points="${dischargeLine}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="chart-legend">
        <span><span class="legend-line legend-current"></span>Discharge</span>
        ${maxLine ? '<span><span class="legend-line legend-max"></span>Max Statistical</span>' : ""}
      </div>
      <div class="chart-dates"><span>${firstDate}</span><span>${lastDate}</span></div>
    </div>
  `;
}

function getFloodRisk(r) {
  const today = r.discharge_m3s || 0;
  const maxFc = r.max_forecast_m3s || today;
  const median = r.median_discharge_m3s || today || 1; // avoid /0
  
  // ReliefWeb proximity check (rough bounding box check)
  let nearbyAlert = false;
  (currentData.reliefweb || []).forEach(inc => {
    if (inc.latitude && inc.longitude) {
      const dLat = Math.abs(inc.latitude - r.latitude);
      const dLon = Math.abs(inc.longitude - r.longitude);
      if (dLat < 0.5 && dLon < 0.5) nearbyAlert = true;
    }
  });

  const isLevel1 = (today >= 1.3 * median) || (maxFc > 1.5 * today) || nearbyAlert;
  const isLevel2 = (today >= 1.1 * median) || (maxFc > today);

  if (isLevel1) return { label: "CRITICAL FLOOD DANGER", icon: "🔴", css: "risk-critical", markerClass: "risk-critical-marker", level: 1 };
  if (isLevel2) return { label: "ELEVATED RISK", icon: "🟠", css: "risk-high", markerClass: "risk-high-marker", level: 2 };
  return { label: "NORMAL", icon: "🟢", css: "risk-normal", markerClass: "risk-normal-marker", level: 3 };
}

// ═══════════════════════════════════════════════════
// EARTHQUAKE MARKERS — Small, secondary
// ═══════════════════════════════════════════════════
function renderQuakeMarkers(quakes) {
  quakeLayer.clearLayers();

  quakes.forEach((q) => {
    const mag = q.magnitude || 0;
    const size = Math.max(14, Math.min(28, mag * 5)); // Shrunk down
    const time = q.time ? formatDate(new Date(q.time).toISOString()) : "Unknown";

    const marker = L.marker([q.latitude, q.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="quake-marker" style="
          width:${size}px; height:${size}px;
        "><span style="font-size:${Math.max(8, size * 0.38)}px;">${mag.toFixed(1)}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 4],
      }),
      zIndexOffset: 100, // Below rivers
    });

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-source-badge source-quake">🔴 USGS Earthquake</div>
        <h3>${esc(q.title)}</h3>
        <div class="popup-detail"><span class="detail-icon">📊</span><span>Magnitude: <strong>${mag.toFixed(1)}</strong></span></div>
        <div class="popup-detail"><span class="detail-icon">📍</span><span>${esc(q.place)}</span></div>
        <div class="popup-detail"><span class="detail-icon">⬇️</span><span>Depth: ${q.depth_km ?? "?"}km</span></div>
        <div class="popup-detail"><span class="detail-icon">🕐</span><span>${time}</span></div>
        <div class="popup-divider"></div>
        ${q.url ? `<a class="popup-link" href="${q.url}" target="_blank" rel="noopener noreferrer">📄 USGS Report ↗</a>` : ""}
        <div class="popup-attribution">Data: <strong>USGS</strong> · United States Geological Survey</div>
      </div>
    `, { 
      maxWidth: 340, minWidth: 280, maxHeight: 400,
      autoPan: true, autoPanPaddingTopLeft: [60, 60], autoPanPaddingBottomRight: [60, 60],
      closeButton: true, className: "custom-disaster-popup"
    });

    quakeLayer.addLayer(marker);
  });
}

// ═══════════════════════════════════════════════════
// EONET MARKERS — Orange, secondary
// ═══════════════════════════════════════════════════
function renderEonetMarkers(events) {
  eonetLayer.clearLayers();

  events.forEach((event) => {
    const isOpen = event.status === "open";
    event.geometries.forEach((geom) => {
      if (geom.type !== "Point") return;

      const size = 26;
      const marker = L.marker([geom.latitude, geom.longitude], {
        icon: L.divIcon({
          className: "",
          html: `<div class="disaster-marker" style="
            width:${size}px; height:${size}px;
            background:${isOpen ? '#f97316' : '#78716c'};
            --glow-color:${isOpen ? 'rgba(249,115,22,0.5)' : 'rgba(120,113,108,0.3)'};
            font-size:12px;
          ">⚠️</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
          popupAnchor: [0, -size / 2 - 4],
        }),
        opacity: isOpen ? 1 : 0.65,
        zIndexOffset: 200,
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
            <div class="popup-source-badge source-eonet">🟠 NASA EONET</div>
            ${statusBadge}
          </div>
          <h3>${esc(event.title)}</h3>
          <div class="popup-detail"><span class="detail-icon">🏷️</span><span>Category: ${esc(cats)}</span></div>
          <div class="popup-detail"><span class="detail-icon">📅</span><span>${date}</span></div>
          ${event.closed ? `<div class="popup-detail"><span class="detail-icon">🔒</span><span>Closed: ${formatDate(event.closed)}</span></div>` : ""}
          <div class="popup-divider"></div>
          ${sourcesHTML}
          ${event.link ? `<a class="popup-link" href="${event.link}" target="_blank" rel="noopener noreferrer">🌐 EONET Details ↗</a>` : ""}
          <div class="popup-attribution">Data: <strong>NASA EONET v3</strong></div>
        </div>
      `, { 
        maxWidth: 340, minWidth: 280, maxHeight: 400,
        autoPan: true, autoPanPaddingTopLeft: [60, 60], autoPanPaddingBottomRight: [60, 60],
        closeButton: true, className: "custom-disaster-popup"
      });

      eonetLayer.addLayer(marker);
    });
  });
}

// ═══════════════════════════════════════════════════
// RELIEFWEB MARKERS — Prominent Alerts
// ═══════════════════════════════════════════════════
function renderReliefWebMarkers(incidents) {
  reliefwebLayer.clearLayers();

  incidents.forEach((inc) => {
    if (!inc.latitude || !inc.longitude) return;

    const size = 32;
    const marker = L.marker([inc.latitude, inc.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="reliefweb-marker" style="width:${size}px; height:${size}px;">🚨</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 4],
      }),
      zIndexOffset: 300,
    });

    const date = inc.date ? formatDate(inc.date) : "—";
    
    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-source-badge source-reliefweb">🚨 UN OCHA ReliefWeb</div>
        <h3>${esc(inc.title)}</h3>
        <div class="popup-detail"><span class="detail-icon">🏷️</span><span>Type: <strong>${esc(inc.type)}</strong></span></div>
        <div class="popup-detail"><span class="detail-icon">📊</span><span>Status: ${esc(inc.status)}</span></div>
        <div class="popup-detail"><span class="detail-icon">📅</span><span>${date}</span></div>
        <div class="popup-divider"></div>
        <p style="font-size:0.75rem; color:var(--clr-text-dim); margin-bottom:10px;">${esc(inc.description).substring(0, 150)}...</p>
        ${inc.url ? `<a class="popup-link" href="${inc.url}" target="_blank" rel="noopener noreferrer">🌐 ReliefWeb Report ↗</a>` : ""}
        <div class="popup-attribution">Data: <strong>ReliefWeb API</strong></div>
      </div>
    `, { 
      maxWidth: 340, minWidth: 280, maxHeight: 400,
      autoPan: true, autoPanPaddingTopLeft: [60, 60], autoPanPaddingBottomRight: [60, 60],
      closeButton: true, className: "custom-disaster-popup"
    });

    reliefwebLayer.addLayer(marker);
  });
}

// ═══════════════════════════════════════════════════
// SIDEBAR LISTS
// ═══════════════════════════════════════════════════

function renderRiverList(rivers) {
  const el = document.getElementById("content-rivers");
  if (rivers.length === 0) {
    el.innerHTML = emptyMsg("No river station data available.");
    return;
  }

  el.innerHTML = rivers.map((r) => {
    const today = r.discharge_m3s !== null ? `${r.discharge_m3s}` : "—";
    const maxFc = r.max_forecast_m3s !== null ? `${r.max_forecast_m3s}` : "—";
    const risk = evaluateRiverRisk(r);
    return `
      <div class="event-card" onclick="flyTo(${r.latitude}, ${r.longitude})">
        <div class="event-card-title">💧 ${esc(r.name)}</div>
        <div class="river-card-stats">
          <div class="river-stat">
            <span class="river-stat-label">Now</span>
            <span class="river-stat-value">${today} <small>m³/s</small></span>
          </div>
          <div class="river-stat">
            <span class="river-stat-label">7d Max</span>
            <span class="river-stat-value value-max-sm">${maxFc} <small>m³/s</small></span>
          </div>
        </div>
        <div class="event-card-meta">
          <span class="event-tag" style="background:${risk.color}33; color:${risk.color}; border:1px solid ${risk.color}55;">${risk.badge}</span>
          ${r.date ? `<span class="event-date">${r.date}</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

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

function renderReliefWebList(incidents) {
  const el = document.getElementById("content-reliefweb");
  if (incidents.length === 0) {
    el.innerHTML = emptyMsg("No active ReliefWeb disasters reported for this region.");
    return;
  }

  el.innerHTML = incidents.map((inc) => {
    const lat = inc.latitude || NEPAL_CENTER[0];
    const lng = inc.longitude || NEPAL_CENTER[1];
    const date = inc.date ? formatDate(inc.date) : "";
    return `
      <div class="event-card" onclick="flyTo(${lat}, ${lng})">
        <div class="event-card-title">🚨 ${esc(inc.title)}</div>
        <div class="event-card-meta">
          <span class="event-tag cat-reliefweb">${esc(inc.type)}</span>
          <span class="event-tag cat-default">${esc(inc.status)}</span>
          <span class="event-date">${date}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ═══════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════

function updateCounts(counts) {
  document.getElementById("count-rivers").textContent = counts.rivers ?? 0;
  document.getElementById("count-earthquakes").textContent = counts.earthquakes ?? 0;
  document.getElementById("count-eonet").textContent = counts.eonet ?? 0;
  document.getElementById("count-reliefweb").textContent = counts.reliefweb ?? 0;
}

function emptyMsg(text) {
  return `
    <div class="state-message state-message-sm">
      <p>${text}</p>
      <button class="btn-retry" onclick="fetchAllData()">⟳ Refresh</button>
    </div>
  `;
}

function flyTo(lat, lng) {
  map.flyTo([lat, lng], 10, { duration: 1 });
}

function setupControls() {
  const btn = document.getElementById("btn-refresh");
  btn.addEventListener("click", () => {
    btn.classList.add("spinning");
    fetchAllData().finally(() => setTimeout(() => btn.classList.remove("spinning"), 600));
  });

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

  const btnLocate = document.getElementById("btn-locate");
  if (btnLocate) {
    btnLocate.addEventListener("click", locateUser);
  }

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

function setStatus(type, text) {
  const badge = document.getElementById("status-badge");
  badge.className = `status-badge ${type}`;
  badge.innerHTML = `<span class="status-dot"></span> ${text}`;
}

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

function updateTopAlert(rivers) {
  const banner = document.getElementById("top-alert-banner");
  if (!banner) return;

  const criticalRiver = rivers.find(r => {
    const risk = evaluateRiverRisk(r);
    return risk.level === 1;
  });

  if (criticalRiver) {
    banner.style.display = "flex";
    banner.innerHTML = `
      <div class="alert-content">
        ⚠️ CRITICAL FLOOD THREAT DETECTED IN ${criticalRiver.name.toUpperCase()} BASIN
      </div>
      <button class="alert-btn" onclick="flyTo(${criticalRiver.latitude}, ${criticalRiver.longitude})">Center Map</button>
    `;
  } else {
    banner.style.display = "none";
  }
}

// ═══════════════════════════════════════════════════
// NEW LOGIC: Risk & GPS Tracking
// ═══════════════════════════════════════════════════

function evaluateRiverRisk(r) {
  const today = r.discharge_m3s || 0;
  const maxFc = r.max_forecast_m3s || 0;
  const median = r.median_discharge_m3s || 1; // avoid div/0
  const rain24h = r.rainfall_24h_mm || 0;

  if (today >= 1.4 * median || maxFc >= 1.8 * median || rain24h > 50) {
    return { level: 1, label: "CRITICAL FLOOD RISK", color: "#EF4444", badge: "SEVERE SPIKE", markerClass: "marker-critical" };
  } else if (today >= 1.1 * median || maxFc >= 1.3 * median) {
    return { level: 2, label: "ELEVATED RISK", color: "#F59E0B", badge: "WATCH", markerClass: "marker-warning" };
  } else {
    return { level: 3, label: "NORMAL FLOW", color: "#3B82F6", badge: "NORMAL", markerClass: "marker-normal" };
  }
}

let userMarker = null;

function locateUser() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }
  
  setStatus("loading", "Locating you...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.longitude || pos.coords.longitude;
      
      // Plot user
      if (userMarker) {
        userMarker.setLatLng([lat, lng]);
      } else {
        userMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "",
            html: '<div class="gps-marker"><div class="gps-pulse"></div></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          }),
          zIndexOffset: 1000
        }).addTo(map);
      }
      
      // Calculate closest hazard
      let closestWarning = "No nearby critical hazards detected.";
      let minDist = Infinity;
      
      (currentData.rivers || []).forEach(r => {
        const risk = evaluateRiverRisk(r);
        if (risk.level === 1) {
          const dist = getDistanceFromLatLonInKm(lat, lng, r.latitude, r.longitude);
          if (dist < minDist) {
            minDist = dist;
            closestWarning = `Closest Alert: ${r.name} - ${Math.round(dist)} km away`;
          }
        }
      });
      
      userMarker.bindPopup(`
        <div class="popup-content" style="padding: 10px; text-align: center;">
          <h3 style="margin-bottom: 5px;">📍 Your Current Location</h3>
          <p style="font-size: 0.85rem; color: var(--clr-text-dim);">${closestWarning}</p>
        </div>
      `).openPopup();
      
      map.flyTo([lat, lng], 10);
      setStatus("live", "Location found");
    },
    (err) => {
      setStatus("error", "Location access denied or failed.");
    },
    { enableHighAccuracy: true }
  );
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;  
  const dLon = (lon2 - lon1) * Math.PI / 180; 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}


// ═══════════════════════════════════════════════════
// EMERGENCY MODAL TOGGLE
// ═══════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("fab-emergency");
  const modal = document.getElementById("emergency-modal");
  const closeBtn = document.getElementById("emergency-close");

  if (fab && modal && closeBtn) {
    fab.addEventListener("click", () => {
      modal.classList.add("active");
    });

    closeBtn.addEventListener("click", () => {
      modal.classList.remove("active");
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.classList.remove("active");
      }
    });
  }
});
