/**
 * XtoGIF - Codificador de GIF animado sin dependencias externas
 * Formato GIF89a con paleta global adaptativa (Median Cut) y compresion LZW
 */
"use strict";

// ── Cuantizacion de color (Median Cut) ──────────────────────────────────────────────

function buildPalette(frames, maxColors) {
  const STEP = 4; // equilibrio entre fidelidad y rendimiento
  const samples = [];
  for (const frame of frames) {
    const d = frame.data;
    for (let i = 0; i < d.length; i += 4 * STEP) {
      if (d[i + 3] < 128) continue;
      samples.push([d[i], d[i + 1], d[i + 2]]);
    }
  }
  if (samples.length === 0) {
    return Array.from({ length: maxColors }, () => [0, 0, 0]);
  }
  const palette = medianCut(samples, maxColors);
  while (palette.length < maxColors) palette.push([0, 0, 0]);
  return palette;
}

function medianCut(pixels, maxColors) {
  let buckets = [pixels];
  while (buckets.length < maxColors) {
    let splitAt = -1;
    let maxSpread = -1;
    for (let i = 0; i < buckets.length; i++) {
      const s = colorSpread(buckets[i]);
      if (s > maxSpread) { maxSpread = s; splitAt = i; }
    }
    if (maxSpread <= 0 || buckets[splitAt].length < 2) break;
    const [a, b] = splitBucket(buckets[splitAt]);
    if (!a.length || !b.length) break;
    buckets.splice(splitAt, 1, a, b);
  }
  return buckets.map(avgColor);
}

function colorSpread(pixels) {
  if (pixels.length < 2) return 0;
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const [r, g, b] of pixels) {
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }
  return Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
}

function splitBucket(pixels) {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const [r, g, b] of pixels) {
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }
  const rR = rMax - rMin, gR = gMax - gMin, bR = bMax - bMin;
  const ch = (rR >= gR && rR >= bR) ? 0 : (gR >= bR ? 1 : 2);
  const sorted = pixels.slice().sort((a, bb) => a[ch] - bb[ch]);
  const mid = sorted.length >> 1;
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

function avgColor(pixels) {
  if (!pixels.length) return [0, 0, 0];
  let r = 0, g = 0, b = 0;
  for (const [pr, pg, pb] of pixels) { r += pr; g += pg; b += pb; }
  const n = pixels.length;
  return [r / n | 0, g / n | 0, b / n | 0];
}

// ── Mapeo de pixeles a indices de paleta ─────────────────────────────────────────────

function mapFrameToIndices(frame, palette) {
  const d = frame.data;
  const n = d.length >> 2;
  const out = new Uint8Array(n);
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = nearestIdx(r, g, b, palette);
      cache.set(key, idx);
    }
    out[i] = idx;
  }
  return out;
}

function nearestIdx(r, g, b, palette) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) { bestD = d; best = i; if (d === 0) break; }
  }
  return best;
}

// ── LZW para GIF ────────────────────────────────────────────────────────────────────

function gifLzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  const dict = new Map();

  const reset = () => {
    dict.clear();
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  };

  const bytes = [];
  let buf = 0, bits = 0;
  const emit = (code) => {
    buf |= code << bits;
    bits += codeSize;
    while (bits >= 8) { bytes.push(buf & 0xFF); buf >>>= 8; bits -= 8; }
  };

  emit(clearCode);
  let prefix = -1;
  for (let i = 0; i < indices.length; i++) {
    const pix = indices[i];
    if (prefix < 0) { prefix = pix; continue; }
    const key = prefix * 256 + pix;
    if (dict.has(key)) {
      prefix = dict.get(key);
    } else {
      emit(prefix);
      if (nextCode < 4096) {
        dict.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        emit(clearCode);
        reset();
      }
      prefix = pix;
    }
  }
  if (prefix >= 0) emit(prefix);
  emit(endCode);
  if (bits > 0) bytes.push(buf & 0xFF);
  return new Uint8Array(bytes);
}

// ── Escritura binaria GIF89a ─────────────────────────────────────────────────────────

function w16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }

/**
 * Codifica un GIF animado.
 * @param {ImageData[]} frames - Frames del video
 * @param {number} width  - Ancho final
 * @param {number} height - Alto final
 * @param {number} delayMs - Retraso entre frames en milisegundos
 * @returns {Uint8Array} Bytes del GIF
 */
function encodeAnimatedGif(frames, width, height, delayMs) {
  const delayCs = Math.max(2, Math.round(delayMs / 10));

  const palette = buildPalette(frames, 256);
  while (palette.length < 256) palette.push([0, 0, 0]);

  const out = [];
  const push = (...args) => { for (const a of args) { if (Array.isArray(a)) out.push(...a); else out.push(a); } };

  // Header GIF89a
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);

  // Logical Screen Descriptor
  push(...w16(width), ...w16(height));
  push(0xF7, 0x00, 0x00); // tabla global de colores 256, fondo=0, aspecto=0

  // Global Color Table
  for (const [r, g, b] of palette) push(r, g, b);

  // Netscape Application Extension → loop infinito
  push(0x21, 0xFF, 0x0B);
  push(78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48); // "NETSCAPE2.0"
  push(0x03, 0x01, 0x00, 0x00, 0x00);

  // Frames
  for (const frame of frames) {
    const indices = mapFrameToIndices(frame, palette);
    const lzwData = gifLzwEncode(indices, 8);

    // Graphic Control Extension
    push(0x21, 0xF9, 0x04);
    push(0x04); // disposal: restore to background
    push(...w16(delayCs));
    push(0x00, 0x00);

    // Image Descriptor
    push(0x2C);
    push(...w16(0), ...w16(0));
    push(...w16(width), ...w16(height));
    push(0x00);

    // Image Data
    push(0x08); // LZW min code size = 8
    let offset = 0;
    while (offset < lzwData.length) {
      const len = Math.min(255, lzwData.length - offset);
      push(len);
      for (let i = 0; i < len; i++) push(lzwData[offset + i]);
      offset += len;
    }
    push(0x00);
  }

  push(0x3B); // Trailer

  return new Uint8Array(out);
}

// Export al contexto global (offscreen document / service worker)
(typeof globalThis !== "undefined" ? globalThis : self).XtoGIFEncoder = { encodeAnimatedGif };
