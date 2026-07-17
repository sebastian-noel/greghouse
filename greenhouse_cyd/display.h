#pragma once
#include "species.h"

extern TFT_eSPI tft;
extern TFT_eSprite spr;
extern PlantMeta plant;
extern Mood mood;
extern int soilPct;
extern int failedPosts;

// ------------------------------------------------- palette
inline uint16_t palColor(char c) {
  switch (c) {
    case 'I': return 0x1129;
    case 'C': return 0xFFDD;
    case 'G': return 0xC618;
    case 'W': return 0xAA86;
    case 'S': return 0x5AC9;
    case 'L': return 0x0726;
    case 'D': return 0x042A;
    case 'B': return 0x2D7F;
    case 'U': return 0xFF64;
    case 'A': return 0xF809;
    case 'K': return 0xFBB5;
    case 'E': return 0xFE55;
    default:  return 0;
  }
}

// ------------------------------------------------- lawn
inline uint16_t lawnColor(uint32_t& lcg) {
  lcg = lcg * 1664525UL + 1013904223UL;
  uint8_t r = (lcg >> 24) & 0xFF;
  if (r < 18) return 0x0563;
  if (r < 36) return 0x2E68;
  return 0x1CC5;
}

inline void drawLawn() {
  uint32_t lcg = 0x5EED1234;
  for (int y = 0; y < 240; y += 8)
    for (int x = 0; x < 320; x += 8)
      tft.fillRect(x, y, 8, 8, lawnColor(lcg));
}

// ------------------------------------------------- cloud fail glyph
inline void drawCloudFail() {
  tft.fillRoundRect(288, 6, 26, 16, 4, TFT_WHITE);
  tft.fillCircle(294, 10, 5, TFT_WHITE);
  tft.fillCircle(302, 8,  6, TFT_WHITE);
  tft.drawLine(296, 9,  306, 19, TFT_RED);
  tft.drawLine(306, 9,  296, 19, TFT_RED);
}

// ------------------------------------------------- bar
inline void drawBar(int x, int y, int w, int h, int pct, uint16_t color) {
  tft.fillRect(x, y, w, h, 0x1129);
  int iw   = w - 6;
  int ih   = h - 6;
  int fill = (iw * constrain(pct, 0, 100) + 50) / 100;
  if (fill > 0)    tft.fillRect(x + 3,        y + 3, fill,      ih, color);
  if (fill < iw)   tft.fillRect(x + 3 + fill, y + 3, iw - fill, ih, 0xFFDD);
}

// ------------------------------------------------- face helpers
inline const FacePx* faceFor(Mood m, int& count) {
  switch (m) {
    case MOOD_THIRSTY:  count = sizeof(FACE_THIRSTY)  / sizeof(FacePx); return FACE_THIRSTY;
    case MOOD_DROWNING: count = sizeof(FACE_DROWNING) / sizeof(FacePx); return FACE_DROWNING;
    default:            count = sizeof(FACE_HAPPY)    / sizeof(FacePx); return FACE_HAPPY;
  }
}

// ------------------------------------------------- plant view (bobbing sprite)
inline void drawPlantView(int bobOffset) {
  const int CELL = 10;
  spr.fillSprite(TFT_TRANSPARENT);
  const char** grid = gridForSpecies(plant.speciesId);
  int fc; const FacePx* face = faceFor(mood, fc);

  for (int r = 0; r < 16; r++) {
    const char* row = (r < 11) ? grid[r] : POT_ROWS[r - 11];
    for (int c = 0; c < 16; c++) {
      char ch = row[c];
      for (int f = 0; f < fc; f++) {
        if (face[f].r == r && face[f].c == c) { ch = face[f].pal; break; }
      }
      if (ch == '.') continue;
      uint16_t col = (ch == 'P') ? plant.potColor : palColor(ch);
      int y = r * CELL + ((r < 11) ? bobOffset : 0);
      spr.fillRect(c * CELL, y, CELL, CELL, col);
    }
  }
  spr.pushSprite(80, 20, TFT_TRANSPARENT);

  tft.setTextDatum(TC_DATUM);
  tft.setTextFont(4);
  tft.setTextColor(TFT_WHITE, 0x1CC5);
  tft.setTextPadding(200);
  tft.drawString(plant.name, 160, 206);
  if (failedPosts >= 5) drawCloudFail();
}

