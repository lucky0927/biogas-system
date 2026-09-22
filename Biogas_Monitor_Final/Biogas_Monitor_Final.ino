// =========================================================
//  Biogas Monitoring & Control System - Final Version (Fixed)
//  Group 03
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
#define PH_PIN 3    
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
float tankHeight = 150.0;   // Tank Max Height (cm)

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

// ==========================================
// Callbacks & Ticker
// ==========================================
// ---------- pH Sensor Calibration ----------
float voltage_pH4 = 1.76;
float voltage_pH7 = 1.28; 
float pH4_value = 4.01;
float pH7_value = 6.86;
float ph_slope = (pH7_value - pH4_value) / (voltage_pH7 - voltage_pH4);
float ph_intercept = pH4_value - (ph_slope * voltage_pH4);

Preferences preferences;
WiFiManager wifiManager;
Ticker ledTicker;

// Dynamic Settings from Captive Portal
String apiLink = "";
float tankDiameter = 100.0; 
float tankHeight = 150.0; 

unsigned long lastSendTime = 0;
unsigned long lastCalibrationTime = 0;
const unsigned long CALIBRATION_INTERVAL = 3600000; 

void tickLED() {
  digitalWrite(LED_PIN, !digitalRead(LED_PIN));
}

void configModeCallback(WiFiManager *myWiFiManager) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(0, 0);
  display.println("WiFi Setup Mode");
  display.setCursor(0, 20);
  display.println("Connect to:");
  display.setCursor(0, 35);
  display.println("Biogas-Setup");
  display.setCursor(0, 50);
  display.println("192.168.4.1");
  display.display();
}

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
  analogReadResolution(12);
  
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  ledTicker.attach(0.5, tickLED); 

  Wire.begin(I2C_SDA, I2C_SCL);
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("SSD1306 allocation failed"));
  }
  
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(WHITE);
  display.setCursor(15, 25);
  display.println("GROUP 03");
  display.display();
  delay(3000); 

  dht.begin();
  
  if(!bmp.begin(0x76)) {
    Serial.println("BMP280 not found! Check wiring.");
  } else {
    // BMP280 එකේ readings ගොඩක් stable කරන්න Hardware Filtering දානවා
    bmp.setSampling(Adafruit_BMP280::MODE_NORMAL, 
                    Adafruit_BMP280::SAMPLING_X2, 
                    Adafruit_BMP280::SAMPLING_X16, 
                    Adafruit_BMP280::FILTER_X16, 
                    Adafruit_BMP280::STANDBY_MS_500);
  }
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(VALVE1_PIN, OUTPUT);
  pinMode(VALVE2_PIN, OUTPUT);
  pinMode(VALVE3_PIN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  controlPneumatics(false, false, false, false);

  preferences.begin("biogas", false);
  apiLink = preferences.getString("api", "");
  tankDiameter = preferences.getFloat("dia", 100.0);
  tankHeight = preferences.getFloat("maxH", 150.0);

  WiFiManagerParameter custom_api("api", "Customer API Link", apiLink.c_str(), 150);
  char str_dia[10];
  dtostrf(tankDiameter, 4, 2, str_dia);
  WiFiManagerParameter custom_dia("dia", "Tank Diameter (cm)", str_dia, 10);
  char str_maxH[10];
  dtostrf(tankHeight, 4, 2, str_maxH);
  WiFiManagerParameter custom_maxH("maxH", "Tank Max Height (cm)", str_maxH, 10);
  
  wifiManager.addParameter(&custom_api);
  wifiManager.addParameter(&custom_dia);
  wifiManager.addParameter(&custom_maxH);
  
  wifiManager.setAPCallback(configModeCallback);
  wifiManager.setSaveConfigCallback(saveConfigCallback);
  wifiManager.setConnectTimeout(60); 
  wifiManager.setConfigPortalTimeout(180); 

  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0,25);
  display.println("Checking Saved WiFi..");
  display.display();

  bool connected = wifiManager.autoConnect("Biogas-Setup");  

  if (!connected) {
    display.clearDisplay();
    display.setCursor(0,25);
    display.println("Restarting...");
    display.display();
    delay(2000);
    ESP.restart();
  }

  apiLink = custom_api.getValue();
  tankDiameter = String(custom_dia.getValue()).toFloat();
  tankHeight = String(custom_maxH.getValue()).toFloat();
  preferences.putString("api", apiLink);
  preferences.putFloat("dia", tankDiameter);
  preferences.putFloat("maxH", tankHeight);

  ledTicker.detach();
  digitalWrite(LED_PIN, HIGH);

  display.clearDisplay();
  display.setCursor(0, 25);
  display.println("WiFi Connected!");
  display.display();
  delay(1500);

  String mac = WiFi.macAddress();
  mac.replace(":", ""); 
  clientId = "biogas-device-" + mac;
  mqttTopic = "biogas/sensors/data/" + mac;
  
  espClient.setInsecure(); 
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(512); // Fix for default 256 byte limit
  
  calibrateSensors();
  lastCalibrationTime = millis();
}

