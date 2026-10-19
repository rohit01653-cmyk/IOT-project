import sys
import json
from pathlib import Path

import numpy as np

# Project root = the folder above "scripts"
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from simulation.fire import step

data = json.load(open(ROOT / "data" / "map.json"))
grid = np.array(data["grid"])

# Start fire at sensor_corridor_w, cell [14, 3]
grid[14, 3] = 2
timer = np.zeros_like(grid)

# Seeded generator so every run gives the same result
rng = np.random.default_rng(42)

for t in range(20):
    grid, timer = step(grid, timer, rng=rng)
    fire = int((grid == 2).sum())
    burnt = int((grid == 5).sum())
    print(f"t={t+1:2d}  burning={fire:3d}  burnt={burnt:3d}")