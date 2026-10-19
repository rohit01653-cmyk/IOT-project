import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from simulation.fire import step

ROOT = Path(__file__).resolve().parent.parent
TICK_SECONDS = 1.0
PRINT_TERMINAL = True   # set to False to stop the grid printing
SYMBOLS = {0: ".", 1: "#", 2: "F", 3: "E", 4: "B", 5: "x"}


class State:
    """All simulation state lives here. Only the loop and REST endpoints change it."""

    def __init__(self, map_name="office_floor"):
        self.rng = np.random.default_rng(42)
        self.running = True
        self.load_map(map_name)

    def load_map(self, name):
        data = json.loads((ROOT / "data" / "maps" / f"{name}.json").read_text())
        self.map_name = name
        self.grid = np.array(data["grid"])
        self.timer = np.zeros_like(self.grid)
        self.exits = data["exits"]
        self.sensor_cells = data["sensor_cells"]

        # Start a fire at the first sensor cell so there is something to watch
        row, col = next(iter(self.sensor_cells.values()))
        self.grid[row, col] = 2


state = State()
clients = set()   # connected WebSocket dashboards


def build_message():
    """Message format from SPEC section 5."""
    return {
        "grid": state.grid.tolist(),
        "path": [],          # filled in by routing (checkpoint E)
        "danger": 0,         # filled in by danger score (checkpoint E)
        "alerts": [],        # filled in by routing (checkpoint E)
        "rerouted": False,   # filled in by routing (checkpoint E)
        "metrics": {"avg_danger": 0.0, "path_calc_ms": 0.0},
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
            await broadcast(build_message())


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(simulation_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "map": state.map_name}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    # Send the current state right away so the dashboard doesn't wait a second
    await websocket.send_text(json.dumps(build_message()))
    try:
        while True:
            # Keep the connection open. Client messages are ignored for now.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(websocket)