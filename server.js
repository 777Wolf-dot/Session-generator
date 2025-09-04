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

// Session folder
const sessionsDir = path.join(process.cwd(), 'sessions');
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir);

async function startSession(number, res = null) {
  const sessionFolder = path.join(sessionsDir, number);
  if (fs.existsSync(sessionFolder)) fs.rmSync(sessionFolder, { recursive: true, force: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, version });

  let qrSent = false;

  sock.ev.on('connection.update', async (update) => {
    const { qr, connection, lastDisconnect } = update;

    if (qr && !qrSent && res) {
      try {
        const qrImage = await QRCode.toDataURL(qr);
        console.log('✅ QR generated');
        res.json({ qr: qrImage });
        qrSent = true;
      } catch (err) {
        console.error('❌ QR generation failed', err);
        if (!qrSent) res.status(500).json({ error: 'Failed to generate QR' });
        qrSent = true;
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp connected');
      await saveCreds();

      try {
        const credsPath = path.join(sessionFolder, 'creds.json');
        const creds = fs.readFileSync(credsPath, 'utf-8');
        const encoded = Buffer.from(creds).toString('base64');

        await sock.sendMessage(sock.user.id, {
          text: `🐺 Silent Wolf Session Generated ✅\n\nYour session string (base64):\n\n${encoded}`
        });

        console.log('📩 Session sent to DM!');
      } catch (err) {
        console.error('❌ Failed to send session to DM:', err);
      }
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== 401);
      console.log('❌ Connection closed:', lastDisconnect?.error?.message, '| Reconnect?', shouldReconnect);
      if (shouldReconnect) startSession(number); // auto-reconnect
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// API endpoint
app.post('/generate', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Please provide a WhatsApp number' });

  startSession(number, res).catch(err => {
    console.error('❌ Session generator error:', err);
    res.status(500).json({ error: 'Failed to generate session' });
  });
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
