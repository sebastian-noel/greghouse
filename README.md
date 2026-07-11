# the greenhouse 🌱

> a garden group chat. come grow something.

BloomKnights 2026 | Sebastian, Alejandro, Stevin, Otavio

A multiplayer virtual-garden web app: an owner grows pixel-art plants with
moods, chat, and recorded voices; visitors walk around the same garden live
over a share link; and one **hardware plant** is mirrored onto an ESP32
"Cheap Yellow Display" with a real capacitive soil probe posting moisture
every 2 seconds. The other plants are simulated (one diagnostic device, many
plants) — the card badges say which is which (LIVE SENSOR / SIMULATED).

## Layout

```
client/           React app (Vite) — world, chat, modals, telemetry poller
  src/engine/     pure-JS shared truth: species thresholds, sprites, worldgen, chat pools
server/index.js   Node social layer: auth, gardens, WS rooms, voice.pcm, telemetry proxy
                  + DEV telemetry mock (see below)
greenhouse_cyd/   ESP32 firmware (greenhouse_cyd.ino + memo_audio.h)
```

## Running it

```bash
npm install && (cd client && npm install)   # once

npm start           # ← one command: Node server (:3000) + Vite dev (:5173) together
                    #   open http://localhost:5173 · Ctrl-C stops both

# or run the two halves in separate shells:
npm run server      # Node server → http://localhost:3000
npm run dev         # Vite dev on :5173 (proxies /api, /ws, /telemetry → :3000)

npm run build       # production: client/dist, served by the Node server
npm run tunnel      # expose :3000 publicly via cloudflared (share links + CYD)
```

## Deploying the shared app

The repository includes `render.yaml` for a GitHub-backed Render deployment.
In Render, create a new Blueprint instance, connect this repository, and apply
the Blueprint. Render builds the React client, runs the Express/WebSocket
server, and redeploys automatically whenever `main` is pushed.

- Copy `.env.example` to `.env` for server config (`PORT`, `GOOGLE_CLIENT_ID`,
  `TELEMETRY_UPSTREAM`) — `npm run server` loads it automatically. `.env` is
  gitignored.
- `PORT` overrides 3000. `GOOGLE_CLIENT_ID` enables Google sign-in and
  disables dev login. Delete `server/data.json` to reset gardens.
- `ffmpeg` must be on PATH (voice transcoding for the CYD).
- ⚠ **Restart the server after editing `server/index.js`** — a stale process
  404s new endpoints silently.
- `?debug=1` (or double-click the title as owner) opens the debug panel.

## Soil telemetry — the cloud part (LIVE)

The soil pipeline is real end to end:

```
probe (GPIO35) → ESP32 → POST https://gg4ghv6ns8.execute-api.us-east-1.amazonaws.com/readings
                          body {"soilMoisture": 63}          every 2 s
                → Lambda → DynamoDB
web clients     → GET /telemetry/latest (Node server, same origin)
                → Node server proxies GET {upstream}/readings  (cached ~1.5 s)
                → newest reading + ageMs → mood via the shared moodFor()
```

- The Node server proxies the cloud GET because API Gateway serves **no CORS
  headers**, and the cache means any number of open tabs cost one upstream
  fetch per 1.5 s. Override the upstream with `TELEMETRY_UPSTREAM=<url>`.
- Upstream GET shape: `{"readings":[{"plantId","soilMoisture","timestamp"}, ...]}`,
  newest first, timestamp = ms epoch.
- Every client derives mood locally with the same `moodFor()` thresholds
  (`client/src/engine/species.js` ↔ the table in `greenhouse_cyd.ino`), so
  the site and the device can never disagree.
- Telemetry older than 10 s → "probe offline — last reading Xs ago" on the
  card, value frozen. There is **no** simulated fallback for the real plant.
- The only sensor is soil moisture. There is no light sensor and no light UI.

## The hardware module (CYD)

ESP32-2432S028: ST7789 2.8" TFT (⚠ mislabeled ILI9341 everywhere), XPT2046
resistive touch, CH340 serial. Capacitive soil probe on **GPIO35 only**
(ADC1 — ADC2 is garbage while WiFi is up): AOUT→P3 "IO35", VCC→CN1 3V3,
GND→CN1 GND. Speaker on SPEAK's tiny inner pins (GPIO26 DAC).

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 greenhouse_cyd
arduino-cli upload -p /dev/cu.usbserial-210 --fqbn esp32:esp32:esp32:UploadSpeed=115200 greenhouse_cyd
```

- Flash at **115200** (921600 fails on this board). Libraries: TFT_eSPI
  (User_Setup.h: `ST7789_DRIVER`, `TFT_RGB_ORDER TFT_BGR`, MISO 12 MOSI 13
  SCLK 14 CS 15 DC 2 BL 21), XPT2046_Touchscreen, ArduinoJson v7.
- The telemetry endpoint and calibration (`DRY=3000 WET=1200`) match the
  proven bare sketch. Before flashing set in the .ino: `SERVER_BASE` (the
  Node server / tunnel URL) and `GARDEN_ID` (from the share link `?g=...`) —
  those two drive the display meta + voice.
- Copy `greenhouse_cyd/secrets.h.example` to `greenhouse_cyd/secrets.h` and
  fill in your real WiFi SSID/password — it's gitignored, and the .ino
  `#include`s it. (A `.env` doesn't help here: the sketch is compiled into
  the firmware binary, so secrets need a header file instead.)
- **Recalibrate** if readings drift: watch serial (`soil: raw=NNNN -> NN%`) —
  raw in dry air → `SOIL_RAW_DRY`, raw in a glass of water → `SOIL_RAW_WET`.
- Touch toggles plant view ↔ stats. `☁✕` in the corner = last 5 telemetry
  posts failed (check serial for the HTTP codes — they are always logged).

## Field-debugging quick hits

1. **Site says "probe offline" but the board looks alive** → serial shows
   every POST result code. 200s in serial but stale on the site → the client
   and the firmware are pointing at different endpoints, or the Node server's
   `TELEMETRY_UPSTREAM` is wrong.
2. **POSTs failing -1/timeout** → TLS not being reused / heap starving
   (watch `heap` in the serial log) or wrong URL.
3. **Probe flat 0** → dead module: swap the spare FIRST, debug second.
   Pegged 4095 → rail short (or a 555-clone probe that needs 5 V).
4. **"137%" on the TFT** → `setTextPadding` ghosting, not sensor math.
5. **Recording plays on site but not the CYD** → recorded under a different
   login (different garden!), ffmpeg missing (voice.pcm 500s), or >200 KB.
6. **Web mood ≠ CYD face** → the two thresholds tables drifted. There are
   exactly two copies: `client/src/engine/species.js` and the table at the
   top of `greenhouse_cyd.ino`. Diff them.
