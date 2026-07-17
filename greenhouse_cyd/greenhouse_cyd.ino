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
#include "secrets.h"

#include "species.h"
#include "display.h"
#include "network.h"
#include "audio.h"

// ------------------------------------------------------------ config
const char* SERVER_BASE       = "https://supreme-edge-galaxy-choices.trycloudflare.com";
const char* TELEMETRY_ENDPOINT = "https://gg4ghv6ns8.execute-api.us-east-1.amazonaws.com/readings";
const char* GARDEN_ID         = "MYSycbpIr44";
const char* PLANT_ID          = "p1";

#define SOIL_PIN            35
#define SENSOR_POST_MS    2000
#define META_POLL_MS      5000
#define WIFICFG_POLL_MS  60000
#define AUDIO_PIN           26
#define AUDIO_VOLUME_PERCENT 10
#define VOICE_MAX_BYTES  200000

#define XPT_CLK  25
#define XPT_MISO 39
#define XPT_MOSI 32
#define XPT_CS   33
#define XPT_IRQ  36

// ------------------------------------------------------------ globals
TFT_eSPI tft;
TFT_eSprite spr(&tft);
SPIClass touchSPI(VSPI);
XPT2046_Touchscreen ts(XPT_CS, XPT_IRQ);
Preferences prefs;

WiFiClient plainClient;
WiFiClientSecure tlsClient;
HTTPClient telemHttp;
bool telemBegun = false;

PlantMeta plant;
Mood mood       = MOOD_HAPPY;
int soilPct     = 50;
int lastRaw     = 0;
bool statsView  = false;
bool dirty      = true;
int failedPosts = 0;

int SOIL_RAW_DRY = 3000;
int SOIL_RAW_WET = 1200;

unsigned long tPost = 0, tMeta = 0, tWifiCfg = 0, tWifiRetry = 0, tVoiceWant = 0;
bool voiceWanted = false;

volatile uint8_t*  voiceBuf     = nullptr;
volatile size_t    voiceLen     = 0;
volatile size_t    voicePos     = 0;
volatile uint32_t  voiceGapLeft = 0;
esp_timer_handle_t audioTimer   = nullptr;

// ------------------------------------------------------------ setup
void setup() {
  Serial.begin(115200);
  Serial.println("\nthe greenhouse — CYD module");

  pinMode(AUDIO_PIN, OUTPUT);
  dacWrite(AUDIO_PIN, 128);

  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);

  tlsClient.setInsecure();
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
    Serial.println("fetchPlant failed, retrying in 3s");
    delay(3000);
  }

  soilPct = readSoilPercent();
  mood    = moodFor(plant.speciesId, soilPct);
  postSoil(soilPct);
  fetchWifiConfig();

  spr.setColorDepth(16);
  spr.createSprite(160, 180);

  const esp_timer_create_args_t targs = {
    .callback        = &audioTick,
    .arg             = nullptr,
    .dispatch_method = ESP_TIMER_TASK,
    .name            = "audio"
  };
  esp_timer_create(&targs, &audioTimer);
  esp_timer_start_periodic(audioTimer, 125);

  if (plant.hasVoice) { voiceWanted = true; tVoiceWant = millis(); }

  redraw();
  tPost = tMeta = tWifiCfg = millis();
}

// ------------------------------------------------------------ loop
void loop() {
  unsigned long now = millis();

  if (ts.tirqTouched() && ts.touched()) {
    statsView = !statsView;
    dirty     = true;
    if (plant.hasVoice) { voiceWanted = true; tVoiceWant = now; }
    delay(250);
  }

  if (dirty) redraw();

  if (!statsView) {
    int bob = (int)(5.0f + 5.0f * sinf((now % 3000) / 3000.0f * TWO_PI));
    drawPlantView(bob);
  }

  if (now - tPost >= SENSOR_POST_MS) {
    tPost   = now;
    soilPct = readSoilPercent();
    postSoil(soilPct);
    Mood m = moodFor(plant.speciesId, soilPct);
    if (m != mood) { mood = m; dirty = true; }
    if (statsView) dirty = true;
  }

  if (now - tMeta >= META_POLL_MS)     { tMeta    = now; fetchPlant(); }
  if (now - tWifiCfg >= WIFICFG_POLL_MS) { tWifiCfg = now; fetchWifiConfig(); }

  if (voiceWanted && now - tVoiceWant >= 3000) {
    voiceWanted = false;
    fetchVoice();
  }

  if (WiFi.status() != WL_CONNECTED && now - tWifiRetry >= 15000) {
    tWifiRetry = now;
    Serial.println("wifi: down, reconnecting");
    WiFi.reconnect();
  }

  delay(30);
}
