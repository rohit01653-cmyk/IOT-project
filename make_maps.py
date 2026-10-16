import json

N = 30

def empty():
    g = [[0]*N for _ in range(N)]
    for i in range(N):
        g[0][i] = g[N-1][i] = 1
        g[i][0] = g[i][N-1] = 1
    return g

def wall_h(g, r, c1, c2):
    for c in range(c1, c2+1): g[r][c] = 1

def wall_v(g, c, r1, r2):
    for r in range(r1, r2+1): g[r][c] = 1

# ---------- Map 1: office floor (rooms + central corridor) ----------
g = empty()
# corridor rows 13-15 stay free
# top rooms: horizontal wall at row 12 with doors
wall_h(g, 12, 1, 28)
for c in (5, 15, 25): g[12][c] = 0
# bottom rooms: horizontal wall at row 16 with doors
wall_h(g, 16, 1, 28)
for c in (5, 15, 25): g[16][c] = 0
# vertical partitions inside top and bottom room rows
for c in (10, 20):
    wall_v(g, c, 1, 11)
    wall_v(g, c, 17, 28)
# exits on outer walls (code 3)
office_exits = [[14, 0], [14, 29], [29, 15]]
for r, c in office_exits: g[r][c] = 3

office = {
    "name": "Office Floor",
    "rows": N, "cols": N,
    "grid": g,
    "exits": office_exits,
    "barriers": [],
    "zones": [
        {"name": "Corridor", "rows": [13, 15], "cols": [1, 28]},
        {"name": "North Rooms", "rows": [1, 11], "cols": [1, 28]},
        {"name": "South Rooms", "rows": [17, 28], "cols": [1, 28]}
    ],
    "sensor_cells": {"sensor_corridor_w": [14, 3], "sensor_corridor_e": [14, 26], "sensor_north_mid": [6, 15]}
}

# ---------- Map 2: open hall with pillars, exits on top and bottom ----------
h = empty()
for r in range(5, 25, 5):
    for c in range(5, 25, 5):
        h[r][c] = 1          # pillars
hall_exits = [[0, 10], [0, 20]]
# make the exits gaps in the top wall
for r, c in hall_exits: h[r][c] = 3
h[29][15] = 3
hall_exits.append([29, 15])

hall = {
    "name": "Open Hall",
    "rows": N, "cols": N,
    "grid": h,
    "exits": hall_exits,
    "barriers": [],
    "zones": [
        {"name": "Hall", "rows": [1, 28], "cols": [1, 28]}
    ],
    "sensor_cells": {"sensor_hall_center": [13, 13], "sensor_hall_left": [12, 3]}
}

def check(m):
    g = m["grid"]
    assert len(g) == m["rows"] and all(len(r) == m["cols"] for r in g)
    assert all(v in (0, 1, 3, 4) for r in g for v in r), "bad code"
    for r, c in m["exits"]:
        assert g[r][c] == 3, f"exit not marked at {r},{c}"
    for name, (r, c) in m["sensor_cells"].items():
        assert g[r][c] == 0, f"sensor {name} not on free cell"
    print(m["name"], "OK:", len(m["exits"]), "exits,", sum(v == 0 for r in g for v in r), "free cells")

for m, fn in ((office, "office_floor.json"), (hall, "open_hall.json")):
    check(m)
    with open(f"data/maps/{fn}", "w") as f:
        json.dump(m, f)

# default map used at startup
with open("data/map.json", "w") as f:
    json.dump(office, f)
