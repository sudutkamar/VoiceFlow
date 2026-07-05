#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SRC = path.join(__dirname, "..", "resources", "icons", "icon.png");
const OUT = path.join(__dirname, "..", "resources", "icons", "icon.ico");
const SIZES = [16, 32, 48, 64, 128, 256];

// ── CRC32 ───────────────────────────────────────────────────────────
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG decode ──────────────────────────────────────────────────────
function parseChunks(buf) {
  let o = 8;
  const c = { IHDR: null, PLTE: null, tRNS: null, IDAT: [] };
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString("ascii", o + 4, o + 8);
    const data = buf.slice(o + 8, o + 8 + len);
    if (c[type] !== undefined) {
      if (Array.isArray(c[type])) c[type].push(data);
      else c[type] = data;
    }
    o += 12 + len;
  }
  return c;
}

function readIHDR(d) {
  return {
    w: d.readUInt32BE(0),
    h: d.readUInt32BE(4),
    depth: d[8],
    color: d[9],
    interlace: d[12],
  };
}

function parsePLTE(d) {
  const p = [];
  for (let i = 0; i < d.length; i += 3) p.push([d[i], d[i + 1], d[i + 2], 255]);
  return p;
}

function parseTRNS(d, ct) {
  if (ct === 3) {
    const a = [];
    for (let i = 0; i < d.length; i++) a[i] = d[i];
    return a;
  }
  if (ct === 0) return [d.readUInt16BE(0)];
  if (ct === 2) return [d.readUInt16BE(0), d.readUInt16BE(2), d.readUInt16BE(4)];
  return null;
}

function expandPixels(raw, ih, ct, depth, pl, tr) {
  const ppb = Math.max(1, 8 / depth);
  const bpl = Math.ceil((ih.w * (ct === 3 ? 8 : depth * (ct === 4 || ct === 6 ? 4 : 3))) / 8);
  const px = new Uint8Array(ih.w * ih.h * 4);

  for (let y = 0; y < ih.h; y++) {
    const row = raw.slice(y * bpl, y * bpl + bpl);
    let bit = 0;
    for (let x = 0; x < ih.w; x++) {
      let v;
      if (depth === 8) v = row[x];
      else if (depth === 4) v = (row[x >> 1] >> (4 - 4 * (x & 1))) & 0x0f;
      else if (depth === 2) v = (row[x >> 2] >> (6 - 2 * (x & 3))) & 0x03;
      else v = (row[x >> 3] >> (7 - (x & 7))) & 1;

      const o = (y * ih.w + x) * 4;
      if (ct === 3) {
        if (pl && v < pl.length) {
          px[o] = pl[v][0]; px[o + 1] = pl[v][1]; px[o + 2] = pl[v][2];
          px[o + 3] = tr && v < tr.length ? tr[v] : 255;
        }
      } else if (ct === 0) {
        px[o] = px[o + 1] = px[o + 2] = v; px[o + 3] = tr ? tr[0] : 255;
      } else if (ct === 2) {
        const i = v * 3;
        if (tr) { px[o] = tr[0]; px[o + 1] = tr[1]; px[o + 2] = tr[2]; px[o + 3] = tr[3] !== undefined ? tr[3] : 255; }
      } else if (ct === 4) {
        px[o] = px[o + 1] = px[o + 2] = row[2 * x]; px[o + 3] = row[2 * x + 1];
      } else if (ct === 6) {
        px[o] = row[4 * x]; px[o + 1] = row[4 * x + 1]; px[o + 2] = row[4 * x + 2]; px[o + 3] = row[4 * x + 3];
      }
    }
  }
  return px;
}

function defilter(raw, ih, bpp) {
  const stride = Math.ceil((ih.w * bpp * ih.depth) / 8);
  const out = new Uint8Array(ih.h * stride);
  const prev = new Uint8Array(stride);
  let ro = 0;

  for (let y = 0; y < ih.h; y++) {
    const f = raw[ro++];
    const row = raw.slice(ro, ro + stride);
    ro += stride;

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = prev[i];
      switch (f) {
        case 0: out[y * stride + i] = row[i]; break;
        case 1: out[y * stride + i] = (row[i] + a) & 0xff; break;
        case 2: out[y * stride + i] = (row[i] + b) & 0xff; break;
        case 3: out[y * stride + i] = (row[i] + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = row[i];
          const pa = a, pb = b, pc = i >= bpp ? prev[i - bpp] : 0;
          const pr = pa + pb - pc;
          const pa2 = Math.abs(pr - pa), pb2 = Math.abs(pr - pb), pc2 = Math.abs(pr - pc);
          out[y * stride + i] = (p + (pa2 <= pb2 && pa2 <= pc2 ? pa : pb2 <= pc2 ? pb : pc)) & 0xff;
          break;
        }
      }
    }
    for (let i = 0; i < stride; i++) prev[i] = out[y * stride + i];
  }
  return out;
}

