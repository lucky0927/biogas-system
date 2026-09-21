// =========================================================
//  Biogas Monitoring & Control System - Final Version
//  Group 03 - W.K.Y. Dilshan (System Lead)
//  ESP32-S3
// =========================================================

#include <Arduino.h>
#include "DHT.h"
#include <Wire.h>
#include <Adafruit_BMP280.h>
#include <WiFi.h>
#include <WiFiManager.h>          
#include <WiFiClientSecure.h>     
#include <PubSubClient.h>         
#include <Preferences.h>
#include <Ticker.h>
#include <HTTPClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ---------- Display Settings ----------
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ---------- Hardware Pins ----------
#define LED_PIN 7      // Blue Status LED
#define DHTPIN 4
#define I2C_SDA 8
#define I2C_SCL 9
#define MQ4_PIN 1
#define MQ135_PIN 2
#define PH_PIN 14    
#define TRIG_PIN 5
#define ECHO_PIN 6
#define VALVE1_PIN 10
#define VALVE2_PIN 11
#define VALVE3_PIN 12
#define PUMP_PIN 13

#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
Adafruit_BMP280 bmp;

// ---------- Global Variables ----------
Preferences preferences;
Ticker ledTicker;
WiFiManager wifiManager;

String apiLink = "";
float tankDiameter = 100.0; // Default (cm)

// MQTT Settings (HiveMQ)
#define MQTT_BROKER "476d34c51ab849158f49ebd286fd7d86.s1.eu.hivemq.cloud"
#define MQTT_PORT 8883   
#define MQTT_USERNAME "biogas"
#define MQTT_PASSWORD "Biogas2026"

String clientId = "";    
String mqttTopic = "";   

WiFiClientSecure espClient;
PubSubClient mqttClient(espClient);

// Gas Sensor Variables
float RL_VALUE = 10.0;
float RO_CLEAN_AIR_FACTOR_MQ4 = 4.4;
float RO_CLEAN_AIR_FACTOR_MQ135 = 3.6;
float MQ4_R0 = 0;
float MQ135_R0 = 0;
unsigned long lastCalibrationTime = 0;
const unsigned long CALIBRATION_INTERVAL = 300000; 

// ==========================================
// Callbacks & Ticker
// ==========================================
void tickLED() {
  digitalWrite(LED_PIN, !digitalRead(LED_PIN));
}

// Hotspot On වූ විට Display එකේ පෙන්වීම
void configModeCallback (WiFiManager *myWiFiManager) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 10);
  display.println("Connect to Hotspot:");
  display.setTextSize(2);
  display.println("Biogas-Setup");
  display.setTextSize(1);
  display.setCursor(0, 45);
  display.println("Enter WiFi & Details");
  display.display();
  
  ledTicker.attach(0.2, tickLED); // වේගයෙන් Blink වීම
}

// පාරිභෝගිකයා Submit එබූ විට Display එකේ පෙන්වීම
void saveConfigCallback() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 15);
  display.println("Details Saved!");
  display.setCursor(0, 35);
  display.println("Connecting to WiFi..");
  display.display();
}

