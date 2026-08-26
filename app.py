"""
Nepal Multi-Source Disaster Tracker — Flask Backend
Fetches data from three APIs concurrently:
  A) Open-Meteo Flood API (river discharge levels)
  B) USGS Earthquake API (recent seismic events)
  C) NASA EONET v3 (macro disaster events)
"""

from flask import Flask, render_template, jsonify
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
import requests
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 4

# ── Nepal River Stations ───────────────────────────
# Major rivers with representative gauge coordinates and downstream context
NEPAL_RIVERS = [
    {
        "name": "Bhotekoshi River", "lat": 28.23, "lon": 85.38,
        "region": "Timure / Rasuwa Border",
        "downstream_risk": "High risk of flash flooding and GLOF downstream.",
        "tag": "High-Elevation GLOF Corridor",
        "transboundary": True,
    },
    {
        "name": "Trishuli River", "lat": 28.16, "lon": 85.34,
        "region": "Syabrubesi",
        "downstream_risk": "Impacts downstream hydropower projects and settlements.",
        "tag": "Downstream Flash Flood Zone",
        "transboundary": True,
    },
    {
        "name": "Koshi River Basin", "lat": 26.85, "lon": 87.15,
        "region": "Eastern Nepal",
        "downstream_risk": "If discharge exceeds normal thresholds, downstream settlements across the Sunsari and Saptari districts in the Terai plains are at high risk of inundation.",
        "transboundary": False,
    },
    {
        "name": "Bagmati River Basin", "lat": 27.68, "lon": 85.31,
        "region": "Kathmandu Valley",
        "downstream_risk": "Elevated discharge threatens densely populated areas along the Kathmandu Valley corridor and Sarlahi district lowlands downstream.",
        "transboundary": False,
    },
    {
        "name": "Narayani / Gandaki Basin", "lat": 27.70, "lon": 84.42,
        "region": "Central Nepal",
        "downstream_risk": "If discharge exceeds normal thresholds, downstream settlements in the Chitwan and Nawalparasi districts in the Terai plains are at high risk of inundation.",
        "transboundary": False,
    },
    {
        "name": "Karnali River Basin", "lat": 28.62, "lon": 81.28,
        "region": "Western Nepal",
        "downstream_risk": "Excess flow threatens the Bardiya and Kailali districts; Karnali floods historically cause widespread displacement in the far-western Terai.",
        "transboundary": False,
    },
    {
        "name": "Rapti River Basin", "lat": 27.98, "lon": 82.50,
        "region": "Mid-Western Nepal",
        "downstream_risk": "If discharge exceeds normal thresholds, downstream settlements in the Banke and Dang districts are at high risk of riverine flooding.",
        "transboundary": False,
    },
]

# ── API URLs ───────────────────────────────────────
EONET_URL = (
    "https://eonet.gsfc.nasa.gov/api/v3/events"
    "?bbox=79.0,26.0,89.0,31.5"
    "&status=all"
    "&days=30"
)

USGS_URL_TEMPLATE = (
    "https://earthquake.usgs.gov/fdsnws/event/1/query"
    "?format=geojson"
    "&minlatitude=26.0&maxlatitude=31.5"
    "&minlongitude=79.0&maxlongitude=89.0"
    "&starttime={start_date}"
)

FLOOD_URL_TEMPLATE = (
    "https://flood-api.open-meteo.com/v1/flood"
    "?latitude={lat}&longitude={lon}"
    "&daily=river_discharge,river_discharge_median,river_discharge_max,precipitation_sum"
    "&forecast_days=7"
)

RELIEFWEB_URL = (
    "https://api.reliefweb.int/v1/disasters"
    "?appname=nepal-disaster-tracker"
    "&profile=full"
    "&preset=latest"
    "&query[value]=country.name:Nepal"
    "&limit=10"
)

GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/map"


# ── Routes ─────────────────────────────────────────
@app.route("/")
def index():
    """Serve the main map page."""
    return render_template("index.html")


