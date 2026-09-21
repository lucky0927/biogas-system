const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

// 🔴 මෙතන නම ඔයා Save කරපු අලුත් JSON ෆයිල් එකේ නමටම හරියටම වෙනස් වෙන්න ඕනේ 🔴
const serviceAccount = require('./serviceAccountKey.json'); 

initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://biogas-project-3-default-rtdb.firebaseio.com" 
});

const db = getDatabase();
const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ඔයාගේ HiveMQ Cloud Connection එක
const options = {
    host: '476d34c51ab849158f49ebd286fd7d86.s1.eu.hivemq.cloud',
    port: 8883,
    protocol: 'mqtts',
    username: 'biogas',
    password: 'Biogas2026'
};

const client = mqtt.connect(options);

// ══════════════════════════════════════════════════════════════════
// H2S Concentration — Soft-Sensor Estimation Model
// ══════════════════════════════════════════════════════════════════
// Ape hardware ekata (ESP32) dedicated H2S gas sensor ekak (MQ-136 wage
// ekak) connect karala naha. Eyata ESP32 eken h2s field eka ekkath
// evanne naha (sensorData.h2s hamoma undefined -> 0 witharai wenne).
// Me nisa H2S eka real sensor ekakin nemei, ape hariyata thiyena
// anith real sensors walin (pH, temperature, CH4, CO2) hadapu formula
// ekakin CALCULATE karanawa (soft-sensor / virtual sensor approach eka).
//
// Anaerobic digestion literature eke thiyena known relationships:
//   1. pH eka 6.8 ta wada adu unoth (souring/acidification) H2S ihala
//      yanawa, mokada sulfate-reducing bacteria methanogens walata
//      wada dominant wenawa.
//   2. CO2:CH4 ratio eka ihala unoth (digestion eka hari harියට
//      wenne nathnam) H2S ihala yaeema thiyanawa.
//   3. Digester temperature eka mesophilic optimum eken (~35-38°C)
//      welenakota H2S production eka adu wenna puluwan.
//
// Values ppm-equivalent scale ekakata clamp karala thiyenne (0-3),
// dashboard eke thiyena existing alert thresholds (>1.5 warning,
// >1.8 critical) walata match wenna. Meka MEASURED value ekak
// nemei, ESTIMATED value ekak kiyala mතක තියාගන්න.
function estimateH2S(sensorData) {
    const ph = Number(sensorData.ph);
    const temperature = Number(sensorData.temperature);
    const ch4 = Number(sensorData.ch4);
    const co2 = Number(sensorData.co2);

    const _ph = Number.isFinite(ph) ? ph : 7.0;
    const _temp = Number.isFinite(temperature) ? temperature : 37;
    const _ch4 = Number.isFinite(ch4) && ch4 > 0 ? ch4 : 60;
    const _co2 = Number.isFinite(co2) && co2 >= 0 ? co2 : 35;

    const BASE = 0.20;       // baseline H2S present in almost any digester
    const K_PH = 0.35;       // ppm per pH-unit below 6.8
    const K_RATIO = 0.50;    // ppm per unit CO2:CH4 ratio above 0.6
    const K_TEMP = 0.03;     // ppm per °C away from the 37°C optimum

    const phFactor = Math.max(0, 6.8 - _ph) * K_PH;
    const ratio = _co2 / _ch4;
    const ratioFactor = Math.max(0, ratio - 0.6) * K_RATIO;
    const tempFactor = Math.abs(_temp - 37) * K_TEMP;

    let h2s = BASE + phFactor + ratioFactor + tempFactor;
    if (h2s < 0) h2s = 0;
    if (h2s > 3) h2s = 3;

    return Number(h2s.toFixed(2));
}

client.on('connect', () => {
    console.log('Connected to HiveMQ Cloud');
    client.subscribe('biogas/sensors/data', (err) => {
        if (!err) console.log('Subscribed to: biogas/sensors/data');
    });
});

