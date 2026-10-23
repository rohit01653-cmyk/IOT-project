"""Automatic checks for checkpoints D (REST) and E (routing). Backend must be running."""

import json
import time

import requests
import websocket

BASE = "http://localhost:8000"
WS = "ws://localhost:8000/ws"
results = []


def post(path, body=None):
    r = requests.post(BASE + path, json=body or {}, timeout=3)
    r.raise_for_status()
    return r.json()


def latest_message(wait=1.5):
    """Wait for ticks, then read the newest message the WebSocket delivered."""
    ws = websocket.create_connection(WS, timeout=5)
    time.sleep(wait)
    ws.settimeout(0.2)
    last = None
    try:
        while True:
            last = json.loads(ws.recv())
    except websocket.WebSocketTimeoutException:
        pass
    ws.close()
    return last


def check(name, fn):
    try:
        ok, detail = fn()
    except Exception as e:
        ok, detail = False, f"error: {e}"
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'}  {name}  ({detail})")


def t_health():
    r = requests.get(BASE + "/health", timeout=3).json()
    return r.get("status") == "ok", str(r)


def t_maps():
    maps = requests.get(BASE + "/maps", timeout=3).json()["maps"]
    return {"office_floor", "open_hall"} <= set(maps), str(maps)


def t_start_stop():
    a = post("/start")["status"] == "running"
    b = post("/stop")["status"] == "stopped"
    return a and b, "start and stop responses"


def t_reset():
    return post("/reset")["status"] == "reset", "reset response"


def t_person_route():
    post("/reset")
    post("/person", {"row": 14, "col": 20})
    m = latest_message()
    path = m["path"]
    ends_at_exit = bool(path) and path[-1] in ([14, 0], [14, 29], [29, 15])
    return ends_at_exit, f"path length {len(path)}, danger {m['danger']}"


def t_reroute():
    post("/reset")
    post("/person", {"row": 14, "col": 20})
    before = latest_message()
    for r in (13, 14, 15):
        post("/fire", {"row": r, "col": 24})
    after = latest_message()
    blocked = any(after["grid"][r][c] in (2, 4, 5) for r, c in after["path"])
    ok = (
        bool(before["path"])
        and bool(after["path"])
        and after["rerouted"]
        and not blocked
        and after["path"][-1] in ([14, 0], [14, 29], [29, 15])
    )
    return ok, f"new path length {len(after['path'])}, rerouted={after['rerouted']}"


def t_alert_text():
    m = latest_message()
    has = any("rerouted" in a for a in m["alerts"])
    return has, f"alerts: {m['alerts']}"


def t_sensor():
    post("/reset")
    r = post("/sensor/fire", {"sensor_id": "sensor_corridor_e", "value": 1})
    return r["status"] == "fire started", r["status"]


def t_bad_cell():
    try:
        post("/fire", {"row": 0, "col": 0})   # wall cell
        return False, "accepted a wall cell"
    except requests.HTTPError as e:
        return e.response.status_code == 400, f"HTTP {e.response.status_code}"


print("Checkpoint D: REST endpoints")
check("health", t_health)
check("maps list", t_maps)
check("start and stop", t_start_stop)
check("reset", t_reset)
check("sensor endpoint starts fire", t_sensor)
check("bad cell rejected", t_bad_cell)

print("\nCheckpoint E: routing")
check("person gets a route to an exit", t_person_route)
check("fire blocks route, reroute happens", t_reroute)
check("reroute alert text appears", t_alert_text)

print(f"\n{sum(results)}/{len(results)} checks passed")