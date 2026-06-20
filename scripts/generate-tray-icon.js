// Script to generate tray-icon.png
// Run this with: node scripts/generate-tray-icon.js

const fs = require('fs');
const path = require('path');

// Simple approach: create a 16x16 PNG manually
// PNG file format is complex, so we'll use a minimal approach

// For now, let's create a simple 1-color icon that Windows can use
// The icon data will be a 16x16 RGBA raw image

const width = 16;
const height = 16;
const pixels = Buffer.alloc(width * height * 4, 0);

// Color: #53c0f0 (light blue)
const r = 0x53, g = 0xc0, b = 0xf0;

function setPixel(x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const offset = (y * width + x) * 4;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
  pixels[offset + 3] = 255;
}

// Draw microphone body
for (let y = 2; y <= 8; y++) {
  setPixel(7, y);
  setPixel(8, y);
  if (y >= 3 && y <= 7) {
    setPixel(6, y);
    setPixel(9, y);
  }
}

// Top
setPixel(7, 1);
setPixel(8, 1);

// Stem
setPixel(7, 9);
setPixel(8, 9);
setPixel(7, 10);
setPixel(8, 10);

// Base
for (let x = 5; x <= 10; x++) {
  setPixel(x, 11);
}

// Arc
setPixel(4, 6);
setPixel(4, 7);
setPixel(4, 8);
setPixel(4, 9);
setPixel(5, 10);
setPixel(11, 6);
setPixel(11, 7);
setPixel(11, 8);
setPixel(11, 9);
setPixel(10, 10);

// Save as raw RGBA for Electron's nativeImage.createFromBuffer
const outputPath = path.join(__dirname, '..', 'resources', 'icons', 'tray-icon.raw');
fs.writeFileSync(outputPath, pixels);

console.log('Raw icon data saved to:', outputPath);
console.log('This can be loaded with nativeImage.createFromBuffer()');
console.log('\nFor a proper PNG file, you can use online converters or install sharp:');
console.log('  npm install sharp');
