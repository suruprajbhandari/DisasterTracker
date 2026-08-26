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

REQUEST_TIMEOUT = 20

# ── Nepal River Stations ───────────────────────────
# Major rivers with representative gauge coordinates
NEPAL_RIVERS = [
    {"name": "Koshi River",    "lat": 26.87, "lon": 87.16, "region": "Eastern Nepal"},
    {"name": "Bagmati River",  "lat": 27.62, "lon": 85.20, "region": "Kathmandu Valley"},
    {"name": "Narayani River", "lat": 27.70, "lon": 84.42, "region": "Central Nepal"},
    {"name": "Karnali River",  "lat": 28.60, "lon": 81.62, "region": "Western Nepal"},
    {"name": "Rapti River",    "lat": 27.62, "lon": 82.67, "region": "Mid-Western Nepal"},
]

# ── API URLs ───────────────────────────────────────
EONET_URL = (
    "https://eonet.gsfc.nasa.gov/api/v3/events"
    "?bbox=80.06,30.45,88.20,26.36"
    "&status=all"
    "&days=30"
)

USGS_URL_TEMPLATE = (
    "https://earthquake.usgs.gov/fdsnws/event/1/query"
    "?format=geojson"
    "&minlatitude=26.36&maxlatitude=30.45"
    "&minlongitude=80.06&maxlongitude=88.20"
    "&starttime={start_date}"
)

FLOOD_URL_TEMPLATE = (
    "https://flood-api.open-meteo.com/v1/flood"
    "?latitude={lat}&longitude={lon}"
    "&daily=river_discharge"
    "&forecast_days=1"
    "&past_days=7"
)


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
        "errors": [],
    }

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(fetch_rivers): "rivers",
            executor.submit(fetch_earthquakes): "earthquakes",
            executor.submit(fetch_eonet): "eonet",
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
    }

    logger.info(
        "Returning data — Rivers: %d, Earthquakes: %d, EONET: %d",
        len(results["rivers"]),
        len(results["earthquakes"]),
        len(results["eonet"]),
    )

    return jsonify(results)


# ── Source A: River Discharge (Open-Meteo) ─────────
def fetch_rivers():
    """Fetch river discharge data for each major Nepal river."""
    river_data = []

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {}
        for river in NEPAL_RIVERS:
            url = FLOOD_URL_TEMPLATE.format(lat=river["lat"], lon=river["lon"])
            future_map[executor.submit(requests.get, url, timeout=REQUEST_TIMEOUT)] = river

        for future in as_completed(future_map):
            river = future_map[future]
            try:
                resp = future.result()
                resp.raise_for_status()
                data = resp.json()

                daily = data.get("daily", {})
                discharges = daily.get("river_discharge", [])
                dates = daily.get("time", [])

                # Get the latest non-null discharge value
                latest_discharge = None
                latest_date = None
                for d, t in zip(reversed(discharges), reversed(dates)):
                    if d is not None:
                        latest_discharge = round(d, 2)
                        latest_date = t
                        break

                river_data.append({
                    "name": river["name"],
                    "region": river["region"],
                    "latitude": river["lat"],
                    "longitude": river["lon"],
                    "discharge_m3s": latest_discharge,
                    "date": latest_date,
                    "all_discharges": discharges[-7:] if discharges else [],
                    "all_dates": dates[-7:] if dates else [],
                })

            except Exception as exc:
                logger.warning("Failed to fetch %s: %s", river["name"], exc)
                river_data.append({
                    "name": river["name"],
                    "region": river["region"],
                    "latitude": river["lat"],
                    "longitude": river["lon"],
                    "discharge_m3s": None,
                    "date": None,
                    "error": str(exc),
                })

    return river_data


# ── Source B: Earthquakes (USGS) ───────────────────
def fetch_earthquakes():
    """Fetch recent earthquakes from USGS within Nepal's bounding box."""
    start_date = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    url = USGS_URL_TEMPLATE.format(start_date=start_date)

    resp = requests.get(url, timeout=REQUEST_TIMEOUT)
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
            "latitude": coords[1],
            "longitude": coords[0],
            "depth_km": round(coords[2], 1) if len(coords) > 2 else None,
            "status": props.get("status", ""),
            "type": props.get("type", ""),
        })

    # Sort by most recent first
    quakes.sort(key=lambda q: q.get("time") or 0, reverse=True)
    return quakes


# ── Source C: EONET Macro Events ───────────────────
def fetch_eonet():
    """Fetch NASA EONET events within Nepal's bounding box."""
    resp = requests.get(EONET_URL, timeout=REQUEST_TIMEOUT)
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


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
