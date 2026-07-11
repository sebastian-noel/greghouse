// the greenhouse v2 — CYD hardware module (ESP32-2432S028, ST7789 + XPT2046)
//
// Reads a capacitive soil probe on GPIO35 and POSTs it to the CLOUD telemetry
// endpoint every 2 s. Derives its own mood locally via the same thresholds
// table the web client compiles (client/src/engine/species.js) — the display
// face updates from the probe, not from a server echo.
//
// The Node server is only used for plant meta (name/potColor/voiceRev),
// wifi provisioning, and the recorded voice (voice.pcm).
//
// Flash: arduino-cli compile --fqbn esp32:esp32:esp32 greenhouse_cyd
//        arduino-cli upload -p /dev/cu.usbserial-210 \
//          --fqbn esp32:esp32:esp32:UploadSpeed=115200 greenhouse_cyd
// (115200 — 921600 fails on this board. TFT_eSPI User_Setup.h must be the
//  CYD ST7789 config: TFT_BGR, HSPI, MISO12 MOSI13 SCLK14 CS15 DC2 BL21.)

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <SPI.h>
#include <TFT_eSPI.h>
#include <XPT2046_Touchscreen.h>
#include "esp_timer.h"
#include "memo_audio.h"
#include "secrets.h"       // WIFI_SSID / WIFI_PASS — copy secrets.h.example, gitignored

// ------------------------------------------------------------ config
// Node server — plant meta, voice, wifi provisioning (http:// is fine here)
const char* SERVER_BASE = "http://192.168.1.50:3000";

// Cloud telemetry — API Gateway → Lambda → DynamoDB. Body: {"soilMoisture": N}
const char* TELEMETRY_ENDPOINT = "https://gg4ghv6ns8.execute-api.us-east-1.amazonaws.com/readings";

const char* GARDEN_ID = "REPLACE_ME";               // from the share link (?g=...)
const char* PLANT_ID = "p1";

#define SOIL_PIN 35        // ADC1 only — ADC2 is garbage while WiFi is up
int SOIL_RAW_DRY = 3000;   // raw in open air  → 0 %   (matches the working sketch)
int SOIL_RAW_WET = 1200;   // raw in water     → 100 %

#define SENSOR_POST_MS 2000
#define META_POLL_MS 5000
#define WIFICFG_POLL_MS 60000
#define AUDIO_PIN 26       // DAC1 → onboard amp → SPEAK inner pins
#define VOICE_MAX_BYTES 200000  // ≈ 25 s @ 8 kHz

// XPT2046 touch (VSPI — separate bus from the TFT's HSPI)
#define XPT_CLK 25
#define XPT_MISO 39
#define XPT_MOSI 32
#define XPT_CS 33
#define XPT_IRQ 36

// ------------------------------------------------- shared species table
// MIRROR of client/src/engine/species.js — any threshold change MUST land in
// both places or the site and the device will disagree (blueprint §8.8).
struct Species { const char* id; int dry; int soggy; };
const Species SPECIES_TABLE[] = {
  { "ficus", 35, 80 },
  { "cactus", 12, 55 },
  { "basil", 45, 85 },
  { "pothos", 30, 85 },
  { "monstera", 35, 80 },
  { "snake_plant", 15, 60 },
};
const int SPECIES_COUNT = sizeof(SPECIES_TABLE) / sizeof(SPECIES_TABLE[0]);

enum Mood { MOOD_HAPPY = 0, MOOD_THIRSTY, MOOD_DROWNING };

// declared before the first function definition — the Arduino preprocessor
// inserts auto-generated prototypes there, and they must already know this type
struct FacePx { uint8_t r, c; char pal; };

Mood moodFor(const String& speciesId, int soil) {
  const Species* sp = &SPECIES_TABLE[3]; // pothos default, same as the client
  for (int i = 0; i < SPECIES_COUNT; i++) {
    if (speciesId == SPECIES_TABLE[i].id) { sp = &SPECIES_TABLE[i]; break; }
  }
  if (soil < sp->dry) return MOOD_THIRSTY;
  if (soil > sp->soggy) return MOOD_DROWNING;
  return MOOD_HAPPY;
}

