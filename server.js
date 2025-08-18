// server.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let esp32Client = null;
let androidClients = [];

wss.on('connection', (ws) => {
    console.log('🔗 Nouveau client WebSocket connecté.');

    ws.on('message', (message) => {
        // Détecter si le message est binaire (image) ou textuel (JSON)
        if (typeof message === 'object' && message instanceof Buffer) {
            // Traitement des données binaires (image)
            console.log(`✅ Image reçue de l'ESP32 (${message.length} octets).`);

            // Envoyer directement le buffer binaire à tous les clients Android
            broadcastImageToAndroidClients(message);
        
        } else {
            // Traitement des messages textuels (JSON)
            let data;
            try {
                data = JSON.parse(message);
                console.log('Message JSON reçu:', JSON.stringify(data, null, 2));
            } catch (err) {
                console.error('❌ Erreur de parsing JSON:', err.message);
                ws.send(JSON.stringify({ type: 'error', message: `Erreur de parsing JSON: ${err.message}` }));
                return;
            }

            // Gestion des connexions ESP32
            if (data.type === 'esp32') {
                esp32Client = ws;
                console.log('🔗 ESP32 connecté.');
                ws.send(JSON.stringify({ type: 'status', message: 'Connecté' }));

                // Relayer les données de capteurs aux clients Android
                if (data.waterLevel !== undefined || data.temperature !== undefined || data.turbidity !== undefined) {
                    broadcastToAndroidClients(data);
                }

            } else if (data.type === 'android') {
                if (!androidClients.includes(ws)) {
                    androidClients.push(ws);
                    console.log('🔗 Client Android connecté, total:', androidClients.length);
                    ws.send(JSON.stringify({ type: 'status', message: 'Connecté' }));
                }

                // Relayer les commandes de l'application Android vers l'ESP32
                if (esp32Client && esp32Client.readyState === WebSocket.OPEN) {
                    esp32Client.send(JSON.stringify(data));
                    console.log('Message envoyé à ESP32:', JSON.stringify(data, null, 2));
                    ws.send(JSON.stringify({ type: 'status', message: 'Données envoyées à l\'ESP32' }));
                } else {
                    ws.send(JSON.stringify({ type: 'status', message: 'ESP32 non connecté' }));
                    console.log('ESP32 non connecté, message non envoyé');
                }

            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'Type de client inconnu.' }));
            }
        }
    });

    ws.on('close', () => {
        if (ws === esp32Client) {
            esp32Client = null;
            console.log('❌ ESP32 déconnecté.');
            broadcastToAndroidClients({ type: 'status', message: 'ESP32 déconnecté' });
        } else {
            androidClients = androidClients.filter(client => client !== ws);
            console.log('❌ Client Android déconnecté, total:', androidClients.length);
        }
    });

    ws.on('error', (error) => {
        console.error('❌ Erreur WebSocket:', error.message);
    });
});

// Fonction pour diffuser un message JSON aux clients Android
function broadcastToAndroidClients(data) {
    androidClients = androidClients.filter(client => client.readyState === WebSocket.OPEN);
    androidClients.forEach(client => {
        try {
            client.send(JSON.stringify(data));
        } catch (err) {
            console.error('❌ Erreur lors de l\'envoi à un client Android:', err.message);
        }
    });
}

// Fonction pour diffuser l'image binaire aux clients Android
function broadcastImageToAndroidClients(imageData) {
    androidClients = androidClients.filter(client => client.readyState === WebSocket.OPEN);
    androidClients.forEach(client => {
        try {
            client.send(imageData); // Envoi direct du buffer
        } catch (err) {
            console.error('❌ Erreur lors de l\'envoi de l\'image à un client Android:', err.message);
        }
    });
}

// Lancement du serveur
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🚀 Serveur WebSocket démarré sur le port ${PORT}`);
});
