let referenceDescriptor = null;
let MATCH_THRESHOLD = 0.55; // fixed threshold
let isProcessing = false;
let currentReferenceImage = null;
let lastSavedTime = 0;
const COOLDOWN = 5000; // 5 seconds cooldown between saves
let hornPlayed = false;

// DOM Elements
const videoElement = document.getElementById("video");
const overlayCanvas = document.getElementById("overlay");
const resultDisplay = document.getElementById("result");
const referenceImageElement = document.getElementById("referenceImage");
const noReferenceElement = document.getElementById("noReference");
const loaderElement = document.getElementById("loader");
const uploadTrigger = document.getElementById("uploadTrigger");
const imageUpload = document.getElementById("imageUpload");
// Removed thresholdSlider and thresholdValue as no slider now
const accuracyBar = document.getElementById("accuracyBar");
const accuracyText = document.getElementById("accuracyText");
const toggleOverlay = document.getElementById("toggleOverlay");

// Show loader, hide image and noReference text
function showLoader() {
  loaderElement.style.display = "block";
  referenceImageElement.style.display = "none";
  noReferenceElement.style.display = "none";
}

// Hide loader, show image
function hideLoader() {
  loaderElement.style.display = "none";
  referenceImageElement.style.display = "block";
  noReferenceElement.style.display = "none";
}

// Show noReference text, hide loader and image
function showNoReference() {
  loaderElement.style.display = "none";
  referenceImageElement.style.display = "none";
  noReferenceElement.style.display = "block";
}

// Set the reference image source with loader control
let lastGoodReference = null;

function setReferenceImage(src) {
  showLoader();
  referenceImageElement.src = src;

  referenceImageElement.onload = () => {
    hideLoader();
    lastGoodReference = src; // save good one
  };

  referenceImageElement.onerror = () => {
    console.warn("Reference image failed to load:", src);
    if (lastGoodReference) {
      referenceImageElement.src = lastGoodReference; // restore last good image
      hideLoader();
    } else {
      showNoReference();
    }
  };
}

// Load face-api models
async function setupModels() {
  updateStatus("Loading face detection models...");
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
    faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
    faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
  ]);
  updateStatus("Models loaded - ready for face detection");
}

// Update status message
function updateStatus(message) {
  document.getElementById("status").textContent = message;
}

// Handle image upload
function setupUpload() {
  uploadTrigger.addEventListener("click", () => imageUpload.click());

  uploadTrigger.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadTrigger.style.borderColor = "#666";
  });

  uploadTrigger.addEventListener("dragleave", () => {
    uploadTrigger.style.borderColor = "#ccc";
  });

  uploadTrigger.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadTrigger.style.borderColor = "#ccc";
    if (e.dataTransfer.files.length) {
      imageUpload.files = e.dataTransfer.files;
      handleImageUpload();
    }
  });

  imageUpload.addEventListener("change", handleImageUpload);
}
document.getElementById("captureBtn").addEventListener("click", async () => {
  if (!videoElement || videoElement.readyState < 2) {
    alert("Video not ready");
    return;
  }

  try {
    updateStatus("Processing captured image...");

    const captureCanvas = document.createElement("canvas");
    captureCanvas.width = videoElement.videoWidth;
    captureCanvas.height = videoElement.videoHeight;
    const ctx = captureCanvas.getContext("2d");

    // Undo the mirror effect for capture
    ctx.translate(captureCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(
      videoElement,
      0,
      0,
      captureCanvas.width,
      captureCanvas.height
    );

    // Reset transform for any text or other drawing
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Set as reference image
    const dataUrl = captureCanvas.toDataURL("image/png");
    //setReferenceImage(dataUrl);

    // Download the image
    const downloadLink = document.getElementById("downloadLink");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadLink.href = dataUrl;
    downloadLink.download = `reference-face-${timestamp}.png`;
    downloadLink.click();

    // Try to detect face but don't show errors if none found
    const detection = await faceapi
      .detectSingleFace(captureCanvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      referenceDescriptor = detection.descriptor;
      resultDisplay.textContent = "✅ Reference captured and downloaded!";
      resultDisplay.style.color = "green";
      updateStatus("Reference face set - detection active");
    } else {
      // Silently continue without showing error about no face detected
      resultDisplay.textContent = "✅ Image captured and downloaded!";
      resultDisplay.style.color = "green";
      updateStatus("Image saved - detection may not work without visible face");
    }
  } catch (err) {
    console.error("Capture error:", err);
    resultDisplay.textContent = "❌ Error capturing image";
    resultDisplay.style.color = "red";
    updateStatus("Capture failed - try again");
    showNoReference();
  }
});
// download screenshot button
// Save matched face to browser download
async function takeScreenshot(video, box) {
  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    video,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height
  );

  // Create download link
  const downloadLink = document.getElementById("downloadLink");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadLink.href = canvas.toDataURL("image/png");
  downloadLink.download = `face-match-${timestamp}.png`;
  downloadLink.click();
}

