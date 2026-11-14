"use strict";

const byId = (id) => document.getElementById(id);
const fileInput = byId("image-file");
const predictButton = byId("predict");
let selectedImage = null;
let previewUrl = null;
let busy = false;

const api = window.geoGuessrApi || {
  async info() {
    const response = await fetch("/api/model");
    if (!response.ok) throw new Error("Could not load model information.");
    return response.json();
  },
  async predict(image) {
    const response = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": image.type || "application/octet-stream" },
      body: image,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Prediction failed.");
    return result;
  },
};

window.addEventListener("model-progress", (event) => status(event.detail));

function status(message, error = false) {
  byId("status").textContent = message;
  byId("status").classList.toggle("error", error);
}

function setBusy(value) {
  busy = value;
  fileInput.disabled = value;
  predictButton.disabled = value || !selectedImage;
  document.querySelectorAll("#examples button").forEach((button) => { button.disabled = value; });
  predictButton.textContent = value ? "Predicting..." : "Predict countries";
}

function selectImage(image, name) {
  if (image.size > 12 * 1024 * 1024) {
    selectedImage = null;
    predictButton.disabled = true;
    byId("predictions").replaceChildren();
    byId("dataset-label").hidden = true;
    byId("timing").textContent = "";
    status("Choose an image smaller than 12 MB.", true);
    return;
  }
  selectedImage = image;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(image);
  byId("preview-image").src = previewUrl;
  byId("preview-image").hidden = false;
  byId("preview-placeholder").hidden = true;
  byId("filename").textContent = name;
  byId("predictions").replaceChildren();
  byId("results-placeholder").hidden = false;
  byId("dataset-label").hidden = true;
  byId("timing").textContent = "";
  setBusy(false);
  status("Ready to predict.");
}

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) selectImage(fileInput.files[0], fileInput.files[0].name);
});

byId("upload-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedImage || busy) return;
  setBusy(true);
  status("Assessing screenshot...");
  try {
    const result = await api.predict(selectedImage);
    byId("predictions").replaceChildren(...result.predictions.map((prediction) => {
      const item = document.createElement("li");
      item.append(document.createTextNode(prediction.country));
      const score = document.createElement("span");
      score.className = "score";
      score.textContent = (prediction.score * 100).toFixed(2) + "%";
      item.append(score);
      return item;
    }));
    byId("results-placeholder").hidden = true;
    byId("dataset-label").hidden = !result.dataset_label;
    byId("dataset-label").textContent = result.dataset_label ? "Dataset label: " + result.dataset_label : "";
    byId("timing").textContent = "Processing time: " + (result.processing_ms / 1000).toFixed(2) + " s";
    status("Prediction complete.");
  } catch (error) {
    status(error.message || "Prediction failed. Please try again.", true);
  } finally {
    setBusy(false);
  }
});

async function loadModelInfo() {
  try {
    const info = await api.info();
    byId("model-summary").textContent = "Supported countries (" + info.classes.length + ")";
    byId("countries").textContent = info.classes.join(", ");
    byId("benchmark").textContent = "Recorded final test accuracy: " + (info.test_accuracy * 100).toFixed(2) + "% across 40 countries.";
    for (const example of info.examples) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = example.title;
      button.addEventListener("click", async () => {
        if (busy) return;
        setBusy(true);
        status("Loading example...");
        try {
          const imageResponse = await fetch(example.url);
          if (!imageResponse.ok) throw new Error("Could not load this example.");
          selectImage(await imageResponse.blob(), example.title);
          fileInput.value = "";
        } catch (error) {
          status(error.message, true);
        } finally {
          setBusy(false);
        }
      });
      byId("examples").append(button);
    }
    status("Ready. JPG, PNG, or WebP, up to 12 MB.");
  } catch (error) {
    status(error.message, true);
  }
}

loadModelInfo();