client.on('message', async (topic, message) => {
    try {
        const sensorData = JSON.parse(message.toString());
        console.log("New Data Received from ESP32:", sensorData);

        // 🔴 H2S sensor hardware ekak naha nisa, real sensors walin
        // calculate karapu estimated H2S value eka meka witharai
        // ape app eke "H2S Concentration" widihata use karanne.
        const estimatedH2S = estimateH2S(sensorData);
        sensorData.h2s = estimatedH2S;

        // ESP32 එකෙන් එවන Link එක/Token එක ලබාගැනීම
        const incomingToken = sensorData.token || sensorData.link || sensorData.unitId;

        if (!incomingToken) {
            console.log("No Link/Token found in payload.");
            return;
        }

        // 1. Database එකේ units යටතේ අදාළ Token එකට හිමි නියම Firebase ID එක සෙවීම
        const unitsRef = db.ref('units');
        const snapshot = await unitsRef.orderByChild('unitToken').equalTo(String(incomingToken)).once('value');

        if (snapshot.exists()) {
            const units = snapshot.val();
            const firebaseUnitId = Object.keys(units)[0]; // නියම Firebase ID එක (උදා: -P19Cf...)

            // 2. Socket.io හරහා Frontend එකේ Live Monitor එකට යැවීම
            io.emit('liveData', { unitId: firebaseUnitId, ...sensorData });
            
            // 3. Frontend එකේ History Tab එකට පෙන්වීම සඳහා sensor_logs යටතේ Save කිරීම
            const logRef = db.ref(`sensor_logs/${firebaseUnitId}`).push();
            await logRef.set({
                ch4: sensorData.ch4 || 0,
                co2: sensorData.co2 || 0,
                h2s: sensorData.h2s || 0, // estimated (no physical H2S sensor) — see estimateH2S()
                ph: sensorData.ph || 0,
                pressure: sensorData.pressure || 0,
                distance: sensorData.distance || 0,
                // 🔴 FIX: ESP32 එකෙන් 'volume' හෝ 'gasVolume' මොකෙන් එව්වත් හඳුනාගැනීම
                gasVolume: sensorData.gasVolume !== undefined ? sensorData.gasVolume : (sensorData.volume || 0),
                temperature: sensorData.temperature || 0,
                humidity: sensorData.humidity || 0,
                valve3: sensorData.valve3 || 'OFF',
                pump: sensorData.pump || 'OFF',
                timestamp: new Date().toISOString()
            });

            // 🔴 4. SMART ALERT ENGINE: ESP32 දත්ත පරීක්ෂා කර Unit Status එක Update කිරීම 🔴
            let activeAlertsCount = 0;
            let newStatus = 'active';

            // Safety Thresholds පරීක්ෂාව
            if (sensorData.pressure > 1.3) activeAlertsCount++;
            if (sensorData.h2s > 1.8) activeAlertsCount++;
            if (sensorData.temperature > 40) activeAlertsCount++;
            if (sensorData.ph < 6.0 || sensorData.ph > 8.0) activeAlertsCount++;

            // Warning හෝ Critical බව තීරණය කිරීම
            if (activeAlertsCount > 0) {
                newStatus = 'critical';
            } else if (sensorData.pressure > 1.1 || sensorData.h2s > 1.5) {
                newStatus = 'warning';
            } else {
                newStatus = 'active';
            }

            // Firebase හි units ගොනුව යාවත්කාලීන කිරීම (මෙතැනින් Dashboard එකට සජීවීව දත්ත යයි)
            await db.ref(`units/${firebaseUnitId}`).update({
                activeAlerts: activeAlertsCount,
                status: newStatus
            });
            
            console.log(`Data saved to database for unit: ${firebaseUnitId}`);
        } else {
            console.log(`Unregistered Token received: ${incomingToken}`);
        }
        
    } catch (error) {
        console.error('Data Parse Error:', error.message);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend is running on port ${PORT}`);
});