// ---------------------------------------------------------- pixel art
// Same palette + grids as client/src/engine/sprites.js. '.'=transparent,
// 'P'=pot color.
uint16_t palColor(char c) {
  switch (c) {
    case 'I': return TFT_BLACK + 0x1129;        // #1D2B53-ish ink
    case 'C': return 0xFFDD;                    // #FFF1E8 cream
    case 'G': return 0xC618;                    // #C2C3C7 grey
    case 'W': return 0xAA86;                    // #AB5236 wood
    case 'S': return 0x5AC9;                    // #5F574F soil
    case 'L': return 0x0726;                    // #00E436 leaf
    case 'D': return 0x042A;                    // #008751 dark leaf
    case 'B': return 0x2D7F;                    // #29ADFF blue
    case 'U': return 0xFF64;                    // #FFEC27 yellow
    case 'A': return 0xF809;                    // #FF004D alert
    case 'K': return 0xFBB5;                    // #FF77A8 pink
    case 'E': return 0xFE55;                    // #FFCCAA skin
    default: return 0;
  }
}

const char* GRID_FICUS[11] = {
  "......DLL.......", ".....DLLLL......", "..DLL.LWL.LLD...", ".DLLLL.W.DLLLD..",
  ".DLLL..W..LLD...", "..DD..LWL..D....", ".DLLL.DWD.LLD...", "DLLLLD.W.DLLLD..",
  ".DDD...W...DD...", ".......W........", "...SSSSWSSSS....",
};
const char* GRID_CACTUS[11] = {
  ".......LL.......", "..L...DLLD...L..", "..L...DLLD...L..", "..LL..DLLD..LL..",
  "...LLLDLLD......", "......DLLDLLL...", "......DLLD......", "......DLLD......",
  "......DLLD......", "......DLLD......", "...SSSDLLDSS....",
};
const char* GRID_BASIL[11] = {
  "................", "....LL..LL......", "...LLLLLLLL.....", "..LLDLLLLDLLL...",
  "..LLLLDLLLLLL...", "...LDLLLLDLL....", "....LLLDLLL.....", ".....L.LL.L.....",
  ".....W.WW.W.....", "......WWW.......", "...SSSWWWSSS....",
};
const char* GRID_POTHOS[11] = {
  "................", "....LL...LL.....", "...LLLL.LLLL....", "...DLLL.DLLL....",
  "....DL...DL.....", "..LL..LLL..LL...", ".LLLL.DLD.LLLL..", ".DLLL..W..DLLLLL",
  "..DL...W......LL", ".......W......DL", "...SSSSWSSSS..L.",
};
const char* GRID_MONSTERA[11] = {
  ".....DLLLLD.....", "...DLLLLLLLLD...", "..DLLL.LLLLLLD..", "..DLLLLLLL..LD..",
  "..DLL.LLLLLLD...", "..DLLLLL.LLLD...", "...DLLLLLLLD....", "....DDLWLDD.....",
  ".......W........", ".......W........", "...SSSSWSSSS....",
};
const char* GRID_SNAKE[11] = {
  ".......U........", "..U...DLD...U...", ".DLD..DLD..DLD..", ".DLD..DLD..DLD..",
  ".DLD..DLD..DLD..", ".DLD..DLD..DLD..", ".DLD..DLD..DLD..", "..DLD.DLD.DLD...",
  "..DLD.DLD.DLD...", "...DLDDLDDLD....", "...SSSSSSSSS....",
};
const char* POT_ROWS[5] = {
  "..IIIIIIIIIIII..", "..IPPPPPPPPPPI..", "..IPPPPPPPPPPI..", "...IPPPPPPPPI...", "....IIIIIIII....",
};

