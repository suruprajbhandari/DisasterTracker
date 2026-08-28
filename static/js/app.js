/**
 * Nepal Multi-Source Disaster Tracker — v2.0
 * Features: Live multi-API dashboard, Rasuwa 2026 GLOF path,
 * Historical disasters timeline, GDACS markers, improved alerts
 */

// ── Constants ─────────────────────────────────────
const NEPAL_CENTER  = [28.3949, 84.1240];
const ZOOM_DEFAULT  = 7;
const ZOOM_MIN      = 6;
const ZOOM_MAX      = 18;
const API_ENDPOINT  = "/api/all";
const REFRESH_MS    = 5 * 60 * 1000;

const NEPAL_BOUNDS = L.latLngBounds(
  L.latLng(25.5, 79.0),
  L.latLng(31.5, 89.5)
);

// ── State ─────────────────────────────────────────
let map;
let riverLayer, quakeLayer, eonetLayer, reliefwebLayer, gdacsLayer;
let floodPathLayer, historicalLayer;
let currentData = { rivers: [], earthquakes: [], eonet: [], reliefweb: [], gdacs: [] };
let floodPathVisible = false;
let historicalVisible = false;
let alertCycleInterval = null;
let userMarker = null;

// ═══════════════════════════════════════════════════
// RASUWA 2026 GLOF FLOOD PATH DATA
// ═══════════════════════════════════════════════════
const RASUWA_FLOOD_PATH = [
  // Origin in Tibet — glacial collapse area (Kyirong/Gyirong side)
  [28.40, 85.43],
  // Upper Bhote Koshi gorge in Tibet
  [28.35, 85.41],
  // Tibet-Nepal border zone
  [28.30, 85.39],
  // Rasuwagadhi border crossing (28.278°N, 85.378°E)
  [28.278, 85.378],
  // Timure settlement (28.2537°N, 85.3665°E)
  [28.2537, 85.3665],
  // Bhote Koshi gorge between Timure and Syabrubesi
  [28.22, 85.35],
  // Approaching Syabrubesi
  [28.19, 85.32],
  // Syabrubesi — confluence of Bhote Koshi and Langtang Khola (28.17°N, 85.30°E)
  [28.17, 85.30],
  // Below Syabrubesi — Trishuli River begins
  [28.14, 85.29],
  // Dhunche approach (28.11°N, 85.29°E)
  [28.11, 85.29],
  // Trishuli gorge south of Dhunche
  [28.06, 85.26],
  // Trishuli corridor — hydropower zone
  [28.02, 85.22],
  // Approaching Betrawati
  [27.99, 85.19],
  // Betrawati — Trishuli-Phalakhu confluence (27.97°N, 85.18°E)
  [27.97, 85.18],
];

