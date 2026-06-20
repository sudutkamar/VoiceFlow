// Script to generate icon.png for the app window
// Run: node scripts/create-app-icon.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WIDTH = 128;
const HEIGHT = 128;

// Create RGBA pixel data (128x128)
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4, 0);

// Colors
const BG_R = 0x1a, BG_G = 0x1a, BG_B = 0x2e; // Dark background #1a1a2e
const MIC_R = 0x53, MIC_G = 0xc0, MIC_B = 0xF0; // Blue microphone #53c0f0

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const offset = (y * WIDTH + x) * 4;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
  pixels[offset + 3] = a;
}

function fillRect(x1, y1, x2, y2, r, g, b) {
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      setPixel(x, y, r, g, b);
    }
  }
}

function fillCircle(cx, cy, radius, r, g, b) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(x, y, r, g, b);
      }
    }
  }
}

// Fill background with rounded corners (simulated)
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    // Simple rounded rectangle
    const cornerRadius = 24;
    const inCorner = (x < cornerRadius && y < cornerRadius) ||
                     (x >= WIDTH - cornerRadius && y < cornerRadius) ||
                     (x < cornerRadius && y >= HEIGHT - cornerRadius) ||
                     (x >= WIDTH - cornerRadius && y >= HEIGHT - cornerRadius);
    
    if (inCorner) {
      const dx = x < cornerRadius ? cornerRadius - x : x - (WIDTH - cornerRadius - 1);
      const dy = y < cornerRadius ? cornerRadius - y : y - (HEIGHT - cornerRadius - 1);
      if (dx * dx + dy * dy > cornerRadius * cornerRadius) continue;
    }
    
    setPixel(x, y, BG_R, BG_G, BG_B);
  }
}

// Draw microphone body (centered in 128x128)
// Microphone capsule: centered at x=64, from y=28 to y=80
for (let y = 28; y <= 80; y++) {
  for (let x = 48; x <= 80; x++) {
    // Capsule shape
    const dx = x - 64;
    const distFromCenter = Math.abs(dx);
    if (distFromCenter <= 16) {
      // Rounded top and bottom
      const topDist = y - 28;
      const bottomDist = 80 - y;
      if (topDist < 16 || bottomDist < 16) {
        const cornerDist = Math.min(topDist, bottomDist);
        if (cornerDist >= 0 && distFromCenter * distFromCenter + cornerDist * cornerDist <= 16 * 16 + 100) {
          setPixel(x, y, MIC_R, MIC_G, MIC_B);
        }
      } else {
        setPixel(x, y, MIC_R, MIC_G, MIC_B);
      }
    }
  }
}

// Draw microphone stem
for (let y = 80; y <= 96; y++) {
  setPixel(62, y, MIC_R, MIC_G, MIC_B);
  setPixel(63, y, MIC_R, MIC_G, MIC_B);
  setPixel(64, y, MIC_R, MIC_G, MIC_B);
  setPixel(65, y, MIC_R, MIC_G, MIC_B);
  setPixel(66, y, MIC_R, MIC_G, MIC_B);
}

// Draw base
for (let x = 40; x <= 88; x++) {
  setPixel(x, 96, MIC_R, MIC_G, MIC_B);
  setPixel(x, 97, MIC_R, MIC_G, MIC_B);
  setPixel(x, 98, MIC_R, MIC_G, MIC_B);
}

// Draw arc (sound waves) on left side
for (let angle = -60; angle <= 60; angle += 2) {
  const rad = (angle * Math.PI) / 180;
  const radius = 28;
  const x = Math.round(64 - 16 - Math.cos(rad) * radius);
  const y = Math.round(54 - Math.sin(rad) * radius);
  setPixel(x, y, MIC_R, MIC_G, MIC_B);
  setPixel(x - 1, y, MIC_R, MIC_G, MIC_B);
  setPixel(x + 1, y, MIC_R, MIC_G, MIC_B);
}

// Draw arc on right side
for (let angle = -60; angle <= 60; angle += 2) {
  const rad = (angle * Math.PI) / 180;
  const radius = 28;
  const x = Math.round(64 + 16 + Math.cos(rad) * radius);
  const y = Math.round(54 - Math.sin(rad) * radius);
  setPixel(x, y, MIC_R, MIC_G, MIC_B);
  setPixel(x - 1, y, MIC_R, MIC_G, MIC_B);
  setPixel(x + 1, y, MIC_R, MIC_G, MIC_B);
}

// ---- PNG Creation ----
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function createIHDR() {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(WIDTH, 0);
  data.writeUInt32BE(HEIGHT, 4);
  data[8] = 8;
  data[9] = 6; // RGBA
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return createChunk('IHDR', data);
}

function createIDAT() {
  const rawData = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
  for (let y = 0; y < HEIGHT; y++) {
    rawData[y * (1 + WIDTH * 4)] = 0;
    pixels.copy(rawData, y * (1 + WIDTH * 4) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return createChunk('IDAT', compressed);
}

function createIEND() {
  return createChunk('IEND', Buffer.alloc(0));
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

const png = Buffer.concat([signature, createIHDR(), createIDAT(), createIEND()]);

const outputPath = path.join(__dirname, '..', 'resources', 'icons', 'icon.png');
fs.writeFileSync(outputPath, png);

console.log('✓ App icon created successfully!');
console.log('  Path:', outputPath);
console.log('  Size:', png.length, 'bytes');
console.log('  Dimensions:', WIDTH + 'x' + HEIGHT);
