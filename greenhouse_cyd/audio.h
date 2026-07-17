#pragma once
#include "memo_audio.h"

extern const int  AUDIO_PIN;
extern const int  AUDIO_VOLUME_PERCENT;
extern const int  VOICE_MAX_BYTES;
extern const char* SERVER_BASE;
extern const char* GARDEN_ID;
extern const char* PLANT_ID;

extern WiFiClientSecure   tlsClient;
extern esp_timer_handle_t audioTimer;

extern volatile uint8_t*  voiceBuf;
extern volatile size_t    voiceLen;
extern volatile size_t    voicePos;
extern volatile uint32_t  voiceGapLeft;

// ------------------------------------------------- audio tick (ISR)
inline void audioTick(void*) {
  if (voiceGapLeft) { voiceGapLeft--; dacWrite(AUDIO_PIN, 128); return; }
  const size_t  length = voiceBuf && voiceLen ? voiceLen     : MEMO_AUDIO_LEN;
  const uint8_t raw    = voiceBuf && voiceLen
                           ? voiceBuf[voicePos]
                           : pgm_read_byte(&MEMO_AUDIO[voicePos]);
  int sample = raw;
  dacWrite(AUDIO_PIN, 128 + ((sample - 128) * AUDIO_VOLUME_PERCENT) / 100);
  voicePos++;
  if (voicePos >= length) { voicePos = 0; voiceGapLeft = 24000; }
}

// ------------------------------------------------- clear voice
inline void clearVoice() {
  if (!voiceBuf) return;
  esp_timer_stop(audioTimer);
  uint8_t* old = (uint8_t*)voiceBuf;
  voiceBuf     = nullptr;
  voiceLen     = 0;
  voicePos     = 0;
  voiceGapLeft = 0;
  esp_timer_start_periodic(audioTimer, 125);
  free(old);
  Serial.println("voice cleared: using baked-in general recording");
}

// ------------------------------------------------- fetch voice
inline void fetchVoice() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  String url = String(SERVER_BASE) + "/api/garden/" + GARDEN_ID + "/plant/" + PLANT_ID + "/voice.pcm";
  bool ok = http.begin(tlsClient, url);
  if (!ok) return;
  http.setTimeout(15000);
  int code = http.GET();
  if (code != 200) { Serial.printf("voice.pcm -> %d\n", code); http.end(); return; }
  int total = http.getSize();
  if (total > VOICE_MAX_BYTES) { Serial.printf("voice too big: %d\n", total); http.end(); return; }
  const size_t capacity = total > 0 ? (size_t)total : (size_t)VOICE_MAX_BYTES;
  uint8_t* buf = (uint8_t*)malloc(capacity);
  if (!buf) { Serial.println("voice: out of heap"); http.end(); return; }
  WiFiClient* stream = http.getStreamPtr();
  size_t got = 0;
  unsigned long t0 = millis();
  while (http.connected() && millis() - t0 < 20000 && got < capacity) {
    size_t avail = stream->available();
    if (avail) {
      got += stream->readBytes(buf + got, min(avail, capacity - got));
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
  voiceBuf     = buf;
  voiceLen     = got;
  voicePos     = 0;
  voiceGapLeft = 0;
  esp_timer_start_periodic(audioTimer, 125);
  if (old) free(old);
  Serial.printf("voice loaded: %u bytes\n", (unsigned)got);
}