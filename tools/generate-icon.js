/**
 * Generate Voice Runner Icon — pure Node.js, no dependencies!
 * 
 * Creates a 256x256 PNG icon with the runner character design.
 * Run: node tools/generate-icon.js
 * Output: assets/icon.png
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 256;
const pixels = Buffer.alloc(SIZE * SIZE * 4, 0); // RGBA buffer

// Helper: set pixel at (x, y) with RGBA
function setPixel(x, y, r, g, b, a = 255) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || ix >= SIZE || iy < 0 || iy >= SIZE) return;
  const idx = (iy * SIZE + ix) * 4;
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = a;
}

// Helper: draw filled circle
function fillCircle(cx, cy, radius, r, g, b, a = 255) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(x, y, r, g, b, a);
      }
    }
  }
}

// Helper: draw filled rectangle
function fillRect(x, y, w, h, r, g, b, a = 255) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      setPixel(px, py, r, g, b, a);
    }
  }
}

// Helper: draw rotated rectangle (for limbs)
function fillRotatedRect(cx, cy, w, h, angle, r, g, b, a = 255) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfW = w / 2;
  const halfH = h / 2;
  
  for (let dy = -halfH; dy <= halfH; dy++) {
    for (let dx = -halfW; dx <= halfW; dx++) {
      // Rotate point
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      setPixel(cx + rx, cy + ry, r, g, b, a);
    }
  }
}

// Helper: draw line
function drawLine(x1, y1, x2, y2, r, g, b, a = 255, width = 1) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.5) return;
  
  for (let i = 0; i <= dist; i++) {
    const t = i / dist;
    const px = Math.round(x1 + dx * t);
    const py = Math.round(y1 + dy * t);
    for (let wy = -Math.floor(width / 2); wy <= Math.floor(width / 2); wy++) {
      for (let wx = -Math.floor(width / 2); wx <= Math.floor(width / 2); wx++) {
        setPixel(px + wx, py + wy, r, g, b, a);
      }
    }
  }
}

// ===== DRAW THE ICON =====
console.log('🎨 Generating Voice Runner icon...');

const cx = SIZE / 2;
const groundY = SIZE * 0.72;

// 1. Background glow
for (let r = 0; r < 130; r++) {
  const alpha = Math.max(0, 15 - r * 0.1);
  if (alpha < 0.5) continue;
  fillCircle(cx, groundY - 10, r, 100, 200, 255, alpha);
}

// 2. Ground glow line
for (let x = 30; x < SIZE - 30; x++) {
  for (let dy = -6; dy <= 8; dy++) {
    const alpha = Math.max(0, 60 - Math.abs(dy) * 8);
    if (alpha < 2) continue;
    setPixel(x, groundY + dy, 100, 200, 255, alpha);
  }
}

// 3. Ground line (solid)
drawLine(30, groundY, SIZE - 30, groundY, 100, 200, 255, 180, 3);

// 4. Speed lines behind runner
for (let i = 0; i < 6; i++) {
  const ly = groundY - 30 + Math.sin(i * 1.2) * 25;
  const lx1 = cx - 40 - i * 30;
  const lx2 = lx1 - 25;
  const alpha = 60 - i * 8;
  drawLine(lx1, ly, lx2, ly - 5, 100, 200, 255, Math.max(10, alpha), 2);
  // Second set of speed lines slightly offset
  const ly2 = groundY - 10 + Math.sin(i * 1.5 + 1) * 20;
  const lx3 = cx - 50 - i * 25;
  drawLine(lx3, ly2, lx3 - 20, ly2 + 3, 150, 220, 255, Math.max(5, alpha - 20), 1);
}

// 5. Character — BODY (torso)
const bodyTop = groundY - 85;
const bodyBottom = groundY - 40;
const bodyLeft = cx - 18;
const bodyRight = cx + 18;

for (let y = bodyTop; y <= bodyBottom; y++) {
  for (let x = bodyLeft; x <= bodyRight; x++) {
    const t = (y - bodyTop) / (bodyBottom - bodyTop);
    const r = Math.round(138 - t * 30);
    const g = Math.round(212 - t * 30);
    const b = Math.round(255 - t * 30);
    setPixel(x, y, r, g, b, 255);
  }
}

// Body center line
fillRect(cx - 3, bodyTop + 5, 6, 20, 100, 200, 255, 100);

// 6. Character — HEAD
const headY = bodyTop - 20;
const headR = 24;

for (let y = headY - headR; y <= headY + headR; y++) {
  for (let x = cx - headR; x <= cx + headR; x++) {
    const dx = x - cx;
    const dy = y - headY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= headR) {
      const t = dist / headR;
      const r = Math.round(255 - t * 80);
      const g = Math.round(232 - t * 50);
      const b = Math.round(255 - t * 40);
      setPixel(x, y, r, g, b, 255);
    }
  }
}

// Visor (eyes)
fillRect(cx - 12, headY - 5, 24, 6, 100, 200, 255, 180);
fillRect(cx - 9, headY - 4, 18, 3, 255, 255, 255, 230);

// 7. Character — LEFT ARM (running pose, swung back)
fillRotatedRect(cx - 32, bodyTop + 15, 10, 30, -0.4, 138, 212, 255, 255);
// Hand
fillRotatedRect(cx - 34, bodyTop + 35, 10, 8, -0.2, 100, 200, 255, 255);

// 8. Character — RIGHT ARM (running pose, forward)
fillRotatedRect(cx + 30, bodyTop + 12, 10, 30, 0.35, 138, 212, 255, 255);
// Hand
fillRotatedRect(cx + 32, bodyTop + 32, 10, 8, 0.2, 100, 200, 255, 255);

// 9. Character — LEFT LEG (forward, running)
fillRotatedRect(cx - 14, bodyBottom + 15, 12, 35, 0.3, 122, 192, 238, 255);
// Shoe
fillRotatedRect(cx - 16, bodyBottom + 42, 16, 10, 0.2, 90, 176, 221, 255);

// 10. Character — RIGHT LEG (back, running)
fillRotatedRect(cx + 12, bodyBottom + 15, 12, 35, -0.25, 122, 192, 238, 255);
// Shoe
fillRotatedRect(cx + 14, bodyBottom + 42, 16, 10, -0.15, 90, 176, 221, 255);

// 11. Character glow effect
for (let y = bodyTop - 10; y <= bodyBottom + 50; y++) {
  for (let x = bodyLeft - 10; x <= bodyRight + 10; x++) {
    const px = pixels[(y * SIZE + x) * 4];
    const py = pixels[(y * SIZE + x) * 4 + 1];
    const pb = pixels[(y * SIZE + x) * 4 + 2];
    const pa = pixels[(y * SIZE + x) * 4 + 3];
    if (pa > 0 && px < 230) {
      // Enhance glow at edges
      const isEdge = x === bodyLeft - 10 || x === bodyRight + 10 || 
                     y === bodyTop - 10 || y === bodyBottom + 50;
      if (!isEdge) continue;
    }
  }
}

// 12. "VR" text (simple)
const textY = 22;
// Draw "V"
drawLine(cx - 40, textY + 30, cx - 20, textY, 255, 255, 255, 200, 3);
drawLine(cx - 20, textY, cx - 0, textY + 30, 255, 255, 255, 200, 3);
// Draw "R"
drawLine(cx + 10, textY + 30, cx + 10, textY, 255, 255, 255, 200, 3);
drawLine(cx + 10, textY, cx + 35, textY, 255, 255, 255, 200, 3);
drawLine(cx + 35, textY, cx + 35, textY + 15, 255, 255, 255, 200, 3);
drawLine(cx + 10, textY + 15, cx + 35, textY + 15, 255, 255, 255, 200, 3);
drawLine(cx + 35, textY + 15, cx + 45, textY + 30, 255, 255, 255, 200, 3);

// 13. Bottom text - small decorative line
drawLine(cx - 50, groundY + 28, cx + 50, groundY + 28, 100, 200, 255, 60, 1);

// ===== PNG ENCODER (pure Node.js, no deps!) =====
function createPNG(width, height, pixelData) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);
  
  // IDAT chunk — raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixelData[srcIdx];       // R
      rawData[dstIdx + 1] = pixelData[srcIdx + 1]; // G
      rawData[dstIdx + 2] = pixelData[srcIdx + 2]; // B
      rawData[dstIdx + 3] = pixelData[srcIdx + 3]; // A
    }
  }
  
  // Compress with zlib
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);
  
  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ===== SAVE PNG =====
console.log('📦 Encoding PNG...');
const pngBuffer = createPNG(SIZE, SIZE, pixels);

const outputPath = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, pngBuffer);

console.log(`✅ Icon saved: ${outputPath}`);
console.log(`📏 Size: ${(pngBuffer.length / 1024).toFixed(1)} KB`);
console.log(`🖼️  Dimensions: ${SIZE}x${SIZE}px`);
