import fs from "fs-extra";
import path from "path";
import express from "express";
import multer from "multer";

const router = express.Router();

const upload = multer({ dest: "uploads/" });

router.post("/upload-image", upload.single("image"), async (req, res) => {
  const imagePath = req.file?.path;
  const targetPath = path.join("public/uploads", "person.jpg");

  await fs.ensureDir("public/uploads");
  await fs.move(imagePath, targetPath, { overwrite: true });

  res.json({ message: "Image uploaded", path: "/uploads/person.jpg" });
});

export default router;
