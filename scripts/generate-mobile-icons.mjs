import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// CRC32 table for valid PNG chunk checksums
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePngRgba(width, height, pixels) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0; // filter None
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function distToRoundedBox(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function renderHeliumIcon(size, { transparentBg = false, roundMask = false, iconScale = 1 } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const bgR = 200;
  const bgG = 80;
  const bgB = 40; // #C85028 terracotta

  const s = size * iconScale;
  const cx = size / 2;
  const cy = size / 2;
  const stroke = Math.max(1.2, s * 0.068);
  const aa = 1.0;

  // Envelope proportions matching HeliumLogo.tsx (viewBox 0..28)
  const halfW = s * 0.34;
  const halfH = s * 0.27;
  const envCy = cy - s * 0.03;
  const envRadius = s * 0.095;

  const leftX = cx - halfW * 0.9;
  const rightX = cx + halfW * 0.9;
  const flapTopY = envCy - halfH * 0.68;
  const flapTipY = envCy + halfH * 0.14;
  const stemTopY = envCy + halfH;
  const stemBotY = envCy + halfH + s * 0.125;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      let bgAlpha = 1;
      if (transparentBg) {
        bgAlpha = 0;
      } else if (roundMask) {
        const dCircle = Math.hypot(px - cx, py - cy) - size * 0.48;
        bgAlpha = Math.max(0, Math.min(1, 0.5 - dCircle / aa));
      }

      // White envelope outline + flap V + rising balloon string
      const dBox = Math.abs(distToRoundedBox(px, py, cx, envCy, halfW, halfH, envRadius));
      const dFlapL = distToSegment(px, py, leftX, flapTopY, cx, flapTipY);
      const dFlapR = distToSegment(px, py, cx, flapTipY, rightX, flapTopY);
      const dStem = distToSegment(px, py, cx, stemTopY, cx, stemBotY);
      const dMin = Math.min(dBox, dFlapL, dFlapR, dStem);

      const fgAlpha = Math.max(0, Math.min(1, 0.5 + (stroke * 0.5 - dMin) / aa));

      const idx = (y * size + x) * 4;
      if (transparentBg) {
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
        pixels[idx + 3] = Math.round(fgAlpha * 255);
      } else {
        const r = Math.round(bgR * (1 - fgAlpha) + 255 * fgAlpha);
        const g = Math.round(bgG * (1 - fgAlpha) + 255 * fgAlpha);
        const b = Math.round(bgB * (1 - fgAlpha) + 255 * fgAlpha);
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
        pixels[idx + 3] = Math.round(bgAlpha * 255);
      }
    }
  }

  return encodePngRgba(size, size, pixels);
}

const androidDensities = [
  { folder: 'mipmap-mdpi', launcher: 48, foreground: 108 },
  { folder: 'mipmap-hdpi', launcher: 72, foreground: 162 },
  { folder: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
  { folder: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

for (const d of androidDensities) {
  const dir = path.resolve('android/app/src/main/res', d.folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), renderHeliumIcon(d.launcher));
  fs.writeFileSync(
    path.join(dir, 'ic_launcher_round.png'),
    renderHeliumIcon(d.launcher, { roundMask: true })
  );
  fs.writeFileSync(
    path.join(dir, 'ic_launcher_foreground.png'),
    renderHeliumIcon(d.foreground, { transparentBg: true, iconScale: 0.62 })
  );
}

const iosIconPath = path.resolve(
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
);
fs.writeFileSync(iosIconPath, renderHeliumIcon(1024));

console.log('Generated Helium Mail icons for Android mipmaps and iOS AppIcon (1024x1024).');
