#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "Stev";
const char* password = "Sismyname";
const char* endpoint = "https://gg4ghv6ns8.execute-api.us-east-1.amazonaws.com/readings";

const int sensorPin = 35;

void setup() {
  Serial.begin(115200);
  
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
}

void loop() {
  int rawValue = analogRead(sensorPin);
  int moisturePercent = constrain(map(rawValue, 3000, 1200, 0, 100), 0, 100);
  
  Serial.printf("raw=%d moisture=%d%%\n", rawValue, moisturePercent);
  
  HTTPClient http;
  http.begin(endpoint);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<64> doc;
  doc["soilMoisture"] = moisturePercent;
  String body;
  serializeJson(doc, body);
  
  int responseCode = http.POST(body);
  Serial.printf("HTTP %d\n\n", responseCode);
  http.end();
  
  delay(2000);
}