@app.route("/api/all")
def get_all_data():
    """
    Fetch all three data sources concurrently and return combined JSON.
    Each source is independent — if one fails, the others still return.
    """
    results = {
        "rivers": [],
        "earthquakes": [],
        "eonet": [],
        "reliefweb": [],
        "gdacs": [],
        "errors": [],
    }

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(fetch_rivers): "rivers",
            executor.submit(fetch_earthquakes): "earthquakes",
            executor.submit(fetch_eonet): "eonet",
            executor.submit(fetch_reliefweb): "reliefweb",
            executor.submit(fetch_gdacs): "gdacs",
        }

        for future in as_completed(futures):
            source = futures[future]
            try:
                results[source] = future.result()
            except Exception as exc:
                logger.error("Error fetching %s: %s", source, exc)
                results["errors"].append({
                    "source": source,
                    "error": str(exc),
                })

    results["counts"] = {
        "rivers": len(results["rivers"]),
        "earthquakes": len(results["earthquakes"]),
        "eonet": len(results["eonet"]),
        "reliefweb": len(results["reliefweb"]),
        "gdacs": len(results["gdacs"]),
    }

    logger.info(
        "Returning data — Rivers: %d, Earthquakes: %d, EONET: %d",
        len(results["rivers"]),
        len(results["earthquakes"]),
        len(results["eonet"]),
    )

    return jsonify(results)


# ── Source A: River Discharge (Open-Meteo GloFAS) ──
def fetch_rivers():
    """Fetch 7-day river discharge forecast for each major Nepal river."""
    river_data = []

    try:
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_map = {}
            for river in NEPAL_RIVERS:
                url = FLOOD_URL_TEMPLATE.format(lat=river["lat"], lon=river["lon"])
                future_map[executor.submit(requests.get, url, timeout=4)] = river

            for future in as_completed(future_map):
                river = future_map[future]
                try:
                    resp = future.result()
                    resp.raise_for_status()
                    data = resp.json()

                    daily = data.get("daily", {})
                    discharges = daily.get("river_discharge", [])
                    median_discharges = daily.get("river_discharge_median", [])
                    max_discharges = daily.get("river_discharge_max", [])
                    precipitations = daily.get("precipitation_sum", [])
                    dates = daily.get("time", [])

                    # Today's discharge, median, and precipitation
                    today_discharge = None
                    today_median = None
                    today_date = None
                    rainfall_24h = None
                    for d, m, p, t in zip(discharges, median_discharges if median_discharges else [None]*len(discharges), precipitations if precipitations else [None]*len(discharges), dates):
                        if d is not None:
                            today_discharge = round(d, 2)
                            if m is not None:
                                today_median = round(m, 2)
                            if p is not None:
                                rainfall_24h = round(p, 2)
                            today_date = t
                            break

                    # 7-day max forecast peak
                    max_forecast = None
                    max_forecast_date = None
                    for d, t in zip(max_discharges, dates):
                        if d is not None and (max_forecast is None or d > max_forecast):
                            max_forecast = round(d, 2)
                            max_forecast_date = t

                    river_data.append({
                        "name": river["name"],
                        "region": river["region"],
                        "latitude": river["lat"],
                        "longitude": river["lon"],
                        "downstream_risk": river.get("downstream_risk", ""),
                        "tag": river.get("tag", ""),
                        "transboundary": river.get("transboundary", False),
                        "discharge_m3s": today_discharge,
                        "median_discharge_m3s": today_median,
                        "rainfall_24h_mm": rainfall_24h,
                        "date": today_date,
                        "max_forecast_m3s": max_forecast,
                        "max_forecast_date": max_forecast_date,
                        "forecast_discharges": discharges[:7] if discharges else [],
                        "forecast_max_discharges": max_discharges[:7] if max_discharges else [],
                        "forecast_dates": dates[:7] if dates else [],
                    })

                except Exception as exc:
                    logger.warning("Failed to fetch %s: %s", river["name"], exc)
                    river_data.append({
                        "name": river["name"],
                        "region": river["region"],
                        "latitude": river["lat"],
                        "longitude": river["lon"],
                        "downstream_risk": river.get("downstream_risk", ""),
                        "tag": river.get("tag", ""),
                        "transboundary": river.get("transboundary", False),
                        "discharge_m3s": None,
                        "median_discharge_m3s": None,
                        "date": None,
                        "error": str(exc),
                    })

        return river_data
    except Exception as exc:
        logger.error(f"Global error in fetch_rivers: {exc}")
        return []


