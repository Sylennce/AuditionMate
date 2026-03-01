import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import multer from "multer";

const db = new Database("coldread.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS scenes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS lines (
    id TEXT PRIMARY KEY,
    sceneId TEXT NOT NULL,
    orderIndex INTEGER NOT NULL,
    speakerRole TEXT NOT NULL, -- 'MYSELF' or 'READER'
    text TEXT,
    cueWord TEXT,
    audioPath TEXT,
    durationMs INTEGER,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sceneId) REFERENCES scenes(id) ON DELETE CASCADE
  );
`);

const app = express();
const PORT = 3000;

app.use(express.json());

// Multer for audio/video uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads";
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

app.use("/uploads", express.static("uploads"));

// API Routes
app.get("/api/scenes", (req, res) => {
  const scenes = db.prepare("SELECT * FROM scenes ORDER BY createdAt DESC").all();
  res.json(scenes);
});

app.post("/api/scenes", (req, res) => {
  const { id, title } = req.body;
  db.prepare("INSERT INTO scenes (id, title) VALUES (?, ?)").run(id, title);
  const scene = db.prepare("SELECT * FROM scenes WHERE id = ?").get(id);
  res.json(scene);
});

app.delete("/api/scenes/:id", (req, res) => {
  db.prepare("DELETE FROM scenes WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

app.get("/api/scenes/:id/lines", (req, res) => {
  const lines = db.prepare("SELECT * FROM lines WHERE sceneId = ? ORDER BY orderIndex ASC").all(req.params.id);
  res.json(lines);
});

app.post("/api/lines", upload.single("audio"), (req, res) => {
  const { id, sceneId, orderIndex, speakerRole, text, cueWord, durationMs } = req.body;
  const audioPath = req.file ? `/uploads/${req.file.filename}` : null;

  db.prepare(`
    INSERT INTO lines (id, sceneId, orderIndex, speakerRole, text, cueWord, audioPath, durationMs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sceneId, orderIndex, speakerRole, text, cueWord, audioPath, durationMs);

  res.json({ id, audioPath });
});

app.put("/api/lines/:id", (req, res) => {
  const { text, cueWord, speakerRole, orderIndex } = req.body;
  db.prepare(`
    UPDATE lines SET text = ?, cueWord = ?, speakerRole = ?, orderIndex = ?
    WHERE id = ?
  `).run(text, cueWord, speakerRole, orderIndex, req.params.id);
  res.json({ success: true });
});

app.delete("/api/lines/:id", (req, res) => {
  db.prepare("DELETE FROM lines WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Export Scene
app.get("/api/scenes/:id/export", async (req, res) => {
  const scene = db.prepare("SELECT * FROM scenes WHERE id = ?").get(req.params.id);
  const lines = db.prepare("SELECT * FROM lines WHERE sceneId = ?").all(req.params.id);
  
  const exportData = { scene, lines };
  res.json(exportData);
});

// Import Scene
app.post("/api/scenes/import", async (req, res) => {
  const { scene, lines } = req.body;
  
  db.prepare("INSERT OR REPLACE INTO scenes (id, title, createdAt) VALUES (?, ?, ?)").run(scene.id, scene.title, scene.createdAt);
  
  const insertLine = db.prepare(`
    INSERT OR REPLACE INTO lines (id, sceneId, orderIndex, speakerRole, text, cueWord, audioPath, durationMs, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const line of lines) {
    insertLine.run(line.id, line.sceneId, line.orderIndex, line.speakerRole, line.text, line.cueWord, line.audioPath, line.durationMs, line.createdAt);
  }
  
  res.json({ success: true });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