// ------------------------------------------------- stats card
inline void drawStatsView() {
  const int PX = 24, PY = 36, PW = 272, PH = 168;
  tft.fillRoundRect(PX, PY, PW, PH, 6, 0xFFDD);
  tft.drawRoundRect(PX, PY, PW, PH, 6, 0x1129);

  // name
  tft.setTextFont(4);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(0x1129, 0xFFDD);
  tft.setTextPadding(0);
  tft.drawString(plant.name, PX + 12, PY + 10);

  // mood
  uint16_t moodCol = (mood == MOOD_HAPPY) ? 0x0726 : (mood == MOOD_THIRSTY) ? 0xFF64 : 0x2D7F;
  const char* moodTxt = (mood == MOOD_HAPPY) ? "happy" : (mood == MOOD_THIRSTY) ? "thirsty" : "drowning";
  tft.setTextDatum(TR_DATUM);
  tft.setTextColor(moodCol, 0xFFDD);
  tft.setTextPadding(120);
  tft.drawString(moodTxt, PX + PW - 12, PY + 10);

  // soil bar
  tft.setTextFont(2);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(0x1129, 0xFFDD);
  tft.setTextPadding(0);
  tft.drawString("soil", PX + 12, PY + 52);
  drawBar(PX + 60, PY + 50, 150, 16, soilPct, moodCol);
  tft.setTextDatum(TR_DATUM);
  tft.setTextPadding(84);
  tft.setTextColor(0x1129, 0xFFDD);
  tft.drawString(String(soilPct) + "%", PX + PW - 12, PY + 52);

  // species + personality
  struct SpeciesDisplay {
    const char* id;
    const char* commonName;
    const char* line1;
    const char* line2;
    const char* line3;
  };
  static const SpeciesDisplay DISPLAY_TABLE[] = {
    { "ficus",       "Rubber plant", "Melodramatic. Threatens to",  "drop a leaf over every",    "inconvenience." },
    { "cactus",      "Cactus",       "Stoic. Openly judgmental",    "about overwatering.",        ""              },
    { "basil",       "Basil",        "Anxious and needy. Aware it", "is technically a salad",     "ingredient."   },
    { "pothos",      "Pothos",       "Unbothered. Quietly",         "convinced it is immortal.",  ""              },
    { "monstera",    "Monstera",     "Influencer energy. Vain",     "about every new leaf.",      ""              },
    { "desert_rose", "Desert Rose",  "Sun-loving and patient.",     "Dramatic flowers, no",       "wet feet."     },
    { "snake_plant", "Snake plant",  "Deadpan. Sleeps through",     "everything.",                ""              },
  };
  const int DISPLAY_COUNT = sizeof(DISPLAY_TABLE) / sizeof(DISPLAY_TABLE[0]);

  const SpeciesDisplay* sp = &DISPLAY_TABLE[3];
  for (int i = 0; i < DISPLAY_COUNT; i++) {
    if (plant.speciesId == DISPLAY_TABLE[i].id) { sp = &DISPLAY_TABLE[i]; break; }
  }

  tft.setTextDatum(TL_DATUM);
  tft.setTextPadding(0);
  tft.setTextColor(0x1129, 0xFFDD);
  tft.drawString(sp->commonName, PX + 12, PY + 82);
  tft.setTextColor(0x5AC9, 0xFFDD);
  tft.drawString(sp->line1, PX + 12, PY + 104);
  tft.drawString(sp->line2, PX + 12, PY + 122);
  if (strlen(sp->line3)) tft.drawString(sp->line3, PX + 12, PY + 140);

  if (failedPosts >= 5) drawCloudFail();
}

// ------------------------------------------------- redraw + status
extern bool statsView;
extern bool dirty;

inline void redraw() {
  drawLawn();
  if (statsView) drawStatsView();
  dirty = false;
}

inline void showStatus(const String& line1, const String& line2) {
  drawLawn();
  tft.setTextFont(4);
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(TFT_WHITE, 0x1CC5);
  tft.setTextPadding(0);
  tft.drawString(line1, 160, 100);
  tft.setTextFont(2);
  tft.drawString(line2, 160, 140);
}