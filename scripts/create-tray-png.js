// Script to generate a proper tray-icon.png file
// Run: node scripts/create-tray-png.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WIDTH = 16;
const HEIGHT = 16;

// Create RGBA pixel data (16x16)
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4, 0);

// Color: #53c0f0 (light blue - VoiceFlow brand color)
const R = 0x53, G = 0xc0, B = 0xF0;

function setPixel(x, y) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const offset = (y * WIDTH + x) * 4;
  pixels[offset] = R;
  pixels[offset + 1] = G;
  pixels[offset + 2] = B;
  pixels[offset + 3] = 255; // Full opacity
}

// Draw microphone icon (16x16) - centered for visibility
// Microphone body (capsule shape)
for (let y = 3; y <= 9; y++) {
  setPixel(7, y);
  setPixel(8, y);
  if (y >= 4 && y <= 8) {
    setPixel(6, y);
    setPixel(9, y);
  }
}

// Microphone top (rounded)
setPixel(7, 2);
setPixel(8, 2);

// Microphone stem
setPixel(7, 10);
setPixel(8, 10);
setPixel(7, 11);
setPixel(8, 11);

// Base (wider)
for (let x = 5; x <= 10; x++) {
  setPixel(x, 12);
}

// Arc around microphone (sound waves)
setPixel(4, 5);
setPixel(4, 6);
setPixel(4, 7);
setPixel(4, 8);
setPixel(4, 9);
setPixel(4, 10);
setPixel(5, 11);
setPixel(12, 5);
setPixel(12, 6);
setPixel(12, 7);
setPixel(12, 8);
setPixel(12, 9);
setPixel(12, 10);
setPixel(11, 11);

// ---- PNG Creation ----

// PNG signature
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Create IHDR chunk (image header)
function createIHDR() {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(WIDTH, 0);   // Width
  data.writeUInt32BE(HEIGHT, 4);  // Height
  data[8] = 8;                     // Bit depth
  data[9] = 6;                     // Color type (RGBA)
  data[10] = 0;                    // Compression method
  data[11] = 0;                    // Filter method
  data[12] = 0;                    // Interlace method
  return createChunk('IHDR', data);
}

// Create IDAT chunk (image data)
function createIDAT() {
  // Add filter byte (0 = None) at the start of each row
  const rawData = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
  for (let y = 0; y < HEIGHT; y++) {
    rawData[y * (1 + WIDTH * 4)] = 0; // Filter type: None
    pixels.copy(rawData, y * (1 + WIDTH * 4) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  return createChunk('IDAT', compressed);
}

// Create IEND chunk (image end)
function createIEND() {
  return createChunk('IEND', Buffer.alloc(0));
}

// Create a PNG chunk with CRC
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

// CRC32 implementation
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

// CRC lookup table
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

// Build the PNG file
const png = Buffer.concat([
  signature,
  createIHDR(),
  createIDAT(),
  createIEND()
]);

// Save the PNG
const outputPath = path.join(__dirname, '..', 'resources', 'icons', 'tray-icon.png');
fs.writeFileSync(outputPath, png);

console.log('✓ Tray icon created successfully!');
console.log('  Path:', outputPath);
console.log('  Size:', png.length, 'bytes');
console.log('  Dimensions:', WIDTH + 'x' + HEIGHT);
