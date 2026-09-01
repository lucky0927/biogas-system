const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// 1. අලුත් Firebase Modular Import ක්‍රමය
const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

const serviceAccount = require('./firebase-key.json');

// Firebase සම්බන්ධ කිරීම
initializeApp({
    credential: cert(serviceAccount),
    // පහත URL එක ඔබගේ Firebase Realtime Database URL එකෙන් වෙනස් කරන්න
    databaseURL: "https://biogas-project-3-default-rtdb.firebaseio.com/" 
});

const db = getDatabase();
console.log('🗄️ Connected to Firebase Realtime Database!');

const app = express();
app.use(cors());
const server = http.createServer(app);

// WebSockets (UI එක සඳහා)
const io = new Server(server, { cors: { origin: "*" } });

// 2. HiveMQ Cloud Connection
const options = {
    host: '476d34c51ab849158f49ebd286fd7d86.s1.eu.hivemq.cloud',
    port: 8883,
    protocol: 'mqtts',
    username: 'biogas',
    password: 'Biogas2026'
};

console.log('⏳ Connecting to HiveMQ Cloud...');
const client = mqtt.connect(options);

client.on('connect', () => {
    console.log('✅ Connected to HiveMQ Cloud!');
    client.subscribe('biogas/sensors/data', (err) => {
        if (!err) console.log('📡 Subscribed to: biogas/sensors/data');
    });
});

// දත්ත පැමිණෙන විට
client.on('message', (topic, message) => {
    console.log(`📩 Data Received: ${message.toString()}`);
    
    try {
        const sensorData = JSON.parse(message.toString());
        const timestamp = Date.now();
        
        // UI එකට දත්ත යැවීම
        io.emit('liveData', sensorData);
        
        // Firebase වෙත දත්ත Save කිරීම
        db.ref('sensor_readings/' + timestamp).set({
            ch4: sensorData.ch4,
            co2: sensorData.co2,
            h2s: sensorData.h2s,
            ph: sensorData.ph,
            pressure: sensorData.pressure,
            time: new Date().toISOString()
        }, (error) => {
            if (error) {
                console.error('❌ Firebase Insert Failed:', error);
            } else {
                console.log(`💾 Data saved to Firebase successfully! (ID: ${timestamp})`);
            }
        });
        
    } catch (error) {
        console.error('❌ Data Parse Error:', error.message);
    }
});

server.listen(3000, () => {
    console.log('🚀 Backend is running on port 3000');
});