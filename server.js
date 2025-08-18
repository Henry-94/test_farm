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
    if (req.headers['content-type'] === 'image/jpeg' && req.body) {
        console.log('Image reçue, transmission aux clients Android...');

        // Envoyer l’image brute à tous les clients WebSocket
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(req.body); // Buffer binaire
                console.log(`Image transmise (${req.body.length} octets).`);
            }
        });

        res.status(200).send('Image reçue et envoyée aux clients.');
    } else {
        res.status(400).send('Format invalide. Attendu: image/jpeg.');
    }
});

// Gestion WebSocket
wss.on('connection', ws => {
    console.log('Nouveau client WebSocket connecté.');

    ws.on('close', () => {
        console.log('Client WebSocket déconnecté.');
    });
});

server.listen(PORT, () => {
    console.log(`Serveur écoute sur le port ${PORT}`);
    console.log(`POST image sur /upload`);
});
