"""Danger score and A* escape routing (SPEC section 4)."""

import heapq

import numpy as np
from scipy.ndimage import distance_transform_cdt

FREE, WALL, FIRE, EXIT, BARRIER, BURNT = 0, 1, 2, 3, 4, 5
BLOCKED = {WALL, FIRE, BARRIER, BURNT}
NEIGHBORS = ((-1, 0), (1, 0), (0, -1), (0, 1))


def danger_map(grid):
    """Danger 0-100 for every cell. 100 on fire, dropping 10 per cell of distance."""
    fire = grid == FIRE
    if not fire.any():
        return np.zeros(grid.shape, dtype=int)
    # Distance from each cell to the nearest fire cell, counting steps (no diagonals)
    dist = distance_transform_cdt(~fire, metric="taxicab")
    return np.clip(100 - 10 * dist, 0, 100).astype(int)


def find_path(grid, danger, start, exits):
    """A* from start to the nearest exit. Returns a list of [row, col], or []."""
    rows, cols = grid.shape
    start = (int(start[0]), int(start[1]))
    goals = {(int(r), int(c)) for r, c in exits}

    if not goals or int(grid[start]) in BLOCKED:
        return []

    def heuristic(r, c):
        return min(abs(r - gr) + abs(c - gc) for gr, gc in goals)

    best = {start: 0}
    came_from = {}
    heap = [(heuristic(*start), 0, start)]

    while heap:
        _, cost, cell = heapq.heappop(heap)
        if cell in goals:
            path = [cell]
            while path[-1] in came_from:
                path.append(came_from[path[-1]])
            return [[r, c] for r, c in reversed(path)]
        if cost > best[cell]:
            continue
        r, c = cell
        for dr, dc in NEIGHBORS:
            nr, nc = r + dr, c + dc
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            if int(grid[nr, nc]) in BLOCKED:
                continue
            # Cost per cell = 1 + danger (SPEC section 4)
            new_cost = cost + 1 + int(danger[nr, nc])
            nxt = (nr, nc)
            if new_cost < best.get(nxt, float("inf")):
                best[nxt] = new_cost
                came_from[nxt] = cell
                heapq.heappush(heap, (new_cost + heuristic(nr, nc), new_cost, nxt))
    return []