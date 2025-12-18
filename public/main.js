document.getElementById("uploadTrigger").addEventListener("click", function () {
  document.getElementById("imageUpload").click();
});

document.getElementById("imageUpload").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    // Show loader
    document.getElementById("referenceLoader").style.display = "flex";
    document.getElementById("noReference").style.display = "none";
    document.getElementById("referenceImage").style.display = "none";

    const reader = new FileReader();
    reader.onload = function (event) {
      // Simulate processing delay (remove in production)
      setTimeout(() => {
        document.getElementById("referenceImage").src = event.target.result;
        document.getElementById("referenceImage").style.display = "block";
        document.getElementById("referenceLoader").style.display = "none";

        // Here you would call your face recognition logic
        // For demo purposes, we'll simulate a match after 1 second
        setTimeout(() => {
          updateResult(true, 0.85);
        }, 1000);
      }, 1500);
    };
    reader.readAsDataURL(file);
  }
});

function updateResult(match, confidence) {
  const resultElement = document.getElementById("result");
  const accuracyBar = document.getElementById("accuracyBar");
  const accuracyText = document.getElementById("accuracyText");

  if (match) {
    resultElement.innerHTML = '<i class="fas fa-check-circle"></i> Match Found';
    resultElement.className = "result-value match";
  } else {
    resultElement.innerHTML = '<i class="fas fa-times-circle"></i> No Match';
    resultElement.className = "result-value no-match";
  }

  const percent = Math.round(confidence * 100);
  accuracyBar.style.width = `${percent}%`;
  accuracyText.textContent = `Confidence: ${percent}%`;
}

// Simulate loading (remove this in production)
setTimeout(() => {
  document.getElementById("status").textContent = "Ready";
  const statusDot = document.querySelector(".status-dot");
  statusDot.style.backgroundColor = "#4ade80";
  statusDot.style.animation = "none";
}, 2000);

// Reset button functionality
document.getElementById("resetBtn").addEventListener("click", function () {
  const referenceImage = document.getElementById("referenceImage");
  const noReference = document.getElementById("noReference");
  const result = document.getElementById("result");
  const accuracyBar = document.getElementById("accuracyBar");
  const accuracyText = document.getElementById("accuracyText");

  referenceImage.src = "";
  referenceImage.style.display = "none";
  noReference.style.display = "flex";

  result.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Waiting for input...';
  result.className = "result-value";

  accuracyBar.style.width = "0%";
  accuracyText.textContent = "Confidence: 0%";
});