// ==========================================
// MQTT & HTTP Functions
// ==========================================
void mqttConnect() {
  if (WiFi.status() != WL_CONNECTED) {
    ledTicker.attach(0.5, tickLED);
    return;
  }
  ledTicker.detach();
  digitalWrite(LED_PIN, HIGH);

  if (!mqttClient.connected()) {
    if (mqttClient.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println("MQTT Connected!");
    }
  }
}

void sendDataToCustomerAPI(String jsonPayload) {
  if (apiLink.length() > 10 && apiLink.startsWith("http") && WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(apiLink);
    http.addHeader("Content-Type", "application/json");
    http.POST(jsonPayload);
    http.end();
  }
}

// ==========================================
// Helper Functions
// ==========================================
float getDistance() {
  float readings[5];
  int valid = 0;
  
  for(int i=0; i<5; i++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    long duration = pulseIn(ECHO_PIN, HIGH, 30000);
    if (duration > 0) {
       float d = duration * 0.034 / 2.0;
       if (d > 0 && d < 400) {
         readings[valid] = d;
         valid++;
       }
    }
    delay(10);
  }
  
  if (valid == 0) return 0;
  
  // Sort array to find median
  for(int i=0; i<valid-1; i++) {
    for(int j=i+1; j<valid; j++) {
      if (readings[i] > readings[j]) {
        float temp = readings[i];
        readings[i] = readings[j];
        readings[j] = temp;
      }
    }
  }
  
  return readings[valid / 2];
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
    delay(20); // Matched with auto calibration delay
  }
  float mq4_avg_raw = mq4_sum / 100.0;
  float mq135_avg_raw = mq135_sum / 100.0;

  float mq4_vol = (mq4_avg_raw / 4095.0) * 3.3;
  if(mq4_vol <= 0) mq4_vol = 0.001;
  float mq4_rs = ((5.0 - mq4_vol) / mq4_vol) * RL_VALUE;
  MQ4_R0 = mq4_rs / RO_CLEAN_AIR_FACTOR_MQ4;

  float mq135_vol = (mq135_avg_raw / 4095.0) * 3.3;
  if(mq135_vol <= 0) mq135_vol = 0.001;
  float mq135_rs = ((5.0 - mq135_vol) / mq135_vol) * RL_VALUE;
  MQ135_R0 = mq135_rs / RO_CLEAN_AIR_FACTOR_MQ135;
}