const RASUWA_FLOOD_WAYPOINTS = [
  {
    name: "Glacial Collapse Origin (Tibet)",
    lat: 28.40, lon: 85.43,
    icon: "🏔️",
    type: "origin",
    details: "Ice-rock avalanche from high-altitude glacier in Kyirong/Gyirong area blocked Lhende Khola, forming a temporary barrier lake that burst catastrophically.",
    impact: "Triggering event — massive debris surge of water, sediment, and boulders released downstream into the Bhote Koshi gorge.",
    time: "~9:00 AM, Aug 26, 2026"
  },
  {
    name: "Rasuwagadhi Border Crossing",
    lat: 28.278, lon: 85.378,
    icon: "🚧",
    type: "destroyed",
    details: "The Rasuwagadhi (Kerung) border crossing — Nepal's key land link to China — and all connecting infrastructure completely destroyed.",
    impact: "42 km of road between Betrawati and the border obliterated. Nepal-China land connectivity severed.",
    time: "~9:10 AM, Aug 26"
  },
  {
    name: "Timure Settlement",
    lat: 28.2537, lon: 85.3665,
    icon: "🔴",
    type: "critical",
    details: "First major Nepal settlement hit along Bhote Koshi. Wall of water rose 8-10 meters. Police border post and APF camp swept away.",
    impact: "Multiple police personnel missing. Entire market area devastated. Custom checkpoint destroyed.",
    time: "~9:15 AM, Aug 26"
  },
  {
    name: "Syabrubesi",
    lat: 28.17, lon: 85.30,
    icon: "🔴",
    type: "critical",
    details: "Major settlement at Bhote Koshi-Langtang Khola confluence. Gateway to Langtang Valley trekking route severely impacted.",
    impact: "Hotels, lodges, and homes destroyed. Multiple hydropower project infrastructure damaged. Trekkers stranded.",
    time: "~9:25 AM, Aug 26"
  },
  {
    name: "Trishuli Hydropower Corridor",
    lat: 28.02, lon: 85.22,
    icon: "⚡",
    type: "infrastructure",
    details: "Multiple hydropower projects along the Trishuli River corridor between Dhunche and Betrawati suffered catastrophic damage.",
    impact: "Hundreds of megawatts of generation capacity damaged. Workers trapped in tunnels. Intake dams breached.",
    time: "~9:40 AM, Aug 26"
  },
  {
    name: "Betrawati (Downstream Limit)",
    lat: 27.97, lon: 85.18,
    icon: "🟠",
    type: "downstream",
    details: "Furthest downstream significant impact zone at the Trishuli-Phalakhu-Betrawati river confluence in Nuwakot District.",
    impact: "Flood surge still carried destructive force. Bridges and riverside infrastructure damaged. Downstream warning issued.",
    time: "~10:00+ AM, Aug 26"
  },
];

