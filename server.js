// server.js (Code complet et corrigé)

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let esp32Client = null;
let androidClients = new Map();

// Route POST pour l'envoi d'images HTTP
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

        const base64Image = imageBuffer.toString('base64');
        broadcastImageToAndroidClients(base64Image);

        res.status(200).send('Image reçue et transmise aux clients WebSocket.');
    } catch (error) {
        console.error('❌ Erreur lors du traitement de l’image :', error);
        res.status(500).send('Erreur interne du serveur.');
    }
});

wss.on('connection', (ws) => {
    console.log('🔗 Nouveau client WebSocket en attente d\'identification...');

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (err) {
            console.error('❌ Erreur de parsing JSON:', err.message);
            // Fermer la connexion pour éviter les messages non valides
            ws.close(1002, "Message non valide");
            return;
        }

        if (data.type === 'esp32') {
            if (esp32Client) {
                // Fermer l'ancienne connexion ESP32 s'il y en a une
                esp32Client.close(1000, "Nouvelle connexion ESP32");
            }
            esp32Client = ws;
            console.log('🔗 ESP32 connecté.');
            ws.send(JSON.stringify({ type: 'status', message: 'Connecté en tant qu\'ESP32.' }));
        } else if (data.type === 'android') {
            const clientId = Date.now();
            androidClients.set(clientId, ws);
            console.log('🔗 Client Android identifié. Total:', androidClients.size);
            ws.send(JSON.stringify({ type: 'status', message: 'Connecté en tant qu\'Android.' }));
        } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Type de client inconnu.' }));
        }
    });

    ws.on('close', (code, reason) => {
        if (ws === esp32Client) {
            esp32Client = null;
            console.log(`❌ ESP32 déconnecté. Code: ${code}, Raison: ${reason}`);
            broadcastToAndroidClients({ type: 'status', message: 'ESP32 déconnecté' });
        } else {
            let clientFound = false;
            // Supprimer le client de la map
            androidClients.forEach((client, key) => {
                if (client === ws) {
                    androidClients.delete(key);
                    clientFound = true;
                }
            });
            if (clientFound) {
                console.log(`❌ Client Android déconnecté. Total: ${androidClients.size}`);
            }
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

function broadcastImageToAndroidClients(base64Data) {
    if (androidClients.size === 0) {
        console.log("⚠️ Aucun client Android n'est connecté pour recevoir l'image.");
        return;
    }
    const message = JSON.stringify({
        type: "image",
        data: base64Data
    });
    androidClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (err) {
                console.error('❌ Erreur lors de l\'envoi de l\'image à un client Android:', err.message);
            }
        }
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🚀 Serveur WebSocket démarré sur le port ${PORT}`);
});
