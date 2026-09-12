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
    client.subscribe('biogas/sensors/data', (err) => {
        if (!err) console.log('Subscribed to: biogas/sensors/data');
    });
});

client.on('message', async (topic, message) => {
    try {
        const sensorData = JSON.parse(message.toString());
        console.log("New Data Received from ESP32:", sensorData);
        
        // ESP32 එකෙන් එවන MAC Address එක ලබාගැනීම
        const macAddress = sensorData.mac || sensorData.unitId;

        if (!macAddress) {
            console.log("No MAC address found in payload.");
            return;
        }

        // 1. Database එකේ units යටතේ අදාළ MAC එකට හිමි නියම Firebase ID එක සෙවීම
        const unitsRef = db.ref('units');
        const snapshot = await unitsRef.orderByChild('hardwareMac').equalTo(String(macAddress)).once('value');

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
                h2s: sensorData.h2s || 0,
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
            
            console.log(`Data saved to database for unit: ${firebaseUnitId}`);
        } else {
            console.log(`Unregistered MAC Address received: ${macAddress}`);
        }
        
    } catch (error) {
        console.error('Data Parse Error:', error.message);
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Backend is running on port ${PORT}`);
});