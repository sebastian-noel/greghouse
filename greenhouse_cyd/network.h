#pragma once
#include "species.h"
#include "display.h"

extern const char* SERVER_BASE;
extern const char* TELEMETRY_ENDPOINT;
extern const char* GARDEN_ID;
extern const char* PLANT_ID;
extern const char* WIFI_SSID;
extern const char* WIFI_PASS;

extern int  SOIL_RAW_DRY;
extern int  SOIL_RAW_WET;
extern int  SOIL_PIN;

extern WiFiClient      plainClient;
extern WiFiClientSecure tlsClient;
extern HTTPClient      telemHttp;
extern bool            telemBegun;
extern Preferences     prefs;

extern PlantMeta plant;
extern Mood      mood;
extern int       soilPct;
extern int       lastRaw;
extern bool      dirty;
extern bool      voiceWanted;
extern unsigned long tVoiceWant;
extern int       failedPosts;

extern volatile uint8_t*  voiceBuf;
extern volatile size_t    voiceLen;
extern volatile size_t    voicePos;
extern volatile uint32_t  voiceGapLeft;
extern esp_timer_handle_t audioTimer;

extern const int VOICE_MAX_BYTES;

// ------------------------------------------------- helpers
inline bool isHttps(const char* base) { return strncmp(base, "https", 5) == 0; }

inline uint16_t hexToRGB565(const String& hex) {
  if (hex.length() < 7) return 0xC618;
  long v = strtol(hex.c_str() + 1, nullptr, 16);
  return tft.color565((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
}

// ------------------------------------------------- soil read
inline int readSoilPercent() {
  static int history[5] = {50, 50, 50, 50, 50};
  static int idx = 0;

  long sum = 0;
  for (int i = 0; i < 16; i++) { sum += analogRead(SOIL_PIN); delay(2); }
  int raw = sum / 16;
  lastRaw = raw;

  history[idx] = raw;
  idx = (idx + 1) % 5;

  long windowSum = 0;
  for (int i = 0; i < 5; i++) windowSum += history[i];
  int smoothedRaw = windowSum / 5;

  int pct = map(smoothedRaw, SOIL_RAW_DRY, SOIL_RAW_WET, 0, 100);
  pct = constrain(pct, 0, 100);
  Serial.printf("soil: raw=%d smoothed=%d -> %d%%\n", raw, smoothedRaw, pct);
  return pct;
}

// ------------------------------------------------- POST soil
inline bool postSoil(int pct) {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (!telemBegun) { telemHttp.setReuse(true); telemBegun = true; }
  if (!telemHttp.begin(tlsClient, TELEMETRY_ENDPOINT)) {
    Serial.println("postSoil: begin() failed");
    return false;
  }
  telemHttp.setTimeout(1500);
  telemHttp.addHeader("Content-Type", "application/json");
  char body[48];
  snprintf(body, sizeof(body), "{\"soilMoisture\":%d}", pct);
  int code = telemHttp.POST((uint8_t*)body, strlen(body));
  telemHttp.end();
  if (code < 200 || code >= 300) {
    Serial.printf("postSoil: HTTP %d (heap %u)\n", code, ESP.getFreeHeap());
    failedPosts++;
    if (failedPosts == 5) dirty = true;
    return false;
  }
  if (failedPosts >= 5) dirty = true;
  failedPosts = 0;
  return true;
}

// ------------------------------------------------- JSON GET helper
inline bool httpGetJson(const String& url, JsonDocument& doc) {
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

// ------------------------------------------------- fetch plant meta
inline bool fetchPlant() {
  JsonDocument doc;
  String url = String(SERVER_BASE) + "/api/garden/" + GARDEN_ID + "/plant/" + PLANT_ID;
  if (!httpGetJson(url, doc)) return false;
  String newSpecies = doc["speciesId"] | "pothos";
  String newName    = doc["name"]      | "plant";
  String newPot     = doc["potColor"]  | "#C2C3C7";
  String newRev     = doc["voiceRev"]  | "";
  bool changed = (newSpecies != plant.speciesId) || (newName != plant.name);
  uint16_t pot = hexToRGB565(newPot);
  if (pot != plant.potColor) changed = true;
  plant.speciesId = newSpecies;
  plant.name      = newName;
  plant.potColor  = pot;
  bool hadVoice   = plant.hasVoice;
  plant.hasVoice  = doc["hasVoice"] | false;
  if (!plant.hasVoice && hadVoice) clearVoice();
  if (newRev != plant.voiceRev) {
    plant.voiceRev = newRev;
    if (plant.hasVoice) { voiceWanted = true; tVoiceWant = millis(); }
  }
  if (changed) dirty = true;
  return true;
}

// ------------------------------------------------- fetch wifi config
inline void fetchWifiConfig() {
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

// ------------------------------------------------- wifi connect
inline bool tryWifi(const String& ssid, const String& pass, unsigned long timeoutMs) {
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

inline void listNetworksOnTFT() {
  drawLawn();
  tft.setTextFont(2);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, 0x1CC5);
  tft.setTextPadding(0);
  tft.drawString("no wifi. visible 2.4GHz networks:", 8, 8);
  int n = WiFi.scanNetworks();
  for (int i = 0; i < n && i < 10; i++)
    tft.drawString(WiFi.SSID(i) + "  (" + String(WiFi.RSSI(i)) + " dBm)", 8, 30 + i * 18);
  tft.drawString("retrying in 8s...", 8, 220);
  WiFi.scanDelete();
}

inline void connectWifi() {
  WiFi.mode(WIFI_STA);
  String nvsSsid = prefs.getString("ssid", "");
  String nvsPass = prefs.getString("pass", "");
  while (true) {
    showStatus("connecting to wifi...", nvsSsid.length() ? nvsSsid : String(WIFI_SSID));
    if (tryWifi(nvsSsid, nvsPass, 15000)) return;
    if (tryWifi(WIFI_SSID, WIFI_PASS, 15000)) return;
    listNetworksOnTFT();
    delay(8000);
  }
}