async function handleImageUpload() {
  const file = imageUpload.files[0];
  if (!file) return;

  try {
    updateStatus("Processing uploaded image...");
    const img = await faceapi.bufferToImage(file);

    setReferenceImage(URL.createObjectURL(file));
    currentReferenceImage = img;

    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (detection) {
      referenceDescriptor = detection.descriptor;
      resultDisplay.textContent = "✅ Reference face updated!";
      resultDisplay.style.color = "green";
      updateStatus("Reference face loaded - detection active");

      await saveReferenceImage(file);
    } else {
      throw new Error("No face found in image");
    }
  } catch (err) {
    console.error("Upload error:", err);
    resultDisplay.textContent = "❌ Error: " + err.message;
    resultDisplay.style.color = "red";
    updateStatus("Upload failed - please try another image");

    showNoReference();
  }
}

// Save reference image to server
async function saveReferenceImage(file) {
  try {
    const formData = new FormData();
    const filename = `reference-${Date.now()}${file.name.match(/\..+$/)[0]}`;
    formData.append("referenceImage", file, filename);

    const response = await fetch("/save-reference", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    console.log("Reference image saved to /uploads:", data.filename);

    const imageUrl = `${window.location.origin}/uploads/${data.filename}`;

    setReferenceImage(imageUrl);
  } catch (err) {
    console.error("Error saving reference image:", err);
  }
}

// Save matched face to server
async function takeScreenshot(video, box) {
  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    video,
    box.x,
    box.y,
    box.width,
    box.height,
    0,
    0,
    box.width,
    box.height
  );

  canvas.toBlob(async (blob) => {
    const formData = new FormData();
    formData.append("faceImage", blob, `face-${Date.now()}.png`);
    try {
      const res = await fetch("/save-face", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      console.log("Matched face saved to /matching-faces:", data.filename);
    } catch (err) {
      console.error("Failed to save face:", err);
    }
  }, "image/png");
}

// Start webcam
async function startVideo() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      },
    });
    videoElement.srcObject = stream;
    return new Promise((resolve) => {
      videoElement.onloadedmetadata = () => {
        videoElement.play();
        resolve();
      };
    });
  } catch (err) {
    console.error("Camera error:", err);
    updateStatus("Camera access denied - please enable camera permissions");
    throw err;
  }
}

// Update accuracy display
function updateAccuracy(distance) {
  if (!distance || distance === Infinity) {
    accuracyBar.style.width = "0%";
    accuracyText.textContent = "Accuracy: 0%";
    accuracyText.style.color = "black";
    return;
  }

  const maxUseful = 0.8; // beyond this, definitely not a match
  const clamped = Math.min(maxUseful, Math.max(0, distance));
  const accuracy = (1 - clamped / maxUseful) * 100;

  accuracyBar.style.width = `${accuracy.toFixed(1)}%`;
  accuracyText.textContent = `Accuracy: ${accuracy.toFixed(1)}%`;
  accuracyText.style.color = distance < MATCH_THRESHOLD ? "green" : "red";
}