const FacePx FACE_HAPPY[] = {
  {12,6,'I'},{12,9,'I'},{13,5,'I'},{14,6,'I'},{14,7,'I'},{14,8,'I'},{14,9,'I'},{13,10,'I'},
};
const FacePx FACE_THIRSTY[] = {
  {12,6,'I'},{13,6,'I'},{12,9,'I'},{13,9,'I'},{14,5,'I'},{13,7,'I'},{14,8,'I'},{13,10,'I'},{10,13,'B'},
};
const FacePx FACE_DROWNING[] = {
  {12,5,'I'},{12,6,'I'},{12,9,'I'},{12,10,'I'},{13,7,'I'},{13,8,'I'},{14,7,'I'},{14,8,'I'},
  {8,3,'B'},{9,12,'B'},{7,12,'B'},
};

const char** gridForSpecies(const String& id) {
  if (id == "ficus") return GRID_FICUS;
  if (id == "cactus") return GRID_CACTUS;
  if (id == "basil") return GRID_BASIL;
  if (id == "monstera") return GRID_MONSTERA;
  if (id == "snake_plant") return GRID_SNAKE;
  return GRID_POTHOS;
}

// ------------------------------------------------------------- globals
TFT_eSPI tft;
TFT_eSprite spr(&tft);
SPIClass touchSPI(VSPI);
XPT2046_Touchscreen ts(XPT_CS, XPT_IRQ);
Preferences prefs;

WiFiClient plainClient;
WiFiClientSecure tlsClient;
HTTPClient telemHttp;   // persistent + keep-alive: a full TLS handshake per
                        // POST (~1–2 s, ~40 KB heap) does not fit a 2 s cadence
bool telemBegun = false;

struct PlantMeta {
  String name = "plant";
  String speciesId = "pothos";
  uint16_t potColor = 0xC618;
  bool hasVoice = false;
  String voiceRev = "";
} plant;

Mood mood = MOOD_HAPPY;
int soilPct = 50;
int lastRaw = 0;
bool statsView = false;
bool dirty = true;
int failedPosts = 0;

unsigned long tPost = 0, tMeta = 0, tWifiCfg = 0, tWifiRetry = 0, tVoiceWant = 0;
bool voiceWanted = false;

// audio
volatile uint8_t* voiceBuf = nullptr;
volatile size_t voiceLen = 0;
volatile size_t voicePos = 0;
volatile bool voiceFromProgmem = true;
volatile uint32_t voiceGapLeft = 0;  // samples of silence between loops
esp_timer_handle_t audioTimer = nullptr;

void audioTick(void*) {
  if (voiceGapLeft) { voiceGapLeft--; dacWrite(AUDIO_PIN, 128); return; }
  size_t len = voiceFromProgmem ? MEMO_AUDIO_LEN : voiceLen;
  if (!len) { dacWrite(AUDIO_PIN, 128); return; }
  uint8_t b = voiceFromProgmem ? pgm_read_byte(&MEMO_AUDIO[voicePos]) : voiceBuf[voicePos];
  dacWrite(AUDIO_PIN, b);
  voicePos++;
  if (voicePos >= len) { voicePos = 0; voiceGapLeft = 24000; } // 3 s of silence, then loop
}

// ------------------------------------------------------------- helpers
bool isHttps(const char* base) { return strncmp(base, "https", 5) == 0; }

