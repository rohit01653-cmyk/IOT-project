import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from simulation.fire import step
from backend.routing import BLOCKED, WALL, danger_map, find_path

ROOT = Path(__file__).resolve().parent.parent
MAPS_DIR = ROOT / "data" / "maps"
TICK_SECONDS = 1.0
PRINT_TERMINAL = True
SYMBOLS = {0: ".", 1: "#", 2: "F", 3: "E", 4: "B", 5: "x"}


class State:
    """All simulation state lives here. Only the loop and REST endpoints change it."""

    def __init__(self, map_name="office_floor"):
        self.rng = np.random.default_rng(42)
        self.running = False
        self.load_map(map_name)

    def load_map(self, name):
        path = MAPS_DIR / f"{name}.json"
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"map '{name}' not found")
        data = json.loads(path.read_text())
        self.map_name = name
        self.grid = np.array(data["grid"])
        self.timer = np.zeros_like(self.grid)
        self.exits = data["exits"]
        self.sensor_cells = data["sensor_cells"]
        self.person = None
        self.path = []
        self.alerts = []
        self.rerouted = False
        self.no_exit = False
        self.person_danger = 0
        self.avg_danger = 0.0
        self.calc_ms = 0.0
        self.running = False

        # Start a fire at the first sensor cell so there is something to watch
        row, col = next(iter(self.sensor_cells.values()))
        self.grid[row, col] = 2

    def add_alert(self, text):
        self.alerts = (self.alerts + [text])[-20:]


state = State()
clients = set()


def update_routing():
    """Recalculate danger, route, and alerts. Runs every tick (SPEC section 4)."""
    prev_path = state.path
    t0 = time.perf_counter()

    danger = danger_map(state.grid)
    free = state.grid != WALL
    state.avg_danger = round(float(danger[free].mean()), 1) if free.any() else 0.0

    if state.person is None:
        state.path, state.rerouted, state.person_danger, state.calc_ms = [], False, 0, 0.0
        return

    r, c = state.person
    state.person_danger = int(danger[r, c])

    # Reroute only when the old route now touches a blocked cell
    state.rerouted = bool(prev_path) and any(
        int(state.grid[pr, pc]) in BLOCKED for pr, pc in prev_path
    )

    new_path = find_path(state.grid, danger, state.person, state.exits)
    state.calc_ms = round((time.perf_counter() - t0) * 1000, 2)

    if state.rerouted and new_path:
        state.add_alert("Fire or barrier blocked the route, rerouted")
    if not new_path and not state.no_exit:
        state.add_alert("No safe exit reachable")
        state.no_exit = True
    elif new_path and state.no_exit:
        state.no_exit = False
        state.add_alert("Safe exit found")

    state.path = new_path


def build_message():
    """Message format from SPEC section 5."""
    return {
        "grid": state.grid.tolist(),
        "path": state.path,
        "danger": state.person_danger,
        "alerts": state.alerts,
        "rerouted": state.rerouted,
        "metrics": {"avg_danger": state.avg_danger, "path_calc_ms": state.calc_ms},
    }


async def broadcast(message):
    payload = json.dumps(message)
    dead = []
    for ws in clients:
        try:
            await ws.send_text(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)


def print_grid(t):
    burning = int((state.grid == 2).sum())
    burnt = int((state.grid == 5).sum())
    print(f"\n--- t={t}  burning={burning}  burnt={burnt}")
    for row in state.grid:
        print("".join(SYMBOLS[v] for v in row))


async def simulation_loop():
    t = 0
    if PRINT_TERMINAL:
        print_grid(t)
    while True:
        await asyncio.sleep(TICK_SECONDS)
        if state.running:
            state.grid, state.timer = step(state.grid, state.timer, rng=state.rng)
            t += 1
            if PRINT_TERMINAL:
                print_grid(t)
        update_routing()
        await broadcast(build_message())


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(simulation_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # prototype only; tighten later
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request bodies (SPEC section 6) ----------

class Cell(BaseModel):
    row: int
    col: int


class MapName(BaseModel):
    name: str


class SensorFire(BaseModel):
    sensor_id: str
    value: int


def check_cell(row, col):
    if not (0 <= row < state.grid.shape[0] and 0 <= col < state.grid.shape[1]):
        raise HTTPException(status_code=400, detail="cell out of bounds")


# ---------- REST endpoints ----------

@app.get("/health")
def health():
    return {"status": "ok", "map": state.map_name}


@app.get("/maps")
def list_maps():
    return {"maps": sorted(p.stem for p in MAPS_DIR.glob("*.json"))}


@app.post("/map/load")
async def load_map(body: MapName):
    state.load_map(body.name)
    return {"status": "loaded"}


@app.post("/start")
async def start():
    state.running = True
    return {"status": "running"}


@app.post("/stop")
async def stop():
    state.running = False
    return {"status": "stopped"}


@app.post("/reset")
async def reset():
    state.load_map(state.map_name)
    return {"status": "reset"}


@app.post("/fire")
async def place_fire(cell: Cell):
    check_cell(cell.row, cell.col)
    if state.grid[cell.row, cell.col] != 0:
        raise HTTPException(status_code=400, detail="cell is not free")
    state.grid[cell.row, cell.col] = 2
    state.timer[cell.row, cell.col] = 0
    return {"status": "ok"}


@app.post("/person")
async def place_person(cell: Cell):
    check_cell(cell.row, cell.col)
    if state.grid[cell.row, cell.col] != 0:
        raise HTTPException(status_code=400, detail="cell is not free")
    state.person = [cell.row, cell.col]
    return {"status": "ok"}


@app.post("/barrier")
async def place_barrier(cell: Cell):
    check_cell(cell.row, cell.col)
    if state.grid[cell.row, cell.col] != 0:
        raise HTTPException(status_code=400, detail="cell is not free")
    state.grid[cell.row, cell.col] = 4
    return {"status": "ok"}


@app.post("/sensor/fire")
async def sensor_fire(body: SensorFire):
    if body.sensor_id not in state.sensor_cells:
        raise HTTPException(status_code=404, detail="unknown sensor_id")
    if body.value != 1:
        return {"status": "no fire"}
    row, col = state.sensor_cells[body.sensor_id]
    if state.grid[row, col] == 0:
        state.grid[row, col] = 2
        state.timer[row, col] = 0
    return {"status": "fire started"}


# ---------- WebSocket (SPEC section 5) ----------

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    await websocket.send_text(json.dumps(build_message()))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(websocket)