// Main face detection loop
async function detectFaces() {
  if (stopDetection) return;
  if (isProcessing || !referenceDescriptor) {
    requestAnimationFrame(detectFaces);
    return;
  }

  isProcessing = true;

  try {
    if (videoElement.readyState < 2) {
      requestAnimationFrame(detectFaces);
      return;
    }

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 608,
      scoreThreshold: 0.2,
    });

    const detections = await faceapi
      .detectAllFaces(videoElement, options)
      .withFaceLandmarks()
      .withFaceDescriptors();

    const displaySize = {
      width: videoElement.videoWidth,
      height: videoElement.videoHeight,
    };
    faceapi.matchDimensions(overlayCanvas, displaySize);
    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    const ctx = overlayCanvas.getContext("2d");
    ctx.setTransform(-1, 0, 0, 1, overlayCanvas.width, 0);
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (resizedDetections.length > 0) {
      let matchFound = false;
      let minDistance = Infinity;

      // Always calculate distance + match logic
      resizedDetections.forEach((detection) => {
        const distance = faceapi.euclideanDistance(
          referenceDescriptor,
          detection.descriptor
        );

        minDistance = Math.min(minDistance, distance);
        const isMatch = distance < MATCH_THRESHOLD;

        if (toggleOverlay.checked) {
          // Draw overlays only if enabled
          faceapi.draw.drawDetections(overlayCanvas, [detection]);
          faceapi.draw.drawFaceLandmarks(overlayCanvas, [detection]);

          new faceapi.draw.DrawBox(detection.detection.box, {
            label: `${isMatch ? "MATCH" : "NO MATCH"} (${distance.toFixed(2)})`,
            boxColor: isMatch ? "green" : "red",
            lineWidth: 2,
          }).draw(overlayCanvas);
        }

        matchFound = matchFound || isMatch;
      });

      // ✅ Update accuracy & result regardless of toggle
      updateAccuracy(minDistance);

      resultDisplay.textContent = matchFound
        ? `✅ MATCH FOUND! (Distance: ${minDistance.toFixed(2)})`
        : `❌ No match (Distance: ${minDistance.toFixed(2)})`;
      resultDisplay.style.color = matchFound ? "green" : "red";

      if (matchFound) {
        // ✅ Only play horn once per continuous match
        if (!hornPlayed) {
          playHorn();
          hornPlayed = true;
        }
        if (Date.now() - lastSavedTime > COOLDOWN) {
          lastSavedTime = Date.now();
          takeScreenshot(videoElement, resizedDetections[0].detection.box);
        }
      }
    } else {
      resultDisplay.textContent = "No faces detected";
      resultDisplay.style.color = "black";
      accuracyBar.style.width = "0%";
      accuracyText.textContent = "Accuracy: 0%";
      accuracyText.style.color = "black";
      hornPlayed = false;
    }
  } catch (err) {
    console.error("Detection error:", err);
  } finally {
    isProcessing = false;
    requestAnimationFrame(detectFaces);
  }
}

// Play horn sound
function playHorn() {
  const horn = document.getElementById("hornSound");
  if (horn) {
    horn.currentTime = 0;
    horn.play().catch((err) => console.warn("Horn play error:", err));
  }
}

// Initialize app
async function init() {
  setupUpload();
  // No threshold slider setup here

  try {
    await setupModels();
    await startVideo();
    detectFaces();
  } catch (err) {
    console.error("Initialization error:", err);
    resultDisplay.textContent = `Error: ${err.message}`;
    resultDisplay.style.color = "red";
  }
}

// Cleanup
window.addEventListener("DOMContentLoaded", init);
let stopDetection = false;
window.addEventListener("beforeunload", () => {
  stopDetection = true;
  if (videoElement.srcObject) {
    videoElement.srcObject.getTracks().forEach((track) => track.stop());
  }
});

// Reset button handler
document.getElementById("resetBtn").addEventListener("click", () => {
  // Clear reference descriptor
  referenceDescriptor = null;
  currentReferenceImage = null;

  // Reset UI
  referenceImageElement.src = "";
  referenceImageElement.style.display = "none";
  noReferenceElement.style.display = "block";
  loaderElement.style.display = "none";

  resultDisplay.textContent = "🔎 Detecting...";
  resultDisplay.style.color = "black";

  accuracyBar.style.width = "0%";
  accuracyText.textContent = "Accuracy: 0%";
  accuracyText.style.color = "black";

  updateStatus("Reference cleared - upload or capture again");
});

//