uint16_t hexToRGB565(const String& hex) { // "#RRGGBB"
  if (hex.length() < 7) return 0xC618;
  long v = strtol(hex.c_str() + 1, nullptr, 16);
  return tft.color565((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
}

int readSoilPercent() {
  long sum = 0;
  for (int i = 0; i < 16; i++) { sum += analogRead(SOIL_PIN); delay(2); }
  int raw = sum / 16;
  lastRaw = raw;
  int pct = map(raw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  pct = constrain(pct, 0, 100);
  Serial.printf("soil: raw=%d -> %d%%\n", raw, pct); // the calibration tool — keep
  return pct;
}

// POST to the cloud. 1500 ms timeout (must stay under the 2 s cadence).
// ALWAYS log the response code — v1 ignored it and it cost a debugging session.
bool postSoil(int pct) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (!telemBegun) {
    telemHttp.setReuse(true); // one live TLS session — a full handshake per POST doesn't fit 2 s
    telemBegun = true;
  }
  if (!telemHttp.begin(tlsClient, TELEMETRY_ENDPOINT)) {
    Serial.println("postSoil: begin() failed");
    return false;
  }
  telemHttp.setTimeout(1500);
  telemHttp.addHeader("Content-Type", "application/json");
  char body[48];
  snprintf(body, sizeof(body), "{\"soilMoisture\":%d}", pct);
  int code = telemHttp.POST((uint8_t*)body, strlen(body));
  telemHttp.end(); // reuse=true keeps the socket alive
  if (code < 200 || code >= 300) {
    Serial.printf("postSoil: HTTP %d (heap %u)\n", code, ESP.getFreeHeap());
    failedPosts++;
    if (failedPosts == 5) dirty = true; // show the ☁✕ glyph
    return false;
  }
  if (failedPosts >= 5) dirty = true;   // clear the glyph
  failedPosts = 0;
  return true;
}

bool httpGetJson(const String& url, JsonDocument& doc) {
  if (WiFi.status() != WL_CONNECTED) return false;
  HTTPClient http;
  bool ok = isHttps(url.c_str()) ? http.begin(tlsClient, url) : http.begin(plainClient, url);
  if (!ok) return false;
  http.setTimeout(4000);
  int code = http.GET();
  if (code != 200) { Serial.printf("GET %s -> %d\n", url.c_str(), code); http.end(); return false; }
  DeserializationError err = deserializeJson(doc, http.getStream());
  http.end();
  if (err) { Serial.printf("json err: %s\n", err.c_str()); return false; }
  return true;
}

// meta from the Node server. Soil/mood are ABSENT for hardware plants — the
// local probe owns them; do not look for them here.
bool fetchPlant() {
  JsonDocument doc;
  String url = String(SERVER_BASE) + "/api/garden/" + GARDEN_ID + "/plant/" + PLANT_ID;
  if (!httpGetJson(url, doc)) return false;
  String newSpecies = doc["speciesId"] | "pothos";
  String newName = doc["name"] | "plant";
  String newPot = doc["potColor"] | "#C2C3C7";
  String newRev = doc["voiceRev"] | "";
  bool changed = (newSpecies != plant.speciesId) || (newName != plant.name);
  uint16_t pot = hexToRGB565(newPot);
  if (pot != plant.potColor) changed = true;
  plant.speciesId = newSpecies;
  plant.name = newName;
  plant.potColor = pot;
  plant.hasVoice = doc["hasVoice"] | false;
  if (newRev != plant.voiceRev) {
    plant.voiceRev = newRev;
    if (plant.hasVoice) { voiceWanted = true; tVoiceWant = millis(); }
  }
  if (changed) dirty = true;
  return true;
}

void fetchWifiConfig() {
  JsonDocument doc;
  String url = String(SERVER_BASE) + "/api/garden/" + GARDEN_ID + "/hardware";
  if (!httpGetJson(url, doc)) return;
  String ssid = doc["wifiSsid"] | "";
  String pass = doc["wifiPass"] | "";
  if (ssid.length()) {
    if (prefs.getString("ssid", "") != ssid || prefs.getString("pass", "") != pass) {
      prefs.putString("ssid", ssid);
      prefs.putString("pass", pass);
      Serial.printf("wifi config saved to NVS: %s\n", ssid.c_str());
    }
  }
}

// stream voice.pcm into heap, then swap under the audio timer:
// stop → swap → restart → free old. NEVER let the tick read freed memory.
void fetchVoice() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(SERVER_BASE) + "/api/garden/" + GARDEN_ID + "/plant/" + PLANT_ID + "/voice.pcm";
  bool ok = isHttps(url.c_str()) ? http.begin(tlsClient, url) : http.begin(plainClient, url);
  if (!ok) return;
  http.setTimeout(15000);
  int code = http.GET();
  if (code != 200) { Serial.printf("voice.pcm -> %d\n", code); http.end(); return; }
  int total = http.getSize(); // may be -1 (chunked)
  if (total > VOICE_MAX_BYTES) { Serial.printf("voice too big: %d\n", total); http.end(); return; }
  uint8_t* buf = (uint8_t*)malloc(VOICE_MAX_BYTES);
  if (!buf) { Serial.println("voice: out of heap"); http.end(); return; }
  WiFiClient* stream = http.getStreamPtr();
  size_t got = 0;
  unsigned long t0 = millis();
  while (http.connected() && millis() - t0 < 20000 && got < VOICE_MAX_BYTES) {
    size_t avail = stream->available();
    if (avail) {
      got += stream->readBytes(buf + got, min(avail, (size_t)(VOICE_MAX_BYTES - got)));
      t0 = millis();
    } else if (total >= 0 && (int)got >= total) {
      break;
    } else {
      delay(5);
    }
  }
  http.end();
  if (got < 800) { free(buf); Serial.println("voice: too short, keeping old"); return; }
  uint8_t* shrunk = (uint8_t*)realloc(buf, got);
  if (shrunk) buf = shrunk;

  esp_timer_stop(audioTimer);
  uint8_t* old = (uint8_t*)voiceBuf;
  voiceBuf = buf;
  voiceLen = got;
  voicePos = 0;
  voiceGapLeft = 0;
  voiceFromProgmem = false;
  esp_timer_start_periodic(audioTimer, 125); // 8 kHz
  if (old) free(old);
  Serial.printf("voice loaded: %u bytes\n", (unsigned)got);
}

// ------------------------------------------------------------- display
uint16_t lawnColor(uint32_t& lcg) {
  lcg = lcg * 1664525UL + 1013904223UL;
  uint8_t r = (lcg >> 24) & 0xFF;
  if (r < 18) return 0x0563;   // dark blade
  if (r < 36) return 0x2E68;   // light blade
  return 0x1CC5;               // lawn base
}

void drawLawn() {
  uint32_t lcg = 0x5EED1234;
  for (int y = 0; y < 240; y += 8) {
    for (int x = 0; x < 320; x += 8) {
      tft.fillRect(x, y, 8, 8, lawnColor(lcg));
    }
  }
}

const FacePx* faceFor(Mood m, int& count) {
  switch (m) {
    case MOOD_THIRSTY: count = sizeof(FACE_THIRSTY) / sizeof(FacePx); return FACE_THIRSTY;
    case MOOD_DROWNING: count = sizeof(FACE_DROWNING) / sizeof(FacePx); return FACE_DROWNING;
    default: count = sizeof(FACE_HAPPY) / sizeof(FacePx); return FACE_HAPPY;
  }
}

// draw plant into the 160×180 sprite at cell scale 10, then push (flicker-free)
void drawPlantView(int bobOffset) {
  const int CELL = 10;
  spr.fillSprite(TFT_TRANSPARENT);
  const char** grid = gridForSpecies(plant.speciesId);
  int fc; const FacePx* face = faceFor(mood, fc);
  for (int r = 0; r < 16; r++) {
    const char* row = (r < 11) ? grid[r] : POT_ROWS[r - 11];
    for (int c = 0; c < 16; c++) {
      char ch = row[c];
      // face overlay wins over the base cell
      for (int f = 0; f < fc; f++) {
        if (face[f].r == r && face[f].c == c) { ch = face[f].pal; break; }
      }
      if (ch == '.') continue;
      uint16_t col = (ch == 'P') ? plant.potColor : palColor(ch);
      int y = r * CELL + ((r < 11) ? bobOffset : 0); // pot stays planted, leaves bob
      spr.fillRect(c * CELL, y, CELL, CELL, col);
    }
  }
  spr.pushSprite(80, 20, TFT_TRANSPARENT);

  // name chip
  tft.setTextDatum(TC_DATUM);
  tft.setTextFont(4);
  tft.setTextColor(TFT_WHITE, 0x1CC5);
  tft.setTextPadding(200);
  tft.drawString(plant.name, 160, 206);
  if (failedPosts >= 5) drawCloudFail();
}

void drawCloudFail() { // small ☁✕ glyph, top-right
  tft.fillRoundRect(288, 6, 26, 16, 4, TFT_WHITE);
  tft.fillCircle(294, 10, 5, TFT_WHITE);
  tft.fillCircle(302, 8, 6, TFT_WHITE);
  tft.drawLine(296, 9, 306, 19, TFT_RED);
  tft.drawLine(306, 9, 296, 19, TFT_RED);
}

void drawBar(int x, int y, int w, int h, int pct, uint16_t color) {
  tft.drawRect(x, y, w, h, TFT_WHITE);
  int fill = (w - 4) * constrain(pct, 0, 100) / 100;
  tft.fillRect(x + 2, y + 2, fill, h - 4, color);
  tft.fillRect(x + 2 + fill, y + 2, (w - 4) - fill, h - 4, TFT_BLACK);
}

void drawStatsView() {
  const int PX = 24, PY = 36, PW = 272, PH = 168;
  tft.fillRoundRect(PX, PY, PW, PH, 6, TFT_BLACK);
  tft.drawRoundRect(PX, PY, PW, PH, 6, TFT_WHITE);

  tft.setTextFont(4);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextPadding(0);
  tft.drawString(plant.name, PX + 12, PY + 10);

  uint16_t moodCol = (mood == MOOD_HAPPY) ? 0x0726 : (mood == MOOD_THIRSTY) ? 0xFF64 : 0x2D7F;
  const char* moodTxt = (mood == MOOD_HAPPY) ? "happy" : (mood == MOOD_THIRSTY) ? "thirsty" : "drowning";
  tft.setTextDatum(TR_DATUM);
  tft.setTextColor(moodCol, TFT_BLACK);
  tft.setTextPadding(120);
  tft.drawString(moodTxt, PX + PW - 12, PY + 10);

  tft.setTextFont(2);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  tft.setTextPadding(0);
  tft.drawString("soil", PX + 12, PY + 52);
  drawBar(PX + 60, PY + 50, 150, 16, soilPct, moodCol);
  tft.setTextDatum(TR_DATUM);
  // setTextPadding(84) on right-aligned numerics — kills the "137%" ghost bug
  tft.setTextPadding(84);
  tft.drawString(String(soilPct) + "%", PX + PW - 12, PY + 52);

  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(0x8C71, TFT_BLACK);
  tft.setTextPadding(0);
  tft.drawString("raw " + String(lastRaw), PX + 12, PY + 92);
  tft.drawString("live soil probe - posts every 2s", PX + 12, PY + 122);
  if (failedPosts >= 5) drawCloudFail();
}

void redraw() {
  drawLawn();
  if (statsView) drawStatsView();
  dirty = false;
}

void showStatus(const String& line1, const String& line2) {
  drawLawn();
  tft.setTextFont(4);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE, 0x1CC5);
  tft.setTextPadding(0);
  tft.drawString(line1, 160, 100);
  tft.setTextFont(2);
  tft.drawString(line2, 160, 140);
}

