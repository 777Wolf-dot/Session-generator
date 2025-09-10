import express from "express";
import bodyParser from "body-parser";
import QRCode from "qrcode";
import crypto from "crypto";
import { fileURLToPath } from "url";
import path from "path";

// ✅ Import Baileys (CJS interop)
import baileys from "@whiskeysockets/baileys";
const { makeWASocket, fetchLatestBaileysVersion, useMultiFileAuthState } = baileys;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "Public")));

const PORT = process.env.PORT || 5000;

// Generate long SilentWolf session string
function generateLongSession() {
  const prefix = "SilentWolf-";
  return `${prefix}${crypto.randomBytes(512).toString("hex")}`;
}

/* ==========================================================
   ✅ QR SESSION
========================================================== */
async function startQrSession() {
  const sessionId = crypto.randomBytes(8).toString("hex");
  const longSession = generateLongSession();

  const sessionFolder = path.join(__dirname, "sessions", `qr-${sessionId}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: true,
    browser: ["SilentWolf", "Chrome", "10.0"]
  });

  return new Promise((resolve, reject) => {
    let qrSent = false;

    sock.ev.on("connection.update", async (update) => {
      const { qr, connection } = update;

      if (qr && !qrSent) {
        try {
          const qrImage = await QRCode.toDataURL(qr);
          qrSent = true;
          resolve({ qr: qrImage, sessionId, longSession });
        } catch (err) {
          reject(err);
        }
      }

      if (connection === "open") {
        await saveCreds();
        const me = sock.user?.id;
        if (me) {
          await sock.sendMessage(me, {
            text: `🐺 Silent Wolf Session ✅\n\n${longSession}`
          });
          console.log(`✅ QR Session sent to ${me}`);
        }
      }
    });

    sock.ev.on("creds.update", saveCreds);
  });
}

/* ==========================================================
   ✅ PAIR CODE SESSION
========================================================== */
// async function startPairSession(number) {
//   if (!number) throw new Error("No number provided");

//   const jidNumber = number.replace(/\D/g, "");
//   const longSession = generateLongSession();

//   const sessionFolder = path.join(__dirname, "sessions", `pair-${jidNumber}`);
//   const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
//   const { version } = await fetchLatestBaileysVersion();

//   const sock = makeWASocket({
//     auth: state,
//     version,
//     printQRInTerminal: false,
//     browser: ["SilentWolf", "Chrome", "10.0"]
//   });

//   return new Promise((resolve, reject) => {
//     sock.ev.on("connection.update", async (update) => {
//       const { connection } = update;

//       if (connection === "open") {
//         try {
//           // ✅ Generate official WhatsApp pairing code
//           const code = await sock.requestPairingCode(jidNumber);
//           console.log(`📟 Pairing code for ${number}: ${code}`);

//           const me = sock.user?.id;
//           if (me) {
//             await sock.sendMessage(me, {
//               text: `🐺 Silent Wolf Pair Session ✅\n\n${longSession}`
//             });
//             console.log(`✅ Pair session sent to ${me}`);
//           }

//           resolve({ code, session: longSession });
//         } catch (err) {
//           console.error("❌ Pairing error:", err);
//           reject(err);
//         }
//       }
//     });

//     sock.ev.on("creds.update", saveCreds);
//   });
// }

async function startPairSession(number) {
  if (!number) throw new Error("No number provided");

  const jidNumber = number.replace(/\D/g, "");
  const sessionFolder = path.join(__dirname, "sessions", `pair-${jidNumber}`);
  const { state, saveCreds } = await useMultiFileAuthState(sessionFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    browser: ["SilentWolf", "Chrome", "10.0"]
  });

  return new Promise((resolve, reject) => {
    sock.ev.on("connection.update", async (update) => {
      const { connection, qr } = update;

      // 🔥 If QR is available, we’re in pairing mode
      if (qr) {
        console.log("📟 Pairing QR generated (open WhatsApp > Linked Devices > Link with code)");
        try {
          const code = await sock.requestPairingCode(jidNumber);
          console.log(`✅ Pair code for ${number}: ${code}`);

          const longSession = generateLongSession();
          resolve({ code, session: longSession });
        } catch (err) {
          console.error("❌ Error getting pair code:", err);
          reject(err);
        }
      }

      if (connection === "close") {
        console.log("❌ Connection closed, retry...");
      }
    });

    sock.ev.on("creds.update", saveCreds);
  });
}


/* ==========================================================
   ✅ ROUTES
========================================================== */
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "Public", "index.html"))
);

app.get("/qrcode", (req, res) =>
  res.sendFile(path.join(__dirname, "Public", "qrcode.html"))
);

app.get("/paircode", (req, res) =>
  res.sendFile(path.join(__dirname, "Public", "paircode.html"))
);

// Generate QR
app.get("/generateQR", async (req, res) => {
  try {
    const result = await startQrSession();
    res.json({
      qr: result.qr,
      sessionId: result.sessionId,
      sessionString: result.longSession
    });
  } catch (err) {
    console.error("QR error:", err);
    res.status(500).json({ error: "Failed to generate QR" });
  }
});

// Generate Pair Code
app.post("/generatePair", async (req, res) => {
  const { number } = req.body;
  if (!number)
    return res.status(400).json({ error: "Please provide a WhatsApp number" });

  try {
    const result = await startPairSession(number);
    res.json({ code: result.code, sessionString: result.session });
  } catch (err) {
    console.error("Pair error:", err);
    res.status(500).json({ error: "Failed to generate pair code" });
  }
});

// Test route
app.get("/test", (req, res) => res.send("Server is running correctly ✅"));

/* ==========================================================
   ✅ START SERVER
========================================================== */
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
