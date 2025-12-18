import express from "express";
import helmet from "helmet";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import cors from "cors";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import multer from "multer";
import { fileURLToPath } from "url";
import crypto from "crypto";
import uploadRoute from "./routes/upload.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4002;

// Create upload directories if they don't exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir(path.join(__dirname, "uploads"));
ensureDir(path.join(__dirname, "matching-faces"));

// Middleware setup
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
      },
    },
  })
);

app.use(cors({ origin: true, methods: ["*"], credentials: true }));
app.use(bodyParser.json({ extended: true }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// Static files
app.use(express.static("public"));
app.use("/models", express.static(path.join(__dirname, "models")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/matching-faces", express.static(path.join(__dirname, "matching-faces")));

// Routes
app.get("/", (req, res) => {
  res.send("Cookies cleared and APIs working.");
});

app.get("/live", (req, res) => {
  res.sendFile(path.join(__dirname, "live-detect.html"));
});

app.use("/api", uploadRoute);

// ---------------------------
// Duplicate cleanup function
// ---------------------------
async function removeDuplicates() {
  const dir = path.join(__dirname, "matching-faces");
  const files = fs.readdirSync(dir).filter((f) =>
    [".png", ".jpg", ".jpeg"].includes(path.extname(f).toLowerCase())
  );

  const seen = new Map();
  const removed = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const hash = crypto
      .createHash("md5")
      .update(fs.readFileSync(filePath))
      .digest("hex");

    if (seen.has(hash)) {
      fs.unlinkSync(filePath);
      removed.push(file);
      console.log(`🗑 Removed duplicate: ${file}`);
    } else {
      seen.set(hash, file);
    }
  }
  return removed;
}

// ---------------------------
// Multer Storage Setup
// ---------------------------

// Storage for reference images
const referenceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `reference-${Date.now()}${ext}`);
  },
});
const referenceUpload = multer({ storage: referenceStorage });

// Storage for matched faces
const matchStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "matching-faces"));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `match-${Date.now()}${ext}`);
  },
});
const matchUpload = multer({ storage: matchStorage });

// ---------------------------
// Upload Endpoints
// ---------------------------

app.post(
  "/save-reference",
  referenceUpload.single("referenceImage"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    res.status(200).json({
      message: "Reference image saved",
      filename: req.file.filename,
    });
  }
);

app.post("/save-face", matchUpload.single("faceImage"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // 🔥 Auto-cleanup duplicates after saving
  await removeDuplicates();

  res.status(200).json({
    message: "Face image saved",
    filename: req.file.filename,
  });
});

// ---------------------------
// Extra API: manual cleanup
// ---------------------------
app.post("/api/cleanup-duplicates", async (req, res) => {
  try {
    const removed = await removeDuplicates();
    res.json({ message: "Cleanup complete", removed });
  } catch (err) {
    console.error("Cleanup error:", err);
    res.status(500).json({ error: "Failed to cleanup duplicates" });
  }
});

// ---------------------------
// GET Reference Images
// ---------------------------
app.get("/api/references", (req, res) => {
  const uploadDir = path.join(__dirname, "uploads");

  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error("Error reading uploads:", err);
      return res.status(500).json({ error: "Failed to list images" });
    }

    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );

    if (imageFiles.length === 0) {
      return res.status(404).json({ error: "No reference images found" });
    }

    const fullPaths = imageFiles.map((file) => ({
      file,
      time: fs.statSync(path.join(uploadDir, file)).ctime.getTime(),
    }));

    fullPaths.sort((a, b) => b.time - a.time);

    const latestFile = fullPaths[0].file;
    res.json({ filename: latestFile });
  });
});

// ---------------------------
// Global error handler
// ---------------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