// ------------------------------------------------------------- wifi
bool tryWifi(const String& ssid, const String& pass, unsigned long timeoutMs) {
  if (!ssid.length()) return false;
  Serial.printf("wifi: trying %s\n", ssid.c_str());
  WiFi.begin(ssid.c_str(), pass.c_str());
  unsigned long t0 = millis();
  while (millis() - t0 < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("wifi: connected, ip %s\n", WiFi.localIP().toString().c_str());
      return true;
    }
    delay(250);
  }
  WiFi.disconnect(true);
  delay(100);
  return false;
}

void listNetworksOnTFT() {
  drawLawn();
  tft.setTextFont(2);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, 0x1CC5);
  tft.setTextPadding(0);
  tft.drawString("no wifi. visible 2.4GHz networks:", 8, 8);
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n && i < 10; i++) {
    tft.drawString(WiFi.SSID(i) + "  (" + String(WiFi.RSSI(i)) + " dBm)", 8, 30 + i * 18);
  }
  tft.drawString("retrying in 8s...", 8, 220);
  WiFi.scanDelete();
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  String nvsSsid = prefs.getString("ssid", "");
  String nvsPass = prefs.getString("pass", "");
  while (true) {
    showStatus("connecting to wifi...", nvsSsid.length() ? nvsSsid : String(WIFI_SSID));
    if (tryWifi(nvsSsid, nvsPass, 15000)) return;       // provisioned creds first
    if (tryWifi(WIFI_SSID, WIFI_PASS, 15000)) return;   // compiled fallback second
    listNetworksOnTFT();
    delay(8000);
  }
}

