"""Software stand-in for the physical sensor. Sends the same request as the Uno/ESP32."""

import requests

BACKEND = "http://localhost:8000/sensor/fire"
SENSORS = ["sensor_corridor_w", "sensor_corridor_e", "sensor_north_mid"]

print("Fake sensor ready. Commands:")
print("  <name>   trigger that sensor, e.g. sensor_corridor_e")
print("  1, 2, 3  trigger by number from the list above")
print("  q        quit")

while True:
    cmd = input("> ").strip()
    if cmd == "q":
        break
    if cmd in {"1", "2", "3"}:
        cmd = SENSORS[int(cmd) - 1]
    try:
        r = requests.post(BACKEND, json={"sensor_id": cmd, "value": 1}, timeout=3)
        print(r.status_code, r.json())
    except requests.RequestException as e:
        print("Backend error:", e)