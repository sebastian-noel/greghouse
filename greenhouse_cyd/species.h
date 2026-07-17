#pragma once
 
// ------------------------------------------------- species + mood
struct Species { const char* id; int dry; int soggy; };
 
const Species SPECIES_TABLE[] = {
  { "ficus",       35, 80 },
  { "cactus",      12, 55 },
  { "basil",       45, 85 },
  { "pothos",      30, 85 },
  { "monstera",    35, 80 },
  { "desert_rose", 20, 65 },
  { "snake_plant", 15, 60 },
};
const int SPECIES_COUNT = sizeof(SPECIES_TABLE) / sizeof(SPECIES_TABLE[0]);
 
enum Mood { MOOD_HAPPY = 0, MOOD_THIRSTY, MOOD_DROWNING };
 
struct PlantMeta {
  String name      = "plant";
  String speciesId = "pothos";
  uint16_t potColor = 0xC618;
  bool hasVoice    = false;
  String voiceRev  = "";
};
 
inline Mood moodFor(const String& speciesId, int soil) {
  const Species* sp = &SPECIES_TABLE[3]; // pothos default
  for (int i = 0; i < SPECIES_COUNT; i++) {
    if (speciesId == SPECIES_TABLE[i].id) { sp = &SPECIES_TABLE[i]; break; }
  }
  if (soil < sp->dry)   return MOOD_THIRSTY;
  if (soil > sp->soggy) return MOOD_DROWNING;
  return MOOD_HAPPY;
}
 
// ------------------------------------------------- pixel art
struct FacePx { uint8_t r, c; char pal; };
 
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
const char* GRID_DESERT_ROSE[11] = {
  ".....KCK........", "...KCKKKCK......", "..KKKKUKKKK.....", "...KCKKKCK......",
  "....KKKKK.......", "..DLLL.LLLD.....", ".DLLLL.LLLLD....", "...D...W...D....",
  "....D.WWW.D.....", ".....WWWWW......", "....SSSWWWSS....",
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
 
inline const char** gridForSpecies(const String& id) {
  if (id == "ficus")       return GRID_FICUS;
  if (id == "cactus")      return GRID_CACTUS;
  if (id == "basil")       return GRID_BASIL;
  if (id == "monstera")    return GRID_MONSTERA;
  if (id == "desert_rose") return GRID_DESERT_ROSE;
  if (id == "snake_plant") return GRID_SNAKE;
  return GRID_POTHOS;
}