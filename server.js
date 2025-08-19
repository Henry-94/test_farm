// server.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let esp32Client = null;
let androidClients = new Map(); // Utilisation d'une Map pour une meilleure gestion

// Nouvelle route POST pour l'envoi d'images
app.use(express.raw({
    type: 'image/jpeg',
    limit: '10mb'
}));

app.post('/upload', (req, res) => {
    try {
        if (!req.body || req.body.length === 0) {
            return res.status(400).send('Aucun fichier reçu.');
        }
        const imageBuffer = req.body;
        console.log(`✅ Image HTTP reçue (${imageBuffer.length} octets).`);
        broadcastImageToAndroidClients(imageBuffer);
        res.status(200).send('Image reçue et transmise aux clients WebSocket.');
    } catch (error) {
        console.error('❌ Erreur lors du traitement de l’image :', error);
        res.status(500).send('Erreur interne du serveur.');
    }
});

wss.on('connection', (ws) => {
    console.log('🔗 Nouveau client WebSocket connecté.');
    // Stocke temporairement les nouveaux clients jusqu'à leur identification
    const clientId = Date.now(); 
    androidClients.set(clientId, ws); 

    ws.on('message', (message) => {
        if (typeof message === 'object' && message instanceof Buffer) {
            console.log(`✅ Image reçue de l'ESP32 (${message.length} octets).`);
            broadcastImageToAndroidClients(message);
        } else {
            let data;
            try {
                data = JSON.parse(message);
                console.log('Message JSON reçu:', JSON.stringify(data, null, 2));
            } catch (err) {
                console.error('❌ Erreur de parsing JSON:', err.message);
                ws.send(JSON.stringify({ type: 'error', message: `Erreur de parsing JSON: ${err.message}` }));
                return;
            }

            if (data.type === 'esp32') {
                esp32Client = ws;
                console.log('🔗 ESP32 connecté.');
                ws.send(JSON.stringify({ type: 'status', message: 'Connecté' }));
                if (data.waterLevel !== undefined || data.temperature !== undefined || data.turbidity !== undefined) {
                    broadcastToAndroidClients(data);
                }
            } else if (data.type === 'android') {
                // On a reçu le message d'identification, on peut utiliser le client
                console.log('🔗 Client Android identifié.');
                ws.send(JSON.stringify({ type: 'status', message: 'Connecté' }));

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
            // Suppression du client de la Map
            androidClients.forEach((client, key) => {
                if (client === ws) {
                    androidClients.delete(key);
                }
            });
            console.log('❌ Client Android déconnecté, total:', androidClients.size);
        }
    });

    ws.on('error', (error) => {
        console.error('❌ Erreur WebSocket:', error.message);
    });
});

function broadcastToAndroidClients(data) {
    androidClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(JSON.stringify(data));
            } catch (err) {
                console.error('❌ Erreur lors de l\'envoi à un client Android:', err.message);
            }
        }
    });
}

function broadcastImageToAndroidClients(imageData) {
    if (androidClients.size === 0) {
        console.log("⚠️ Aucun client Android n'est connecté pour recevoir l'image.");
        return;
    }
    androidClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(imageData);
            } catch (err) {
                console.error('❌ Erreur lors de l\'envoi de l\'image à un client Android:', err.message);
            }
        }
    });
}

// Lancement du serveur
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🚀 Serveur WebSocket démarré sur le port ${PORT}`);
});
