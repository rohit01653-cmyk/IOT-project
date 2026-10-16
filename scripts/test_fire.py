import json
import numpy as np
from simulation.fire import step

data = json.load(open("data/map.json"))
grid = np.array(data["grid"])

# Start fire at sensor_corridor_w, cell [14, 3]
grid[14, 3] = 2
timer = np.zeros_like(grid)

for t in range(20):
    grid, timer = step(grid, timer)   # adjust if the signature differs
    fire = int((grid == 2).sum())
    burnt = int((grid == 5).sum())
    print(f"t={t+1:2d}  burning={fire:3d}  burnt={burnt:3d}")