function decodePng(buf) {
  const ch = parseChunks(buf);
  const ihdr = readIHDR(ch.IHDR);
  const ct = ihdr.color, d = ihdr.depth;

  let pl = null, tr = null;
  if (ch.PLTE) pl = parsePLTE(ch.PLTE);
  if (ch.tRNS) tr = parseTRNS(ch.tRNS, ct);

  const raw = zlib.inflateSync(Buffer.concat(ch.IDAT));
  const bpp = ct === 3 ? 1 : ct === 4 ? 2 : ct === 0 ? 1 : ct === 2 ? 3 : ct === 6 ? 4 : 1;

  let filtered;
  if (ihdr.interlace === 1) {
    // Adam7 interlacing not implemented - most icons are non-interlaced
    throw new Error("Interlaced PNGs are not supported");
  } else {
    filtered = defilter(raw, ihdr, bpp);
  }

  const pixels = expandPixels(filtered, ihdr, ct, d, pl, tr);
  return { w: ihdr.w, h: ihdr.h, pixels };
}

// ── Resize (bilinear) ───────────────────────────────────────────────
function resize(src, tw, th) {
  if (src.w === tw && src.h === th) return Buffer.from(src.pixels);
  const dx = src.w / tw, dy = src.h / th;
  const out = Buffer.alloc(tw * th * 4);

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(x * dx, src.w - 1.001);
      const sy = Math.min(y * dy, src.h - 1.001);
      const x0 = ~~sx, y0 = ~~sy;
      const x1 = Math.min(x0 + 1, src.w - 1), y1 = Math.min(y0 + 1, src.h - 1);
      const fx = sx - x0, fy = sy - y0;

      const a = (y0 * src.w + x0) * 4, b = (y0 * src.w + x1) * 4;
      const c = (y1 * src.w + x0) * 4, d = (y1 * src.w + x1) * 4;

      const o = (y * tw + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const v = src.pixels[a + ch] * (1 - fx) * (1 - fy)
          + src.pixels[b + ch] * fx * (1 - fy)
          + src.pixels[c + ch] * (1 - fx) * fy
          + src.pixels[d + ch] * fx * fy;
        out[o + ch] = Math.min(255, Math.max(0, Math.round(v)));
      }
    }
  }
  return out;
}

// ── Encode PNG ──────────────────────────────────────────────────────
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const tbd = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tbd));
  return Buffer.concat([len, tbd, crc]);
}

function makePNG(w, h, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = ihdr[11] = ihdr[12] = 0;

  const raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0); // filter none
    const row = y * w * 4;
    for (let x = 0; x < w * 4; x++) raw.push(pixels[row + x]);
  }

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(Buffer.from(raw))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Build ICO ───────────────────────────────────────────────────────
function buildICO(pngBuffers, sizes) {
  const n = pngBuffers.length;
  const entrySize = 16;
  const headerSize = 6 + n * entrySize;

  let dataOffset = headerSize;
  const entries = [];
  const imageBlocks = [];

  for (let i = 0; i < n; i++) {
    const png = pngBuffers[i];
    const sz = sizes[i];
    entries.push({
      width: sz >= 256 ? 0 : sz,
      height: sz >= 256 ? 0 : sz,
      colors: 0, reserved: 0, planes: 1, bitcount: 32,
      size: png.length, offset: dataOffset,
    });
    imageBlocks.push(png);
    dataOffset += png.length;
  }

  const ico = Buffer.alloc(dataOffset);
  ico.writeUInt16LE(0, 0); // reserved
  ico.writeUInt16LE(1, 2); // type: ICO
  ico.writeUInt16LE(n, 4); // count

  let off = 6;
  for (const e of entries) {
    ico[off] = e.width; ico[off + 1] = e.height;
    ico[off + 2] = e.colors; ico[off + 3] = e.reserved;
    ico.writeUInt16LE(e.planes, off + 4);
    ico.writeUInt16LE(e.bitcount, off + 6);
    ico.writeUInt32LE(e.size, off + 8);
    ico.writeUInt32LE(e.offset, off + 12);
    off += 16;
  }

  for (const block of imageBlocks) {
    block.copy(ico, off);
    off += block.length;
  }

  return ico;
}

// ── Main ────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(SRC)) { console.error(`Source not found: ${SRC}`); process.exit(1); }

  console.log(`Reading ${SRC}`);
  const srcBuf = fs.readFileSync(SRC);
  const img = decodePng(srcBuf);
  console.log(`Decoded PNG: ${img.w}x${img.h}, ${img.pixels.length} bytes RGBA`);

  const pngs = [];
  for (const sz of SIZES) {
    const px = resize(img, sz, sz);
    const png = makePNG(sz, sz, px);
    pngs.push(png);
    console.log(`  ${sz}x${sz} -> ${png.length} bytes PNG`);
  }

  const ico = buildICO(pngs, SIZES);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, ico);
  console.log(`\nSaved ${OUT} (${ico.length} bytes, ${SIZES.length} sizes)`);
}

main();