// ------------------------------------------------------------- setup/loop
void setup() {
  Serial.begin(115200);
  Serial.println("\nthe greenhouse — CYD module v2");

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  prefs.begin("greenhouse", false);

  tft.init();
  tft.setRotation(1);
  tft.fillScreen(TFT_BLACK);

  touchSPI.begin(XPT_CLK, XPT_MISO, XPT_MOSI, XPT_CS);
  ts.begin(touchSPI);
  ts.setRotation(1);

  connectWifi();

  showStatus("finding the plant...", String(GARDEN_ID) + " / " + PLANT_ID);
  while (!fetchPlant()) {
    Serial.println("fetchPlant failed, retrying in 3s (is the Node server up?)");
    delay(3000);
  }

  soilPct = readSoilPercent();
  mood = moodFor(plant.speciesId, soilPct);
  postSoil(soilPct); // first reading goes to the CLOUD, not the Node server

  fetchWifiConfig();

  spr.setColorDepth(16);
  spr.createSprite(160, 180);

  // 8 kHz audio, independent of the render loop
  const esp_timer_create_args_t targs = { .callback = &audioTick, .arg = nullptr,
                                          .dispatch_method = ESP_TIMER_TASK, .name = "audio" };
  esp_timer_create(&targs, &audioTimer);
  esp_timer_start_periodic(audioTimer, 125);

  if (plant.hasVoice) { voiceWanted = true; tVoiceWant = millis(); }

  redraw();
  tPost = tMeta = tWifiCfg = millis();
}

