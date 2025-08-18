// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();

// Activer CORS si besoin pour tester depuis un autre client
app.use(cors());

// Middleware pour recevoir les images JPEG (et autres octets)
app.use(express.raw({ type: '*/*', limit: '10mb' })); // Accept any content-type

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// ---------------- Route POST /upload ----------------
app.post('/upload', (req, res) => {
    try {
        if (req.body && req.body.length > 0) {
            console.log(`✅ Image reçue (${req.body.length} octets)`);

            // Envoyer l’image à tous les clients WebSocket
            let clientsCount = 0;
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(req.body); // Buffer binaire
                    clientsCount++;
                }
            });

            console.log(`📡 Image transmise à ${clientsCount} client(s).`);
            // Ajouter un header pour éviter que Node-fetch plante
            res.setHeader('Connection', 'close');
            return res.status(200).send('Image reçue et envoyée aux clients.');
        } else {
            console.warn('⚠ Requête vide.');
            return res.status(400).send('Requête vide ou format invalide.');
        }
    } catch (err) {
        console.error('❌ Erreur lors du traitement de l’image :', err);
        return res.status(500).send('Erreur interne serveur.');
    }
});

// ---------------- WebSocket ----------------
wss.on('connection', ws => {
    console.log('🔗 Nouveau client WebSocket connecté.');

    ws.on('close', () => {
        console.log('❌ Client WebSocket déconnecté.');
    });

    ws.on('error', err => {
        console.error('⚠ Erreur WebSocket :', err.message);
    });
});

// ---------------- Démarrage serveur ----------------
server.listen(PORT, () => {
    console.log(`🚀 Serveur écoute sur le port ${PORT}`);
    console.log(`👉 POST image sur /upload`);
});
