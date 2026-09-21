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

            // 2. Socket.io හරහා Frontend එකේ Live Monitor එකට යැවීම
            io.emit('liveData', { unitId: firebaseUnitId, ...sensorData });
            
            // 3. Frontend එකේ History Tab එකට පෙන්වීම සඳහා sensor_logs යටතේ Save කිරීම
            const logRef = db.ref(`sensor_logs/${firebaseUnitId}`).push();
            await logRef.set({
                ch4: sensorData.ch4 || 0,
                co2: sensorData.co2 || 0,
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
            if (sensorData.temperature > 40) activeAlertsCount++;
            if (sensorData.ph < 6.0 || sensorData.ph > 8.0) activeAlertsCount++;

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