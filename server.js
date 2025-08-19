// server.js

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let esp32Client = null;
let androidClients = [];

// Nouvelle route POST pour l'envoi d'images
app.use(express.raw({
    type: 'image/jpeg', // Limitez au type de contenu de l'image
    limit: '10mb' // Taille maximale de l'image
}));

app.post('/upload', (req, res) => {
    try {
        if (!req.body || req.body.length === 0) {
            return res.status(400).send('Aucun fichier reçu.');
        }

        const imageBuffer = req.body;
        console.log(`✅ Image HTTP reçue (${imageBuffer.length} octets).`);

        // Diffuse le buffer à tous les clients Android connectés via WebSocket
        broadcastImageToAndroidClients(imageBuffer);

        res.status(200).send('Image reçue et transmise aux clients WebSocket.');
    } catch (error) {
        console.error('❌ Erreur lors du traitement de l’image :', error);
        res.status(500).send('Erreur interne du serveur.');
    }
});

wss.on('connection', (ws) => {
    console.log('🔗 Nouveau client WebSocket connecté.');

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
                if (!androidClients.includes(ws)) {
                    androidClients.push(ws);
                    console.log('🔗 Client Android connecté, total:', androidClients.length);
                    ws.send(JSON.stringify({ type: 'status', message: 'Connecté' }));
                }
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

function broadcastImageToAndroidClients(imageData) {
    androidClients = androidClients.filter(client => client.readyState === WebSocket.OPEN);
    if (androidClients.length === 0) {
        console.log("⚠️ Aucun client Android n'est connecté pour recevoir l'image.");
        return;
    }
    androidClients.forEach(client => {
        try {
            client.send(imageData); // Envoi direct du buffer
        } catch (err) {
            console.error('❌ Erreur lors de l\'envoi de l\'image à un client Android:', err.message);
        }
    });
}

// Lancement du serveur
// CORRECTION CLÉ : Utiliser la variable d'environnement PORT
const PORT = process.env.PORT || 8080; 
server.listen(PORT, () => {
    console.log(`🚀 Serveur WebSocket démarré sur le port ${PORT}`);
});