// ==========================================
// Setup
// ==========================================
void setup() {
  Serial.begin(115200);
  
  // 1. LED Setup
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  ledTicker.attach(0.5, tickLED); 

  // 2. I2C & Display Init
  Wire.begin(I2C_SDA, I2C_SCL);
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  }
  
  // 3. Intro Animation
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(WHITE);
  display.setCursor(15, 25);
  display.println("GROUP 03");
  display.display();
  delay(3000); 

  // 4. Init Sensors & Pins
  dht.begin();
  bmp.begin(0x76);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(VALVE1_PIN, OUTPUT);
  pinMode(VALVE2_PIN, OUTPUT);
  pinMode(VALVE3_PIN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  controlPneumatics(false, false, false, false);

  // 5. Load Saved Preferences
  preferences.begin("biogas", false);
  apiLink = preferences.getString("api", "");
  tankDiameter = preferences.getFloat("dia", 100.0);

  // 6. WiFiManager Setup
  WiFiManagerParameter custom_api("api", "Customer API Link", apiLink.c_str(), 150);
  char str_dia[10];
  dtostrf(tankDiameter, 4, 2, str_dia);
  WiFiManagerParameter custom_dia("dia", "Tank Diameter (cm)", str_dia, 10);
  
  wifiManager.addParameter(&custom_api);
  wifiManager.addParameter(&custom_dia);
  
  // Callbacks සවි කිරීම
  wifiManager.setAPCallback(configModeCallback);
  wifiManager.setSaveConfigCallback(saveConfigCallback);
  
  // Timeouts ලබා දීම
  wifiManager.setConnectTimeout(60); // කලින් දීපු WiFi එක හොයන්න තත්පර 60ක් උත්සාහ කරයි
  wifiManager.setConfigPortalTimeout(180); // Hotspot එක විනාඩි 3කට පසු ඉබේම වැසේ

  // "Checking Saved WiFi..." පණිවිඩය පෙන්වීම
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0,25);
  display.println("Checking Saved WiFi..");
  display.display();

  // ස්වයංක්රීය සම්බන්ධතාවය ඇරඹීම (නැතිනම් Hotspot On වේ)
  bool connected = wifiManager.autoConnect("Biogas-Setup");  

  if (!connected) {
    display.clearDisplay();
    display.setCursor(0,25);
    display.println("Restarting...");
    display.display();
    delay(2000);
    ESP.restart();
  }

  // 7. Save new values if changed
  apiLink = custom_api.getValue();
  tankDiameter = String(custom_dia.getValue()).toFloat();
  preferences.putString("api", apiLink);
  preferences.putFloat("dia", tankDiameter);

  // 8. WiFi Connected UI & LED
  ledTicker.detach();
  digitalWrite(LED_PIN, HIGH); // Solid ON

  display.clearDisplay();
  display.setCursor(0, 25);
  display.println("WiFi Connected!");
  display.display();
  delay(2000);

  // 9. Dynamic MAC Address for Unique MQTT ID & Topic
  String mac = WiFi.macAddress();
  mac.replace(":", ""); 
  clientId = "biogas-device-" + mac;
  mqttTopic = "biogas/sensors/data/" + mac;
  
  // 10. MQTT Connect
  espClient.setInsecure(); 
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  
  calibrateSensors();
  lastCalibrationTime = millis();
}

// ==========================================
// MQTT & HTTP Functions
// ==========================================
void mqttConnect() {
  if (WiFi.status() != WL_CONNECTED) {
    display.clearDisplay();
    display.setCursor(0, 25);
    display.println("WiFi Reconnecting...");
    display.display();
    ledTicker.attach(0.5, tickLED);
    return;
  }
  
  ledTicker.detach();
  digitalWrite(LED_PIN, HIGH);

  if (!mqttClient.connected()) {
    Serial.print("Connecting MQTT...");
    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println(" Connected!");
    }
  }
}

void sendDataToCustomerAPI(String jsonPayload) {
  if (apiLink.length() > 10 && apiLink.startsWith("http") && WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(apiLink);
    http.addHeader("Content-Type", "application/json");
    int httpResponseCode = http.POST(jsonPayload);
    http.end();
  }
}

