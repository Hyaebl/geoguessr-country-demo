"use strict";

// Match Pillow's antialiased bilinear resize and torchvision's center crop.
globalThis.geoGuessrPreprocess = (pixels, width, height, channels = 4) => {
  const size = 224;
  const resizedWidth = width <= height ? 256 : Math.floor(width * 256 / height);
  const resizedHeight = height <= width ? 256 : Math.floor(height * 256 / width);
  const roundEven = (value) => {
    const lower = Math.floor(value);
    return value - lower === 0.5 && lower % 2 === 0 ? lower : Math.round(value);
  };

  function coefficients(inputSize, outputSize, crop) {
    const scale = inputSize / outputSize;
    const support = Math.max(1, scale);
    return Array.from({ length: size }, (_, index) => {
      const center = (index + crop + 0.5) * scale;
      const start = Math.max(0, Math.floor(center - support + 0.5));
      const end = Math.min(inputSize, Math.floor(center + support + 0.5));
      const weights = Array.from({ length: end - start }, (_, offset) =>
        Math.max(0, 1 - Math.abs((start + offset + 0.5 - center) / support)));
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      return { start, weights: weights.map((weight) => Math.floor(weight / total * 4194304 + 0.5)) };
    });
  }

  const xWeights = coefficients(width, resizedWidth, roundEven((resizedWidth - size) / 2));
  const yWeights = coefficients(height, resizedHeight, roundEven((resizedHeight - size) / 2));
  const firstRow = yWeights[0].start;
  const last = yWeights[size - 1];
  const rowCount = last.start + last.weights.length - firstRow;
  const horizontal = new Uint8Array(rowCount * size * 3);
  const byte = (sum) => Math.max(0, Math.min(255, Math.floor(sum / 4194304)));

  for (let row = 0; row < rowCount; row++) {
    for (let x = 0; x < size; x++) {
      const { start, weights } = xWeights[x];
      for (let channel = 0; channel < 3; channel++) {
        let sum = 2097152;
        for (let offset = 0; offset < weights.length; offset++) {
          sum += pixels[((row + firstRow) * width + start + offset) * channels + channel] * weights[offset];
        }
        horizontal[(row * size + x) * 3 + channel] = byte(sum);
      }
    }
  }

  const tensor = new Float32Array(3 * size * size);
  const means = [0.485, 0.456, 0.406];
  const deviations = [0.229, 0.224, 0.225];
  for (let y = 0; y < size; y++) {
    const { start, weights } = yWeights[y];
    for (let x = 0; x < size; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 2097152;
        for (let offset = 0; offset < weights.length; offset++) {
          sum += horizontal[((start + offset - firstRow) * size + x) * 3 + channel] * weights[offset];
        }
        tensor[channel * size * size + y * size + x] = (byte(sum) / 255 - means[channel]) / deviations[channel];
      }
    }
  }
  return tensor;
};
