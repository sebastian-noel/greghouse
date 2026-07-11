# the greenhouse 🌱

> a garden group chat. one plant is real. the rest are lying.

BloomKnights 2026 | Sebastian, Alejandro, Stevin, Otavio

A multiplayer virtual-garden web app: an owner grows pixel-art plants with
moods, chat, and recorded voices; visitors walk around the same garden live
over a share link; and one **hardware plant** is mirrored onto an ESP32
"Cheap Yellow Display" with a real capacitive soil probe posting moisture
every 2 seconds.

## Layout

```
client/           React app (Vite) — world, chat, modals, telemetry poller
  src/engine/     pure-JS shared truth: species thresholds, sprites, worldgen, chat pools
server/index.js   Node social layer: auth, gardens, WS rooms, voice.pcm, light sim
                  + DEV telemetry mock (see below)
greenhouse_cyd/   ESP32 firmware (greenhouse_cyd.ino + memo_audio.h)
```

## Running it

```bash
npm install && (cd client && npm install)   # once

npm run server      # Node server → http://localhost:3000
npm run dev         # Vite dev on :5173 (proxies /api, /ws, /telemetry → :3000)

npm run build       # production: client/dist, served by the Node server
npm run tunnel      # expose :3000 publicly via cloudflared (share links + CYD)
```

- `PORT` overrides 3000. `GOOGLE_CLIENT_ID` enables Google sign-in and
  disables dev login. Delete `server/data.json` to reset gardens.
- `ffmpeg` must be on PATH (voice transcoding for the CYD).
- ⚠ **Restart the server after editing `server/index.js`** — a stale process
  404s new endpoints silently.
- `?debug=1` (or double-click the title as owner) opens the debug panel.

## Soil telemetry — the cloud part

Hardware-plant soil does **not** go through the Node server. The ESP32 POSTs
to a cloud endpoint and every open web client polls it every 2 s; each client
derives mood locally with the same `moodFor()` thresholds
(`client/src/engine/species.js` ↔ the table in `greenhouse_cyd.ino`), so the
site and the device can never disagree. Stale telemetry (>10 s) shows a
"probe offline" badge — there is **no** simulated fallback for the real plant.

**The contract** (whoever builds the cloud stack implements exactly this):

```
POST {TELEMETRY_BASE}/telemetry
  body   {"gardenId":"...", "plantId":"p1", "soilMoisture":63}
  → 200  {"ok":true, "soilMoisture":63, "ts":1752190000000}
  → 400  bad payload (ids ≤32 chars, soilMoisture finite; server clamps to int 0..100)
  optional shared-secret header: x-gh-key

GET {TELEMETRY_BASE}/telemetry/latest?g=<gardenId>&p=<plantId>
  → 200  {"soilMoisture":63, "ts":1752190000000, "ageMs":1240}   (ageMs computed server-side)
  → 404  {"error":"no readings"}
```

**Dev mock**: the Node server implements this contract itself and generates
fake wandering readings for every hardware plant (a real probe POSTing to it
takes precedence for 10 s). `MOCK_TELEMETRY=0 npm run server` disables the
fake generator. When the real cloud endpoint (API Gateway + Lambda +
DynamoDB) is live, point two config values at it:

1. `client/src/config.js` → `TELEMETRY_BASE`
2. `greenhouse_cyd/greenhouse_cyd.ino` → `TELEMETRY_BASE`

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
- Before flashing set in the .ino: `WIFI_SSID/PASS` (fallback), `SERVER_BASE`
  (the Node server / tunnel URL), `TELEMETRY_BASE`, `GARDEN_ID` (from the
  share link `?g=...`), `PLANT_ID`.
- **Calibrate**: watch serial (`soil: raw=NNNN -> NN%`) — raw in dry air →
  `SOIL_RAW_DRY`, raw in a glass of water → `SOIL_RAW_WET`, reflash.
- Touch toggles plant view ↔ stats. `☁✕` in the corner = last 5 telemetry
  posts failed (check serial for the HTTP codes — they are always logged).

## Field-debugging quick hits

1. **Site says "probe offline" but the board looks alive** → serial shows
   every POST result code. 200s in serial but stale on the site → the client
   and the firmware are pointing at different `TELEMETRY_BASE`s or a
   different gardenId/plantId pair.
2. **POSTs failing -1/timeout** → TLS not being reused / heap starving
   (watch `heap` in the serial log), wrong URL, or `x-gh-key` mismatch (403).
3. **Probe flat 0** → dead module: swap the spare FIRST, debug second.
   Pegged 4095 → rail short (or a 555-clone probe that needs 5 V).
4. **"137%" on the TFT** → `setTextPadding` ghosting, not sensor math.
5. **Recording plays on site but not the CYD** → recorded under a different
   login (different garden!), ffmpeg missing (voice.pcm 500s), or >200 KB.
6. **Web mood ≠ CYD face** → the two thresholds tables drifted. There are
   exactly two copies: `client/src/engine/species.js` and the table at the
   top of `greenhouse_cyd.ino`. Diff them.