# ── Source B: Earthquakes (USGS) ───────────────────
def fetch_earthquakes():
    """Fetch recent earthquakes from USGS within Nepal's bounding box."""
    try:
        start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
        url = USGS_URL_TEMPLATE.format(start_date=start_date)

        resp = requests.get(url, timeout=4)
        resp.raise_for_status()
        data = resp.json()

        quakes = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [0, 0, 0])

            quakes.append({
                "id": feature.get("id", ""),
                "title": props.get("title", "Unknown Earthquake"),
                "magnitude": props.get("mag"),
                "place": props.get("place", ""),
                "time": props.get("time"),  # epoch ms
                "url": props.get("url", ""),
                "latitude": coords[1] if len(coords) > 1 else None,
                "longitude": coords[0] if len(coords) > 0 else None,
                "depth_km": round(coords[2], 1) if len(coords) > 2 else None,
                "status": props.get("status", ""),
                "type": props.get("type", ""),
            })

        # Sort by most recent first
        quakes.sort(key=lambda q: q.get("time") or 0, reverse=True)
        return quakes
    except Exception as exc:
        logger.error(f"USGS fetch failed: {exc}")
        return []


# ── Source C: EONET Macro Events ───────────────────
def fetch_eonet():
    """Fetch NASA EONET events within Nepal's bounding box."""
    try:
        resp = requests.get(EONET_URL, timeout=4)
        resp.raise_for_status()
        data = resp.json()

        events = []
        for event in data.get("events", []):
            geometries = []
            for geom in event.get("geometry", []):
                coords = geom.get("coordinates")
                if coords and len(coords) >= 2:
                    geometries.append({
                        "longitude": coords[0],
                        "latitude": coords[1],
                        "date": geom.get("date", ""),
                        "type": geom.get("type", "Point"),
                    })

            categories = [cat.get("title", "Unknown") for cat in event.get("categories", [])]
            sources = [{"id": src.get("id", ""), "url": src.get("url", "")} for src in event.get("sources", [])]

            closed_date = event.get("closed")
            status = "closed" if closed_date else "open"

            events.append({
                "id": event.get("id", ""),
                "title": event.get("title", "Unnamed Event"),
                "status": status,
                "closed": closed_date,
                "categories": categories,
                "sources": sources,
                "geometries": geometries,
                "link": event.get("link", ""),
            })

        return events
    except Exception as exc:
        logger.error(f"EONET fetch failed: {exc}")
        return []


# ── Source D: UN OCHA ReliefWeb Disasters ──────────
def fetch_reliefweb():
    """Fetch live disaster events from ReliefWeb API."""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        resp = requests.get(RELIEFWEB_URL, headers=headers, timeout=4)
        resp.raise_for_status()
        data = resp.json()

        incidents = []
        for item in data.get("data", []):
            fields = item.get("fields", {})
            title = fields.get("name", "Unknown Incident")
            date = fields.get("date", {}).get("created", "")
            status = fields.get("status", "unknown")
            description = fields.get("description", "")
            url = fields.get("url", "")

            # Get primary coordinates safely
            primary_country = fields.get("primary_country", {})
            lat = primary_country.get("location", {}).get("lat") if primary_country else None
            lon = primary_country.get("location", {}).get("lon") if primary_country else None

            # Extract types safely
            types = [t.get("name") for t in fields.get("type", [])] if fields.get("type") else ["Unknown"]

            incidents.append({
                "id": item.get("id"),
                "title": title,
                "type": ", ".join(types),
                "status": status,
                "description": description,
                "date": date,
                "latitude": lat,
                "longitude": lon,
                "url": url
            })

        return incidents
    except Exception as exc:
        logger.error(f"ReliefWeb fetch failed: {exc}")
        return []

# ── Source E: GDACS Hazards ────────────────────────
def fetch_gdacs():
    """Fetch live hazard events from GDACS and filter for Nepal."""
    try:
        resp = requests.get(GDACS_URL, timeout=4)
        resp.raise_for_status()
        data = resp.json()

        events = []
        for feature in data.get("features", []):
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [])
            
            if not coords or len(coords) < 2:
                continue
                
            lon, lat = coords[0], coords[1]
            
            # Nepal Bounding Box Filter
            if 26.0 <= lat <= 31.5 and 79.0 <= lon <= 89.0:
                events.append({
                    "id": props.get("eventid", ""),
                    "title": props.get("name", "Unknown GDACS Event"),
                    "type": props.get("eventtype", ""),
                    "alert_level": props.get("alertlevel", "Green"),
                    "description": props.get("description", ""),
                    "date": props.get("todate", ""),
                    "latitude": lat,
                    "longitude": lon,
                    "url": props.get("url", "")
                })
                
        return events
    except Exception as exc:
        logger.error(f"GDACS fetch failed: {exc}")
        return []




if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
