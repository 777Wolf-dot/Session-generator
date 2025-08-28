import express from 'express';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import baileys from '@whiskeysockets/baileys';

const { makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));
const PORT = 3000;

// Folder for session files
const sessionsDir = path.join(process.cwd(), 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

app.post('/generate', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Please provide a WhatsApp number' });

  try {
    const sessionFolder = path.join(sessionsDir, number);
    if (fs.existsSync(sessionFolder)) fs.rmSync(sessionFolder, { recursive: true, force: true });

    const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);

    const { version } = await fetchLatestBaileysVersion();
    console.log("📌 WhatsApp Web version:", version);

    const sock = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: true
    });

    let responded = false;

    sock.ev.on('connection.update', async (update) => {
      console.log("📌 Connection update:", update);

      const { qr, connection, lastDisconnect } = update;

      if (qr && !responded) {
        try {
          const qrImage = await QRCode.toDataURL(qr);
          console.log("✅ QR generated");
          res.json({ qr: qrImage });
          responded = true;
        } catch (err) {
          console.error("❌ QR generation error:", err);
          if (!responded) res.status(500).json({ error: 'Failed to generate QR code' });
          responded = true;
        }
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp connected');
        saveCreds();
      }

      if (connection === 'close') {
        console.log('❌ Connection closed', lastDisconnect?.error);
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err) {
    console.error("❌ Server error:", err);
    res.status(500).json({ error: 'Failed to generate WhatsApp session' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});