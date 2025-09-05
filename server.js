




// import express from 'express';
// import bodyParser from 'body-parser';
// import QRCode from 'qrcode';
// import fs from 'fs';
// import path from 'path';
// import baileys from '@whiskeysockets/baileys';

// const { makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;

// const app = express();
// app.use(bodyParser.json());
// app.use(express.static('public'));

// const PORT = 5000;

// // Sessions folder
// const sessionsDir = path.join(process.cwd(), 'sessions');
// if (!fs.existsSync(sessionsDir)) {
//   fs.mkdirSync(sessionsDir, { recursive: true });
// }

// // Generate short unique session ID starting with SilentWolf
// function generateShortSession() {
//   const randomPart = Math.random().toString(36).substring(2, 8); // 6 random chars
//   const timestamp = Date.now().toString(36); // unique timestamp
//   return `SilentWolf-${timestamp}-${randomPart}`;
// }

// async function startSession(number) {
//   const sessionFolder = path.join(sessionsDir, number);
//   if (!fs.existsSync(sessionFolder)) {
//     fs.mkdirSync(sessionFolder, { recursive: true }); // ✅ fix ENOENT error
//   }

//   const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
//   const { version } = await fetchLatestBaileysVersion();

//   const sock = makeWASocket({ auth: state, version });

//   return new Promise((resolve, reject) => {
//     let qrSent = false;
//     let sessionSent = false;
//     const shortSession = generateShortSession();

//     sock.ev.on('connection.update', async (update) => {
//       const { qr, connection, lastDisconnect } = update;

//       // 1️⃣ Send QR to frontend immediately
//       if (qr && !qrSent) {
//         try {
//           const qrImage = await QRCode.toDataURL(qr);
//           qrSent = true;
//           resolve({ qr: qrImage, session: shortSession }); // return QR + short session
//         } catch (err) {
//           console.error('❌ QR generation failed', err);
//           reject(err);
//         }
//       }

//       // 2️⃣ When connection opens, try sending short session to WhatsApp
//       if (connection === 'open' && !sessionSent) {
//         console.log(`✅ WhatsApp connected for ${number}`);
//         await saveCreds();

//         const userJid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
//         try {
//           await sock.sendMessage(userJid, {
//             text: `🐺 Silent Wolf Session Generated ✅\n\nYour short session ID:\n\n${shortSession}`
//           });
//           console.log('📩 Short session sent to user DM!');
//         } catch (err) {
//           console.log('❌ Could not send short session automatically. User must message the bot first.', err);
//         }

//         sessionSent = true;
//       }

//       // 3️⃣ Handle disconnection
//       if (connection === 'close') {
//         const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== 401);
//         console.log('❌ Connection closed:', lastDisconnect?.error?.message, '| Reconnect?', shouldReconnect);
//         if (shouldReconnect) startSession(number);
//       }
//     });

//     sock.ev.on('creds.update', saveCreds);
//   });
// }

// // API endpoint
// app.post('/generate', async (req, res) => {
//   const { number } = req.body;
//   if (!number) return res.status(400).json({ error: 'Please provide a WhatsApp number' });

//   try {
//     const result = await startSession(number);
//     res.json(result); // returns { qr, session }
//   } catch (err) {
//     console.error('❌ Session generator error:', err);
//     res.status(500).json({ error: 'Failed to generate session' });
//   }
// });

// app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));


import express from 'express';
import bodyParser from 'body-parser';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import baileys from '@whiskeysockets/baileys';
import crypto from 'crypto';

const { makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

const PORT = 5000;

// Sessions folder
const sessionsDir = path.join(process.cwd(), 'sessions');
if (!fs.existsSync(sessionsDir)) {
  fs.mkdirSync(sessionsDir, { recursive: true });
}

// Generate a long session (~1 page) starting with SilentWolf
function generateLongSession() {
  const prefix = 'SilentWolf-';
  // Generate 1024 random bytes and encode in Base64 (will be ~1368 chars)
  const randomBytes = crypto.randomBytes(1024).toString('base64');
  return `${prefix}${randomBytes}`;
}

async function startSession(number) {
  const sessionFolder = path.join(sessionsDir, number);
  if (!fs.existsSync(sessionFolder)) {
    fs.mkdirSync(sessionFolder, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({ auth: state, version });

  return new Promise((resolve, reject) => {
    let qrSent = false;
    let sessionSent = false;
    const longSession = generateLongSession();

    sock.ev.on('connection.update', async (update) => {
      const { qr, connection, lastDisconnect } = update;

      // 1️⃣ Send QR to frontend immediately
      if (qr && !qrSent) {
        try {
          const qrImage = await QRCode.toDataURL(qr);
          qrSent = true;
          resolve({ qr: qrImage, session: longSession });
        } catch (err) {
          console.error('❌ QR generation failed', err);
          reject(err);
        }
      }

      // 2️⃣ When connection opens, try sending long session to WhatsApp
      if (connection === 'open' && !sessionSent) {
        console.log(`✅ WhatsApp connected for ${number}`);
        await saveCreds();

        const userJid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
        try {
          await sock.sendMessage(userJid, {
            text: `🐺 Silent Wolf Session Generated ✅\n\nYour long session ID:\n\n${longSession}`
          });
          console.log('📩 Long session sent to user DM!');
        } catch (err) {
          console.log('❌ Could not send session automatically. User must message the bot first.', err);
        }

        sessionSent = true;
      }

      // 3️⃣ Handle disconnection
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== 401);
        console.log('❌ Connection closed:', lastDisconnect?.error?.message, '| Reconnect?', shouldReconnect);
        if (shouldReconnect) startSession(number);
      }
    });

    sock.ev.on('creds.update', saveCreds);
  });
}

// API endpoint
app.post('/generate', async (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ error: 'Please provide a WhatsApp number' });

  try {
    const result = await startSession(number);
    res.json(result); // returns { qr, session }
  } catch (err) {
    console.error('❌ Session generator error:', err);
    res.status(500).json({ error: 'Failed to generate session' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
