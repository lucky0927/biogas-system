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

client.on('connect', () => {
    console.log('Connected to HiveMQ Cloud');
    // ESP32 සියලුම devices වල දත්ත ලබාගැනීමට '#' wildcard එක භාවිතා කිරීම
    client.subscribe('biogas/sensors/data/#', (err) => {
        if (!err) console.log('Subscribed to: biogas/sensors/data/# (Listening to all devices)');
    });
});

client.on('message', async (topic, message) => {
    try {
        const sensorData = JSON.parse(message.toString());
        console.log(`New Data Received from ESP32 on topic ${topic}:`, sensorData);

        // Topic එකෙන් MAC Address එක වෙන් කරගැනීම (උදා: biogas/sensors/data/0A1B2C)
        const topicParts = topic.split('/');
        const macFromTopic = topicParts.length >= 4 ? topicParts[3] : null;

        // ESP32 එකෙන් එවන Link එක/Token එක හෝ Topic එකෙන් ගත් MAC අංකය ලබාගැනීම
        const incomingToken = sensorData.token || sensorData.link || sensorData.unitId || macFromTopic;

        if (!incomingToken) {
            console.log("No Link/Token/MAC found in payload or topic.");
            return;
        }

        // 1. Database එකේ units යටතේ අදාළ Token එකට හිමි නියම Firebase ID එක සෙවීම
        const unitsRef = db.ref('units');
        const snapshot = await unitsRef.orderByChild('unitToken').equalTo(String(incomingToken)).once('value');

        if (snapshot.exists()) {
            const units = snapshot.val();
            const firebaseUnitId = Object.keys(units)[0]; // නියම Firebase ID එක (උදා: -P19Cf...)

            // Normalize sensorData from ESP32 payload
            const normalizedData = {
                ...sensorData,
                temperature: sensorData.temperature !== undefined ? sensorData.temperature : (sensorData.temp || 0),
                humidity: sensorData.humidity !== undefined ? sensorData.humidity : (sensorData.hum || 0),
                gasVolume: sensorData.gasVolume !== undefined ? sensorData.gasVolume : (sensorData.volume || 0),
                valve1: sensorData.valve1 !== undefined ? sensorData.valve1 : (sensorData.v1 == 1 ? 'ON' : 'OFF'),
                valve2: sensorData.valve2 !== undefined ? sensorData.valve2 : (sensorData.v2 == 1 ? 'ON' : 'OFF'),
                valve3: sensorData.valve3 !== undefined ? sensorData.valve3 : (sensorData.v3 == 1 ? 'ON' : 'OFF'),
                pump: (sensorData.pump === 1 || sensorData.pump === 'ON') ? 'ON' : 'OFF',
            };

            // 2. Socket.io Live Data Emit
            io.emit('liveData', { unitId: firebaseUnitId, ...normalizedData });

            // 3. Sensor Logs
            const logsRef = db.ref(`sensor_logs/${firebaseUnitId}`);
            logsRef.push({
                ch4: normalizedData.ch4 || 0,
                co2: normalizedData.co2 || 0,
                h2s: normalizedData.h2s || 0,
                ph: normalizedData.ph || 0,
                pressure: normalizedData.pressure || 0,
                distance: normalizedData.distance || 0,
                gasVolume: normalizedData.gasVolume,
                temperature: normalizedData.temperature,
                humidity: normalizedData.humidity,
                valve1: normalizedData.valve1,
                valve2: normalizedData.valve2,
                valve3: normalizedData.valve3,
                pump: normalizedData.pump,
                timestamp: new Date().toISOString()
            });

            // 🔴 4. SMART ALERT ENGINE: ESP32 දත්ත පරීක්ෂා කර Unit Status එක Update කිරීම 🔴
            let activeAlertsCount = 0;
            let newStatus = 'active';

            // Safety Thresholds පරීක්ෂාව
            if (normalizedData.pressure > 1.3) activeAlertsCount++;
            if (normalizedData.temperature > 40) activeAlertsCount++;
            if (normalizedData.ph < 6.0 || normalizedData.ph > 8.0) activeAlertsCount++;

            // Warning හෝ Critical බව තීරණය කිරීම
            if (activeAlertsCount > 0) {
                newStatus = 'critical';
            } else if (sensorData.pressure > 1.1) {
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