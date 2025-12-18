import path from "path";
import fs from "fs-extra";
import puppeteer from "puppeteer";
import ffmpeg from "fluent-ffmpeg";
import express from "express";

// Serve static files
const staticServer = express();
staticServer.use(express.static(process.cwd()));
const server = staticServer.listen(0);

// Get video duration
const getVideoDuration = (videoPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) reject(err);
      resolve(metadata.format.duration);
    });
  });
};

// Split array into chunks
const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const identifier = async (req, res) => {
  let browser;
  try {
    const videoPath = req.files?.video?.[0]?.path;
    const imagePath = req.files?.image?.[0]?.path;

    if (!videoPath || !imagePath) {
      return res.status(400).json({ error: "Video and image required" });
    }

    const videoDuration = await getVideoDuration(videoPath);
    console.log(`🎥 Video duration: ${videoDuration} seconds`);

    const framesDir = path.join(process.cwd(), "frames");
    await fs.ensureDir(framesDir);
    await fs.emptyDir(framesDir);

    const FPS = 2;
    console.log(`🖼️ Extracting frames at ${FPS} FPS...`);
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .output(`${framesDir}/frame-%05d.jpg`)
        .outputOptions("-vf", `fps=${FPS}`)
        .on("end", resolve)
        .on("error", reject)
        .run();
    });

    const frameFiles = (await fs.readdir(framesDir))
      .filter((f) => f.endsWith(".jpg"))
      .sort();

    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    const referenceUrl = `${baseUrl}/${imagePath}`;

    const frameUrls = [];

    for (const f of frameFiles) {
      const fullPath = path.join(process.cwd(), "frames", f);
      const exists = await fs.pathExists(fullPath);
      if (exists) {
        frameUrls.push(`${baseUrl}/frames/${f}`);
      }
    }

    const chunks = chunkArray(frameUrls, 25);
    console.log(`🧮 Total frames: ${frameUrls.length}, Batches: ${chunks.length}`);

    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--memory-pressure-off",
      ],
    });

    const page = await browser.newPage();
    page.on("console", (msg) => console.log("BROWSER LOG:", msg.text()));

    await page.goto(`${baseUrl}/detect.html`, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    console.log("⏳ Warming up face detection...");
    await page.evaluate(async (refUrl) => {
      if (window.getReferenceDescriptor) {
        await window.getReferenceDescriptor(refUrl);
      }
    }, referenceUrl);
    console.log("🔥 Models warmed up. Starting batch processing...");

    let bestMatch = null;

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const batch = chunks[batchIndex];
      console.log(`⚙️ Processing batch ${batchIndex + 1}/${chunks.length}...`);
      const batchStart = Date.now();

      const results = await page.evaluate(async (refUrl, frameBatch) => {
        if (!window.matchBatch) return [];
        return await window.matchBatch(refUrl, frameBatch);
      }, referenceUrl, batch);

      const batchDuration = Date.now() - batchStart;
      console.log(`✅ Batch ${batchIndex + 1} completed in ${batchDuration} ms`);

      for (const result of results) {
        const match = result?.frameUrl?.match(/frame-(\d+)\.jpg/);
        if (!match) continue;
        const frameNumber = parseInt(match[1], 10);

        if (!bestMatch || result.distance < bestMatch.distance) {
          bestMatch = { frameNumber, distance: result.distance };
        }
      }

      await sleep(300); // Small delay between batches
    }

    const toSeconds = (frameNumber) => Number((frameNumber / FPS).toFixed(2));

    if (bestMatch) {
      const time = toSeconds(bestMatch.frameNumber);
      console.log(
        `🎯 Match found at ${time}s (frame ${bestMatch.frameNumber}, distance: ${bestMatch.distance})`
      );
      return res.json({
        time,
        frameNumber: bestMatch.frameNumber,
        distance: bestMatch.distance,
        videoDuration,
        fps: FPS,
      });
    } else {
      console.log("🚫 No match found in video");
      return res.json({
        time: null,
        videoDuration,
        fps: FPS,
      });
    }
  } catch (err) {
    console.error("💥 Error in identifier:", err);
    res.status(500).json({
      error: "Internal server error",
      details: err.message,
      stack: err.stack,
    });
  } finally {
    if (browser) await browser.close();
    const framesDir = path.join(process.cwd(), "frames");
    if (fs.existsSync(framesDir)) {
      await fs.remove(framesDir).catch(console.error);
    }
  }
};

// new works...little improv
