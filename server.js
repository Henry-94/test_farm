// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware pour recevoir des images JPEG
app.use(express.raw({ type: 'image/jpeg', limit: '5mb' }));

// Route POST pour recevoir les images
app.post('/upload', (req, res) => {
    try {
        if (req.headers['content-type'] === 'image/jpeg' && req.body && req.body.length > 0) {
            console.log(`✅ Image reçue (${req.body.length} octets)`);

            // Envoyer l’image brute à tous les clients WebSocket
            let clientsCount = 0;
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(req.body); // Buffer binaire
                    clientsCount++;
                }
            });

            console.log(`📡 Image transmise à ${clientsCount} client(s).`);
            return res.status(200).send('Image reçue et envoyée aux clients.');
        } else {
            console.warn('⚠ Requête invalide ou vide.');
            return res.status(400).send('Format invalide. Attendu: image/jpeg.');
        }
    } catch (err) {
        console.error('❌ Erreur lors du traitement de l’image :', err);
        return res.status(500).send('Erreur interne serveur.');
    }
});

// Gestion WebSocket
wss.on('connection', ws => {
    console.log('🔗 Nouveau client WebSocket connecté.');

    ws.on('close', () => {
        console.log('❌ Client WebSocket déconnecté.');
    });

    ws.on('error', err => {
        console.error('⚠ Erreur WebSocket :', err.message);
    });
});

// Démarrage du serveur
server.listen(PORT, () => {
    console.log(`🚀 Serveur écoute sur le port ${PORT}`);
    console.log(`👉 POST image sur /upload`);
});