// ═══════════════════════════════════════════════════
// HISTORICAL DISASTERS DATABASE
// ═══════════════════════════════════════════════════
const HISTORICAL_DISASTERS = [
  {
    id: "gorkha-eq-2015",
    year: 2015,
    date: "April 25, 2015",
    title: "Gorkha Earthquake (M7.8)",
    type: "earthquake",
    icon: "🟤",
    lat: 28.23, lon: 84.73,
    location: "Barpak, Gorkha District",
    casualties: "~8,900 killed, 22,300 injured",
    description: "The deadliest earthquake in Nepal's modern history. Epicenter near Barpak, Gorkha. Triggered massive landslides and avalanches across central Nepal. Kathmandu's historic Durbar Square heavily damaged.",
    magnitude: 7.8,
  },
  {
    id: "gorkha-aftershock-2015",
    year: 2015,
    date: "May 12, 2015",
    title: "Gorkha Aftershock (M7.3)",
    type: "earthquake",
    icon: "🟤",
    lat: 27.81, lon: 86.07,
    location: "Kodari, Dolakha District",
    casualties: "~218 killed, 3,600+ injured",
    description: "Major aftershock that struck while rescue operations were still underway. Triggered further landslides, particularly damaging in Dolakha and Sindhupalchowk.",
    magnitude: 7.3,
  },
  {
    id: "terai-floods-2017",
    year: 2017,
    date: "August 2017",
    title: "Terai Monsoon Mega-Floods",
    type: "flood",
    icon: "🔵",
    lat: 26.7, lon: 85.5,
    location: "Saptari, Rautahat, Bara (Terai Plains)",
    casualties: "160+ killed, 1.7 million displaced",
    description: "Unprecedented monsoon flooding across the southern Terai plains. One-third of Nepal was submerged. Massive displacement and destruction of crops and livestock.",
  },
  {
    id: "myagdi-landslides-2020",
    year: 2020,
    date: "September 2020",
    title: "Western Nepal Landslides & Floods",
    type: "landslide",
    icon: "🟠",
    lat: 28.38, lon: 83.5,
    location: "Myagdi, Jajarkot Districts",
    casualties: "300+ killed across monsoon season",
    description: "The 2020 monsoon season was exceptionally deadly. Heavy rainfall triggered hundreds of landslides across western Nepal.",
  },
  {
    id: "melamchi-flood-2021-june",
    year: 2021,
    date: "June 15, 2021",
    title: "Melamchi Flood (June)",
    type: "flood",
    icon: "🔵",
    lat: 27.85, lon: 85.55,
    location: "Melamchi, Sindhupalchowk",
    casualties: "~25 killed, 100+ missing",
    description: "A catastrophic debris-laden flash flood devastated Melamchi Bazaar. Triggered by intense rainfall causing upstream landslides that temporarily dammed the river before bursting. Destroyed homes, bridges, and the Melamchi Water Supply Project infrastructure.",
  },
  {
    id: "melamchi-flood-2021-aug",
    year: 2021,
    date: "August 1, 2021",
    title: "Melamchi Flood (Second Wave)",
    type: "flood",
    icon: "🔵",
    lat: 27.82, lon: 85.57,
    location: "Melamchi, Sindhupalchowk",
    casualties: "Additional casualties, massive debris",
    description: "Second severe flood hit the same Melamchi corridor while recovery from June was underway. Further destroyed infrastructure and buried areas under debris.",
  },
  {
    id: "thame-glof-2024",
    year: 2024,
    date: "August 16, 2024",
    title: "Thame GLOF (Khumbu)",
    type: "glof",
    icon: "🏔️",
    lat: 27.89, lon: 86.62,
    location: "Thame Village, Solukhumbu (Everest Region)",
    casualties: "Homes, school, health clinic destroyed, 135+ displaced",
    description: "Glacial Lake Outburst Flood from Upper and Lower Ngole Cho lakes. A rock avalanche into the upper lake created a surge that overtopped the moraine, breaching both lakes. Debris traveled 80+ km along Dudh Koshi River.",
  },
  {
    id: "rasuwa-glof-2026",
    year: 2026,
    date: "August 26, 2026",
    title: "Rasuwa GLOF (Tibet → Nepal)",
    type: "glof",
    icon: "🔴",
    lat: 28.28, lon: 85.38,
    location: "Timure, Rasuwa District",
    casualties: "500+ killed, 1,500+ missing (ongoing)",
    description: "Catastrophic transboundary GLOF originating from a glacial/ice-rock collapse in Tibet. Surge swept through Bhote Koshi → Trishuli River, devastating Timure, Syabrubesi, Rasuwagadhi, and multiple hydropower projects. 42 km of road destroyed.",
    isActive: true,
  },
];


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

  baseLayers.satellite.addTo(map);

  // Data overlay groups
  riverLayer = L.layerGroup().addTo(map);
  quakeLayer = L.layerGroup().addTo(map);
  eonetLayer = L.layerGroup().addTo(map);
  reliefwebLayer = L.layerGroup().addTo(map);
  gdacsLayer = L.layerGroup().addTo(map);
  floodPathLayer = L.layerGroup();
  historicalLayer = L.layerGroup();

  L.control.zoom({ position: "topright" }).addTo(map);

  // Custom Layer Control
  function switchBaseLayer(selectedKey) {
      Object.values(baseLayers).forEach(layer => {
          if (map.hasLayer(layer)) map.removeLayer(layer);
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
    const gdacs = data.gdacs || [];

    renderRiverMarkers(rivers);
    renderReliefWebMarkers(reliefweb);
    renderQuakeMarkers(earthquakes);
    renderEonetMarkers(eonet);
    renderGdacsMarkers(gdacs);

    renderRiverList(rivers);
    renderReliefWebList(reliefweb);
    renderQuakeList(earthquakes);
    renderEonetList(eonet);
    renderGdacsList(gdacs);

    updateCounts(data.counts || {});
    updateTopAlert(rivers, reliefweb, gdacs);

    const total = rivers.length + earthquakes.length + eonet.length + reliefweb.length + gdacs.length;
    setStatus("live", `${total} data points loaded`);
  } catch (err) {
    console.error("Fetch error:", err);
    setStatus("error", "Failed to load data");
  }
}

// ═══════════════════════════════════════════════════
// RISK EVALUATION
// ═══════════════════════════════════════════════════
function evaluateRiverRisk(r) {
  const today = r.discharge_m3s || 0;
  const maxFc = r.max_forecast_m3s || 0;
  const median = r.median_discharge_m3s || 1;

  if (today >= 1.4 * median || maxFc >= 1.8 * median) {
    return { level: 1, label: "CRITICAL FLOOD RISK", color: "#EF4444", badge: "SEVERE SPIKE", markerClass: "risk-critical-marker" };
  } else if (today >= 1.1 * median || maxFc >= 1.3 * median) {
    return { level: 2, label: "ELEVATED RISK", color: "#F59E0B", badge: "WATCH", markerClass: "risk-high-marker" };
  } else {
    return { level: 3, label: "NORMAL FLOW", color: "#3B82F6", badge: "NORMAL", markerClass: "risk-normal-marker" };
  }
}

// ═══════════════════════════════════════════════════
// RIVER MARKERS
// ═══════════════════════════════════════════════════
function renderRiverMarkers(rivers) {
  riverLayer.clearLayers();

  rivers.forEach((r) => {
    const risk = evaluateRiverRisk(r);
    const markerSize = 44;

    const marker = L.marker([r.latitude, r.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="river-marker ${risk.markerClass}" style="
          width:${markerSize}px; height:${markerSize}px;
        ">💧</div>`,
        iconSize: [markerSize, markerSize],
        iconAnchor: [markerSize / 2, markerSize / 2],
        popupAnchor: [0, -markerSize / 2 - 6],
      }),
      zIndexOffset: 500,
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

  return `
    <div class="popup-content popup-river-enhanced">
      <div class="popup-source-badge source-river" style="background:${risk.color}33; color:${risk.color}; border:1px solid ${risk.color}55;">
        ${risk.badge} · ${risk.label}
      </div>
      <h3>${esc(r.name)}</h3>
      <div class="popup-detail"><span class="detail-icon">📍</span><span>${esc(r.region)}</span></div>
      ${transboundaryBadge}
      ${steepGorgeBadge}
      ${gdacsBadge}

      <div class="popup-divider"></div>

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

      <div class="risk-badge" style="background:${risk.color}22; color:${risk.color}; border:1px solid ${risk.color}55;">
        Status: ${risk.label}
      </div>

      ${chart}

      <div class="popup-divider"></div>

      <div class="popup-context">
        <div class="context-heading">⚠️ Downstream Risk Assessment</div>
        <p>${esc(r.downstream_risk || "No downstream risk data available for this station.")}</p>
      </div>

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

// ═══════════════════════════════════════════════════
// EARTHQUAKE MARKERS
// ═══════════════════════════════════════════════════
function renderQuakeMarkers(quakes) {
  quakeLayer.clearLayers();

  quakes.forEach((q) => {
    const mag = q.magnitude || 0;
    const size = Math.max(14, Math.min(28, mag * 5));
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
      zIndexOffset: 100,
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
// EONET MARKERS
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
// RELIEFWEB MARKERS
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
        <p style="font-size:0.75rem; color:var(--clr-text-dim); margin-bottom:10px;">${esc(inc.description).substring(0, 200)}${inc.description && inc.description.length > 200 ? '...' : ''}</p>
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
// GDACS MARKERS (NEW)
// ═══════════════════════════════════════════════════
function renderGdacsMarkers(events) {
  gdacsLayer.clearLayers();

  events.forEach((evt) => {
    if (!evt.latitude || !evt.longitude) return;

    const alertColors = {
      Red: { bg: "#dc2626", glow: "rgba(220,38,38,0.6)" },
      Orange: { bg: "#f97316", glow: "rgba(249,115,22,0.5)" },
      Green: { bg: "#22c55e", glow: "rgba(34,197,94,0.4)" },
    };
    const colors = alertColors[evt.alert_level] || alertColors.Green;
    const size = evt.alert_level === "Red" ? 34 : 28;

    const marker = L.marker([evt.latitude, evt.longitude], {
      icon: L.divIcon({
        className: "",
        html: `<div class="gdacs-marker" style="
          width:${size}px; height:${size}px;
          background:${colors.bg};
          box-shadow: 0 0 16px ${colors.glow};
        ">🌐</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 4],
      }),
      zIndexOffset: 350,
    });

    const date = evt.date ? formatDate(evt.date) : "—";

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-source-badge source-gdacs">🌐 GDACS Alert — ${esc(evt.alert_level)}</div>
        <h3>${esc(evt.title)}</h3>
        <div class="popup-detail"><span class="detail-icon">🏷️</span><span>Type: <strong>${esc(evt.type)}</strong></span></div>
        <div class="popup-detail"><span class="detail-icon">⚠️</span><span>Alert Level: <strong style="color:${colors.bg}">${esc(evt.alert_level)}</strong></span></div>
        <div class="popup-detail"><span class="detail-icon">📅</span><span>${date}</span></div>
        <div class="popup-divider"></div>
        <p style="font-size:0.75rem; color:var(--clr-text-dim); margin-bottom:10px;">${esc(evt.description || "").substring(0, 200)}</p>
        ${evt.url ? `<a class="popup-link" href="${evt.url}" target="_blank" rel="noopener noreferrer">🌐 GDACS Details ↗</a>` : ""}
        <div class="popup-attribution">Data: <strong>GDACS</strong> · Global Disaster Alert and Coordination System</div>
      </div>
    `, {
      maxWidth: 340, minWidth: 280, maxHeight: 400,
      autoPan: true, closeButton: true, className: "custom-disaster-popup"
    });

    gdacsLayer.addLayer(marker);
  });
}

// ═══════════════════════════════════════════════════
// RASUWA 2026 FLOOD PATH OVERLAY
// ═══════════════════════════════════════════════════
function renderFloodPath() {
  floodPathLayer.clearLayers();

  // Animated polyline — the flood corridor
  const polyline = L.polyline(RASUWA_FLOOD_PATH, {
    color: '#ef4444',
    weight: 5,
    opacity: 0.9,
    dashArray: '12, 8',
    className: 'flood-path-line',
  });
  floodPathLayer.addLayer(polyline);

  // Outer glow line
  const glowLine = L.polyline(RASUWA_FLOOD_PATH, {
    color: '#ef4444',
    weight: 14,
    opacity: 0.15,
    lineCap: 'round',
  });
  floodPathLayer.addLayer(glowLine);

  // Direction arrows along the path (flow direction indicators)
  for (let i = 1; i < RASUWA_FLOOD_PATH.length - 1; i += 2) {
    const pt = RASUWA_FLOOD_PATH[i];
    const arrowMarker = L.marker(pt, {
      icon: L.divIcon({
        className: "",
        html: `<div class="flood-flow-arrow">▼</div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
      interactive: false,
    });
    floodPathLayer.addLayer(arrowMarker);
  }

  // Waypoint markers
  RASUWA_FLOOD_WAYPOINTS.forEach((wp) => {
    const typeColors = {
      origin: { bg: "#7c3aed", border: "#a78bfa" },
      destroyed: { bg: "#dc2626", border: "#f87171" },
      critical: { bg: "#ef4444", border: "#fca5a5" },
      infrastructure: { bg: "#f59e0b", border: "#fcd34d" },
      downstream: { bg: "#f97316", border: "#fdba74" },
    };
    const colors = typeColors[wp.type] || typeColors.critical;
    const size = wp.type === "origin" ? 40 : 34;

    const marker = L.marker([wp.lat, wp.lon], {
      icon: L.divIcon({
        className: "",
        html: `<div class="flood-waypoint-marker" style="
          width:${size}px; height:${size}px;
          background:${colors.bg};
          border-color:${colors.border};
        ">${wp.icon}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 6],
      }),
      zIndexOffset: 800,
    });

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-source-badge" style="background:rgba(239,68,68,0.2); color:#f87171; border:1px solid rgba(239,68,68,0.4);">
          🔴 RASUWA 2026 GLOF PATH
        </div>
        <h3>${wp.icon} ${esc(wp.name)}</h3>
        <div class="popup-detail"><span class="detail-icon">🕐</span><span>${esc(wp.time)}</span></div>
        <div class="popup-divider"></div>
        <div class="popup-context" style="border-left-color: ${colors.bg}55;">
          <div class="context-heading">Event Details</div>
          <p>${esc(wp.details)}</p>
        </div>
        <div class="popup-context" style="border-left-color: #ef444455;">
          <div class="context-heading">Impact</div>
          <p>${esc(wp.impact)}</p>
        </div>
        <div class="popup-attribution">
          Source: <strong>Nepal Red Cross / ICIMOD / Media Reports</strong> · Aug 26-28, 2026
        </div>
      </div>
    `, {
      maxWidth: 340, minWidth: 280, maxHeight: 420,
      autoPan: true, closeButton: true, className: "custom-disaster-popup"
    });

    floodPathLayer.addLayer(marker);
  });
}

function toggleFloodPath(show) {
  floodPathVisible = show !== undefined ? show : !floodPathVisible;
  
  if (floodPathVisible) {
    if (floodPathLayer.getLayers().length === 0) renderFloodPath();
    floodPathLayer.addTo(map);
    // Fly to the flood corridor
    const bounds = L.latLngBounds(RASUWA_FLOOD_PATH);
    map.flyToBounds(bounds, { padding: [60, 60], duration: 1.5, maxZoom: 10 });
  } else {
    map.removeLayer(floodPathLayer);
  }
}

// ═══════════════════════════════════════════════════
// HISTORICAL DISASTERS OVERLAY
// ═══════════════════════════════════════════════════
function renderHistoricalMarkers(filterYear) {
  historicalLayer.clearLayers();

  const events = filterYear
    ? HISTORICAL_DISASTERS.filter(e => e.year === filterYear)
    : HISTORICAL_DISASTERS;

  events.forEach((evt) => {
    const typeStyles = {
      earthquake: { icon: "🟤", color: "#92400e", borderColor: "#d97706" },
      flood: { icon: "🔵", color: "#1d4ed8", borderColor: "#60a5fa" },
      landslide: { icon: "🟠", color: "#c2410c", borderColor: "#fb923c" },
      glof: { icon: "🏔️", color: "#7c3aed", borderColor: "#a78bfa" },
    };
    const style = typeStyles[evt.type] || typeStyles.flood;
    const size = evt.isActive ? 36 : 30;

    const marker = L.marker([evt.lat, evt.lon], {
      icon: L.divIcon({
        className: "",
        html: `<div class="historical-marker ${evt.isActive ? 'historical-active' : ''}" style="
          width:${size}px; height:${size}px;
          --hist-color:${style.color};
          --hist-border:${style.borderColor};
        ">${evt.icon}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2 - 6],
      }),
      zIndexOffset: 150,
    });

    const magLine = evt.magnitude ? `<div class="popup-detail"><span class="detail-icon">📊</span><span>Magnitude: <strong>${evt.magnitude}</strong></span></div>` : '';

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-source-badge" style="background:rgba(148,163,184,0.15); color:#94a3b8; border:1px solid rgba(148,163,184,0.3);">
          📜 HISTORICAL — ${evt.year}
        </div>
        <h3>${evt.icon} ${esc(evt.title)}</h3>
        <div class="popup-detail"><span class="detail-icon">📍</span><span>${esc(evt.location)}</span></div>
        <div class="popup-detail"><span class="detail-icon">📅</span><span>${esc(evt.date)}</span></div>
        ${magLine}
        <div class="popup-detail"><span class="detail-icon">💀</span><span>${esc(evt.casualties)}</span></div>
        <div class="popup-divider"></div>
        <p style="font-size:0.75rem; color:var(--clr-text-dim); line-height:1.6; margin-bottom:8px;">${esc(evt.description)}</p>
        <div class="popup-attribution">
          Source: <strong>Nepal DRR Portal / ReliefWeb / ICIMOD</strong>
        </div>
      </div>
    `, {
      maxWidth: 340, minWidth: 280, maxHeight: 420,
      autoPan: true, closeButton: true, className: "custom-disaster-popup"
    });

    historicalLayer.addLayer(marker);
  });
}

function toggleHistorical(show) {
  historicalVisible = show !== undefined ? show : !historicalVisible;
  const btn = document.getElementById("btn-history-toggle");
  const timeline = document.getElementById("timeline-panel");

  if (historicalVisible) {
    renderHistoricalMarkers(null);
    historicalLayer.addTo(map);
    if (btn) btn.classList.add("active");
    if (timeline) timeline.style.display = "flex";
  } else {
    map.removeLayer(historicalLayer);
    if (btn) btn.classList.remove("active");
    if (timeline) timeline.style.display = "none";
  }
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
    el.innerHTML = emptyMsg("No recent events found in the NASA EONET feed for this region.");
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

function renderGdacsList(events) {
  const el = document.getElementById("content-gdacs");
  if (events.length === 0) {
    el.innerHTML = emptyMsg("No active GDACS hazard alerts for this region.");
    return;
  }

  el.innerHTML = events.map((evt) => {
    const alertClass = evt.alert_level === "Red" ? "cat-wildfire" : evt.alert_level === "Orange" ? "cat-landslide" : "cat-default";
    const date = evt.date ? formatDate(evt.date) : "";
    return `
      <div class="event-card" onclick="flyTo(${evt.latitude}, ${evt.longitude})">
        <div class="event-card-title">🌐 ${esc(evt.title)}</div>
        <div class="event-card-meta">
          <span class="event-tag ${alertClass}">${esc(evt.alert_level)} Alert</span>
          <span class="event-tag cat-default">${esc(evt.type)}</span>
          <span class="event-date">${date}</span>
        </div>
      </div>
    `;
  }).join("");
}


// ═══════════════════════════════════════════════════
// IMPROVED TOP ALERT BANNER (multi-source + cycling)
// ═══════════════════════════════════════════════════
function updateTopAlert(rivers, reliefweb, gdacs) {
  const banner = document.getElementById("top-alert-banner");
  if (!banner) return;

  const alerts = [];

  // Check rivers for critical
  (rivers || []).forEach(r => {
    const risk = evaluateRiverRisk(r);
    if (risk.level === 1) {
      alerts.push({
        text: `⚠️ CRITICAL FLOOD THREAT — ${r.name.toUpperCase()} BASIN`,
        lat: r.latitude, lon: r.longitude,
      });
    }
  });

  // Check ReliefWeb for active incidents
  (reliefweb || []).forEach(inc => {
    if (inc.status && inc.status.toLowerCase() !== "past") {
      alerts.push({
        text: `🚨 RELIEFWEB — ${inc.title}`,
        lat: inc.latitude || NEPAL_CENTER[0],
        lon: inc.longitude || NEPAL_CENTER[1],
      });
    }
  });

  // Check GDACS for Orange/Red alerts
  (gdacs || []).forEach(evt => {
    if (evt.alert_level === "Red" || evt.alert_level === "Orange") {
      alerts.push({
        text: `🌐 GDACS ${evt.alert_level.toUpperCase()} ALERT — ${evt.title}`,
        lat: evt.latitude, lon: evt.longitude,
      });
    }
  });

  if (alertCycleInterval) {
    clearInterval(alertCycleInterval);
    alertCycleInterval = null;
  }

  if (alerts.length === 0) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "flex";
  let currentAlertIdx = 0;

  function showAlert(idx) {
    const alert = alerts[idx];
    const counter = alerts.length > 1 ? `<span class="alert-counter">${idx + 1}/${alerts.length}</span>` : "";
    banner.innerHTML = `
      <div class="alert-content">
        ${counter} ${alert.text}
      </div>
      <button class="alert-btn" onclick="flyTo(${alert.lat}, ${alert.lon})">Center Map</button>
    `;
  }

  showAlert(0);

  if (alerts.length > 1) {
    alertCycleInterval = setInterval(() => {
      currentAlertIdx = (currentAlertIdx + 1) % alerts.length;
      showAlert(currentAlertIdx);
    }, 6000);
  }
}

// ═══════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════

function updateCounts(counts) {
  document.getElementById("count-rivers").textContent = counts.rivers ?? 0;
  document.getElementById("count-earthquakes").textContent = counts.earthquakes ?? 0;
  document.getElementById("count-eonet").textContent = counts.eonet ?? 0;
  document.getElementById("count-reliefweb").textContent = counts.reliefweb ?? 0;
  document.getElementById("count-gdacs").textContent = counts.gdacs ?? 0;
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
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════
// CONTROLS SETUP
// ═══════════════════════════════════════════════════
function setupControls() {
  // Refresh
  const btn = document.getElementById("btn-refresh");
  btn.addEventListener("click", () => {
    btn.classList.add("spinning");
    fetchAllData().finally(() => setTimeout(() => btn.classList.remove("spinning"), 600));
  });

  // Side panel
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

  // GPS
  const btnLocate = document.getElementById("btn-locate");
  if (btnLocate) btnLocate.addEventListener("click", locateUser);

  // Section accordions
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

  // Historical toggle
  const btnHistory = document.getElementById("btn-history-toggle");
  if (btnHistory) {
    btnHistory.addEventListener("click", () => toggleHistorical());
  }

  // Timeline slider
  const slider = document.getElementById("timeline-slider");
  const yearDisplay = document.getElementById("timeline-year-display");
  const showAllBtn = document.getElementById("timeline-show-all");
  const timelineClose = document.getElementById("timeline-close");

  if (slider) {
    slider.addEventListener("input", () => {
      const year = parseInt(slider.value);
      yearDisplay.textContent = year;
      renderHistoricalMarkers(year);
      historicalLayer.addTo(map);
    });
  }

  if (showAllBtn) {
    showAllBtn.addEventListener("click", () => {
      yearDisplay.textContent = "All Years";
      slider.value = slider.max;
      renderHistoricalMarkers(null);
      historicalLayer.addTo(map);
    });
  }

  if (timelineClose) {
    timelineClose.addEventListener("click", () => toggleHistorical(false));
  }

  // Rasuwa flood path button
  const btnFlood = document.getElementById("btn-view-flood");
  if (btnFlood) {
    btnFlood.addEventListener("click", () => toggleFloodPath(true));
  }

  // Crisis banner dismiss
  const crisisDismiss = document.getElementById("crisis-dismiss");
  const crisisBanner = document.getElementById("crisis-banner");
  if (crisisDismiss && crisisBanner) {
    crisisDismiss.addEventListener("click", () => {
      crisisBanner.style.display = "none";
    });
  }
}

// ═══════════════════════════════════════════════════
// GPS LOCATE
// ═══════════════════════════════════════════════════
function locateUser() {
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }
  
  setStatus("loading", "Locating you...");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      
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
      
      let closestWarning = "No nearby critical hazards detected.";
      let minDist = Infinity;
      
      (currentData.rivers || []).forEach(r => {
        const risk = evaluateRiverRisk(r);
        if (risk.level === 1) {
          const dist = getDistanceFromLatLonInKm(lat, lng, r.latitude, r.longitude);
          if (dist < minDist) {
            minDist = dist;
            closestWarning = `Closest Alert: ${r.name} — ${Math.round(dist)} km away`;
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
    () => {
      setStatus("error", "Location access denied or failed.");
    },
    { enableHighAccuracy: true }
  );
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
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
// EMERGENCY MODAL
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
