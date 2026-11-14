"use strict";

(() => {
  let information;
  let sessionPromise;
  const progress = (message) => window.dispatchEvent(new CustomEvent("model-progress", { detail: message }));
  const digest = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((value) => value.toString(16).padStart(2, "0")).join("");

  async function info() {
    if (!information) {
      const response = await fetch("./model_info.json");
      if (!response.ok) throw new Error("Could not load model information.");
      information = await response.json();
    }
    return information;
  }

  async function loadSession() {
    const model = await info();
    const bytes = new Uint8Array(model.browser_model.bytes);
    let offset = 0;
    for (const part of model.browser_model.parts) {
      progress(`Loading model: ${Math.round(offset / bytes.length * 100)}%. First use downloads about ${model.browser_model.download_mb} MB.`);
      const response = await fetch("./" + part.file, { cache: "force-cache" });
      if (!response.ok) throw new Error("Could not download the model. Please try again.");
      const content = new Uint8Array(await response.arrayBuffer());
      if (content.length !== part.bytes || await digest(content) !== part.sha256) {
        throw new Error("The model download is incomplete. Refresh the page and try again.");
      }
      bytes.set(content, offset);
      offset += content.length;
    }
    progress("Preparing model on this device...");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = new URL("./vendor/", document.baseURI).href;
    return ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
  }

  async function predict(image) {
    const started = performance.now();
    const model = await info();
    const header = new Uint8Array(await image.slice(0, 12).arrayBuffer());
    const jpeg = header[0] === 255 && header[1] === 216;
    const png = header[0] === 137 && String.fromCharCode(...header.slice(1, 4)) === "PNG";
    const webp = String.fromCharCode(...header.slice(0, 4)) === "RIFF" && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
    if (!jpeg && !png && !webp) throw new Error("Choose a JPG, PNG, or WebP image.");
    const bitmap = await createImageBitmap(image, { colorSpaceConversion: "none" });
    try {
      if (bitmap.width * bitmap.height > 25000000) throw new Error("Choose an image under 25 million pixels.");
      sessionPromise ||= loadSession().catch((error) => { sessionPromise = null; throw error; });
      const session = await sessionPromise;
      progress("Assessing screenshot on this device...");
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const inputs = geoGuessrPreprocess(rgba, bitmap.width, bitmap.height);
      const output = await session.run({ image: new ort.Tensor("float32", inputs, [1, 3, 224, 224]) });
      const logits = Array.from(output.logits.data);
      const maximum = Math.max(...logits);
      const scores = logits.map((value) => Math.exp(value - maximum));
      const total = scores.reduce((sum, value) => sum + value, 0);
      const predictions = scores.map((value, index) => ({ country: model.classes[index], score: value / total }))
        .sort((first, second) => second.score - first.score).slice(0, 5);
      const result = { predictions, processing_ms: Math.round(performance.now() - started) };
      const imageHash = await digest(await image.arrayBuffer());
      const example = model.examples.find((item) => item.sha256 === imageHash);
      if (example) result.dataset_label = example.label;
      return result;
    } finally {
      bitmap.close();
    }
  }

  window.geoGuessrApi = { info, predict };
})();