// ==========================================
// Main Loop
// ==========================================
void loop() {
  if (WiFi.status() != WL_CONNECTED || !mqttClient.connected()) {
    mqttConnect();
  }
  mqttClient.loop();

  if (millis() - lastCalibrationTime >= CALIBRATION_INTERVAL) {
    calibrateSensors();
    lastCalibrationTime = millis();
  }

  // 1. Read Sensors
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  float p = bmp.readPressure() / 100.0F;

  int mq4_raw = analogRead(MQ4_PIN);
  float mq4_vol = (mq4_raw / 4095.0) * 3.3;
  if (mq4_vol <= 0) mq4_vol = 0.001;
  float mq4_rs = ((5.0 - mq4_vol) / mq4_vol) * RL_VALUE;
  float mq4_ratio = mq4_rs / MQ4_R0;
  float methane_ppm = 1012.7 * pow(mq4_ratio, -2.786);

  int mq135_raw = analogRead(MQ135_PIN);
  float mq135_vol = (mq135_raw / 4095.0) * 3.3;
  if (mq135_vol <= 0) mq135_vol = 0.001;
  float mq135_rs = ((5.0 - mq135_vol) / mq135_vol) * RL_VALUE;
  float mq135_ratio = mq135_rs / MQ135_R0;
  float co2_ppm = 110.47 * pow(mq135_ratio, -2.862);

  float ph_val = analogRead(PH_PIN) * (14.0 / 4095.0); 

  // 2. Volume Calculation
  float tankRadius = tankDiameter / 2.0;
  float distance = getDistance();
  float areaCm2 = 3.14159 * tankRadius * tankRadius;
  float volumeLiters = (areaCm2 * distance) / 1000.0;

  // 3. UI Update (OLED Display) - Updated to Two Columns
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  
  // පළමු තීරුව (Left Column - X=0)
  display.setCursor(0, 0);
  display.printf("CH4:%.1f", methane_ppm);
  display.setCursor(0, 16);
  display.printf("CO2:%.1f", co2_ppm);
  display.setCursor(0, 32);
  display.printf("Vol:%.1fL", volumeLiters);
  display.setCursor(0, 48);
  display.printf("Prs:%.0f", p); // Pressure (hPa)

  // දෙවන තීරුව (Right Column - X=64)
  display.setCursor(64, 0);
  display.printf("Tmp:%.1fC", t);
  display.setCursor(64, 16);
  display.printf("Hum:%.1f%%", h);
  display.setCursor(64, 32);
  display.printf("pH:%.1f", ph_val);

  // Pump & Valve indicator dot (Bottom Right)
  int v3_state = digitalRead(VALVE3_PIN);
  int pump_state = digitalRead(PUMP_PIN);
  if (pump_state == HIGH || v3_state == HIGH) {
    display.fillCircle(120, 52, 4, WHITE); // White dot if running
  } else {
    display.drawCircle(120, 52, 4, WHITE); // Empty circle if off
  }
  display.display();

  // 4. Send JSON Payload
  char payload[512];
  snprintf(payload, sizeof(payload),
    "{\"token\":\"%s\",\"ch4\":%.2f,\"co2\":%.2f,\"ph\":%.2f,\"pressure\":%.2f,\"distance\":%.2f,\"volume\":%.2f,\"temp\":%.2f,\"hum\":%.2f,\"v3\":%d,\"pump\":%d}",
    apiLink.c_str(), methane_ppm, co2_ppm, ph_val, p, distance, volumeLiters, t, h, v3_state, pump_state);

  // Send to unique MAC-based HiveMQ Topic
  mqttClient.publish(mqttTopic.c_str(), payload); 
  
  // Send to Customer API Link (HTTPS)
  sendDataToCustomerAPI(String(payload));  

  // 5. Example Pneumatics Sequence
  controlPneumatics(true, false, false, true); 
  delay(3000);
  controlPneumatics(false, false, false, false);
  delay(2000);
}

// ==========================================
// Helper Functions
// ==========================================
float getDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  return pulseIn(ECHO_PIN, HIGH) * 0.034 / 2.0;
}

void controlPneumatics(bool v1, bool v2, bool v3, bool pump) {
  digitalWrite(VALVE1_PIN, v1 ? HIGH : LOW);
  digitalWrite(VALVE2_PIN, v2 ? HIGH : LOW);
  digitalWrite(VALVE3_PIN, v3 ? HIGH : LOW);
  digitalWrite(PUMP_PIN, pump ? HIGH : LOW);
}

void calibrateSensors() {
  long mq4_sum = 0, mq135_sum = 0;
  for (int i = 0; i < 100; i++) {
    mq4_sum += analogRead(MQ4_PIN);
    mq135_sum += analogRead(MQ135_PIN);
    delay(20);
  }
  float mq4_vol = ((mq4_sum / 100.0) / 4095.0) * 3.3;
  if (mq4_vol <= 0) mq4_vol = 0.001;
  MQ4_R0 = (((5.0 - mq4_vol) / mq4_vol) * RL_VALUE) / RO_CLEAN_AIR_FACTOR_MQ4;

  float mq135_vol = ((mq135_sum / 100.0) / 4095.0) * 3.3;
  if (mq135_vol <= 0) mq135_vol = 0.001;
  MQ135_R0 = (((5.0 - mq135_vol) / mq135_vol) * RL_VALUE) / RO_CLEAN_AIR_FACTOR_MQ135;
}
