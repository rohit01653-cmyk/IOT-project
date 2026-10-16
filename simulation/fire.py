"""Fire spread simulation step (SPEC section 3).

Grid cell codes (SPEC section 2):
    0 = free, 1 = wall, 2 = fire, 3 = exit, 4 = barrier, 5 = burnt

Rules implemented:
    - A free cell (0) ignites with probability 1 - (1 - p)^k, where k is the
      number of burning 4-directional neighbors.
    - A burning cell (2) becomes burnt (5) after `burn_time` steps. Burn age
      is tracked in a separate timer array, not in the grid.
    - Only free cells can ignite. Walls, exits, barriers, and burnt cells
      never change state.

The grid and timer are never modified in place. New copies are returned.
"""

import numpy as np

FREE = 0
FIRE = 2
BURNT = 5


def step(grid, timer, p=0.3, burn_time=5, rng=None):
    """Advance the fire by one time step.

    Args:
        grid: 2D array of cell codes (see module docstring). Read-only here.
        timer: 2D integer array, same shape as grid. timer[r, c] is the number
            of steps the cell at (r, c) has been burning. Use zeros at the
            start of a run. Read-only here.
        p: Per-neighbor ignition probability, in [0, 1]. Default 0.3.
        burn_time: Number of steps a cell burns before becoming burnt.
            Must be a positive integer. Default 5.
        rng: Optional numpy.random.Generator for reproducible runs. If None,
            a new unseeded generator is used.

    Returns:
        A tuple (new_grid, new_timer) with the same shapes as the inputs.
        new_grid is an int array of cell codes. new_timer is an int array of
        burn ages.

    Raises:
        ValueError: If shapes differ, p is outside [0, 1], or burn_time < 1.
    """
    grid = np.asarray(grid)
    timer = np.asarray(timer)

    if grid.shape != timer.shape:
        raise ValueError(f"grid shape {grid.shape} != timer shape {timer.shape}")
    if not 0.0 <= p <= 1.0:
        raise ValueError(f"p must be in [0, 1], got {p}")
    if int(burn_time) != burn_time or burn_time < 1:
        raise ValueError(f"burn_time must be a positive integer, got {burn_time}")
    if rng is None:
        rng = np.random.default_rng()

    burning = grid == FIRE

    # Age burning cells by one step. Non-burning cells have no age.
    new_timer = np.where(burning, timer + 1, 0)

    new_grid = grid.copy()

    # Burning cells that have reached burn_time become burnt.
    burnt_out = burning & (new_timer >= burn_time)
    new_grid[burnt_out] = BURNT

    # Count burning 4-directional neighbors for every cell, using the state
    # at the start of this step.
    padded = np.pad(burning.astype(np.int64), 1, mode="constant")
    k = (
        padded[:-2, 1:-1]   # up
        + padded[2:, 1:-1]  # down
        + padded[1:-1, :-2]  # left
        + padded[1:-1, 2:]  # right
    )

    # Ignition probability 1 - (1 - p)^k. Equals 0 when k == 0.
    ignite_prob = 1.0 - np.power(1.0 - p, k)

    # Only free cells can ignite. New fires start with timer 0.
    ignite = (grid == FREE) & (rng.random(grid.shape) < ignite_prob)
    new_grid[ignite] = FIRE
    new_timer[ignite] = 0

    return new_grid, new_timer