void loop() {
  unsigned long now = millis();

  // touch → toggle plant/stats view, queue a voice re-check (debounced 3 s)
  if (ts.tirqTouched() && ts.touched()) {
    statsView = !statsView;
    dirty = true;
    if (plant.hasVoice) { voiceWanted = true; tVoiceWant = now; }
    delay(250); // crude de-bounce; resistive panels chatter
  }

  if (dirty) redraw();

  if (!statsView) {
    // sine bob: 10 px amplitude, 3 s period
    int bob = (int)(5.0f + 5.0f * sinf((now % 3000) / 3000.0f * TWO_PI));
    drawPlantView(bob);
  }

  // every 2 s: read probe → POST to cloud → derive mood LOCALLY
  if (now - tPost >= SENSOR_POST_MS) {
    tPost = now;
    soilPct = readSoilPercent();
    postSoil(soilPct);
    Mood m = moodFor(plant.speciesId, soilPct);
    if (m != mood) { mood = m; dirty = true; }
    if (statsView) dirty = true; // refresh the numbers
  }

  // every 5 s: plant meta from the Node server
  if (now - tMeta >= META_POLL_MS) {
    tMeta = now;
    fetchPlant();
  }

  // every ~1 min: wifi provisioning check
  if (now - tWifiCfg >= WIFICFG_POLL_MS) {
    tWifiCfg = now;
    fetchWifiConfig();
  }

  // debounced voice download
  if (voiceWanted && now - tVoiceWant >= 3000) {
    voiceWanted = false;
    fetchVoice();
  }

  // wifi watchdog: reconnect at most every 15 s
  if (WiFi.status() != WL_CONNECTED && now - tWifiRetry >= 15000) {
    tWifiRetry = now;
    Serial.println("wifi: down, reconnecting");
    WiFi.reconnect();
  }

  delay(30); // ~33 fps
}