// ==========================================
// Main Loop
// ==========================================
void loop() {
  if (WiFi.status() != WL_CONNECTED || !mqttClient.connected()) {
    mqttConnect();
  }
  mqttClient.loop();

  // Auto Calibration inside the tank during loop causes baseline errors.
  // We ONLY calibrate at startup in clean air. (Removed calibration from loop)

  if (millis() - lastSendTime >= 3000) {
    lastSendTime = millis();

    // 1. DHT22 and BMP280
    float h = dht.readHumidity();
    float t = dht.readTemperature();
    if (isnan(h)) h = 0.0;
    if (isnan(t)) t = 0.0;
    
    // BMP280 gives pressure in Pascals. Divide by 100000 to get bar.
    float p = bmp.readPressure() / 100000.0F;
    if (isnan(p)) p = 0.0;

    // Stable Average for MQ Sensors (Fixes Fluctuations)
    long mq4_sum = 0, mq135_sum = 0;
    for(int i = 0; i < 20; i++) {
      mq4_sum += analogRead(MQ4_PIN);
      mq135_sum += analogRead(MQ135_PIN);
      delay(5);
    }
    float mq4_raw = mq4_sum / 20.0;
    float mq135_raw = mq135_sum / 20.0;

    // 2. MQ-4 Methane Calculation
    float mq4_vol = (mq4_raw / 4095.0) * 3.3;
    if (mq4_vol <= 0) mq4_vol = 0.001;
    float mq4_rs = ((5.0 - mq4_vol) / mq4_vol) * RL_VALUE;
    float mq4_ratio = mq4_rs / MQ4_R0;
    float methane_ppm = 1012.7 * pow(mq4_ratio, -2.786);

    // 3. MQ-135 CO2 Calculation
    float mq135_vol = (mq135_raw / 4095.0) * 3.3;
    if (mq135_vol <= 0) mq135_vol = 0.001;
    float mq135_rs = ((5.0 - mq135_vol) / mq135_vol) * RL_VALUE;
    float mq135_ratio = mq135_rs / MQ135_R0;
    float co2_ppm = 110.47 * pow(mq135_ratio, -2.862);

    // Apply accurate pH calibration
    long ph_sum = 0;
    for(int i = 0; i < 10; i++) {
      ph_sum += analogRead(PH_PIN);
      delay(10);
    }
    float ph_avgRaw = ph_sum / 10.0;
    float ph_voltage = (ph_avgRaw / 4095.0) * 3.3;
    float ph_val = (ph_slope * ph_voltage) + ph_intercept; 

    float distance = getDistance();
    float tankRadius = tankDiameter / 2.0;
    float areaCm2 = 3.14159 * tankRadius * tankRadius;
    float volumeLiters = (areaCm2 * distance) / 1000.0;

    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(WHITE);
    
    display.setCursor(0, 0);
    display.printf("CH4:%.0f", methane_ppm); // Removed decimals for space if needed, wait I'll keep %.1f
    display.setCursor(0, 16);
    display.printf("CO2:%.0f", co2_ppm);     // Removed decimals for space if needed, wait I'll keep %.1f
    display.setCursor(0, 32);
    display.printf("Vol:%.0fL", volumeLiters);
    display.setCursor(0, 48);
    display.printf("Prs:%.2f", p);           // Pressure in bar needs decimals

    display.setCursor(64, 0);
    display.printf("Tmp:%.1fC", t);
    display.setCursor(64, 16);
    display.printf("Hum:%.1f%%", h);
    display.setCursor(64, 32);
    display.printf("pH:%.1f", ph_val);

    int v1_state = digitalRead(VALVE1_PIN);
    int v2_state = digitalRead(VALVE2_PIN);
    int v3_state = digitalRead(VALVE3_PIN);
    int pump_state = digitalRead(PUMP_PIN);
    if (pump_state == HIGH || v3_state == HIGH) {
      display.fillCircle(120, 52, 4, WHITE);
    } else {
      display.drawCircle(120, 52, 4, WHITE); 
    }
    display.display();

    char payload[512];
    snprintf(payload, sizeof(payload),
      "{\"token\":\"%s\",\"ch4\":%.2f,\"co2\":%.2f,\"ph\":%.2f,\"pressure\":%.2f,\"distance\":%.2f,\"volume\":%.2f,\"temp\":%.2f,\"hum\":%.2f,\"v1\":%d,\"v2\":%d,\"v3\":%d,\"pump\":%d,\"maxH\":%.2f}",
      apiLink.c_str(), methane_ppm, co2_ppm, ph_val, p, distance, volumeLiters, t, h, v1_state, v2_state, v3_state, pump_state, tankHeight);

    mqttClient.publish(mqttTopic.c_str(), payload); 
    sendDataToCustomerAPI(String(payload));  
  }
}
