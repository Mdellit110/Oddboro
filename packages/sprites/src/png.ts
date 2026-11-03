// Minimal RGBA image buffer and PNG encoder. No dependencies, so the compiler
// and the room renderer run on plain Node.
import { deflateSync } from 'node:zlib';

export type Image = { width: number; height: number; data: Uint8Array };

export function createImage(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Source-over blend of one RGBA pixel into the image. */
export function blendPixel(img: Image, x: number, y: number, rgba: readonly number[]): void {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  const sa = rgba[3] / 255;
  if (sa === 0) return;
  const da = img.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  for (let c = 0; c < 3; c++) {
    const v = (rgba[c] * sa + img.data[i + c] * da * (1 - sa)) / oa;
    img.data[i + c] = Math.round(v);
  }
  img.data[i + 3] = Math.round(oa * 255);
}

/** Draw `src` onto `dst` at (dx, dy), optionally mirrored horizontally. */
export function drawImage(dst: Image, src: Image, dx: number, dy: number, flipX = false): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const sx = flipX ? src.width - 1 - x : x;
      const i = (y * src.width + sx) * 4;
      const a = src.data[i + 3];
      if (a === 0) continue;
      blendPixel(dst, dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], a]);
    }
  }
}

/**
 * Copy a frame's edge pixels one pixel out into the gutter around it. When the
 * camera sits between whole pixels, a tile's edge can sample just past its
 * frame; with the gutter empty that shows as a see-through line between tiles.
 */
export function extrude(img: Image, x: number, y: number, w: number, h: number): void {
  const copy = (fx: number, fy: number, tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= img.width || ty >= img.height) return;
    const f = (fy * img.width + fx) * 4;
    img.data.copyWithin((ty * img.width + tx) * 4, f, f + 4);
  };
  for (let i = 0; i < w; i++) {
    copy(x + i, y, x + i, y - 1);
    copy(x + i, y + h - 1, x + i, y + h);
  }
  for (let j = -1; j <= h; j++) {
    const fy = Math.min(y + h - 1, Math.max(y, y + j));
    copy(x, fy, x - 1, y + j);
    copy(x + w - 1, fy, x + w, y + j);
  }
}

/** Nearest-neighbour upscale, for previews a person or an agent can read. */
export function scaleImage(src: Image, factor: number): Image {
  const out = createImage(src.width * factor, src.height * factor);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const si = (Math.floor(y / factor) * src.width + Math.floor(x / factor)) * 4;
      const di = (y * out.width + x) * 4;
      out.data.set(src.data.subarray(si, si + 4), di);
    }
  }
  return out;
}

/** Fill with a two-tone checkerboard so transparent pixels are visible. */
export function checkerboard(width: number, height: number, cell = 4): Image {
  const img = createImage(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 ? 58 : 46;
      img.data.set([v, v, v + 6, 255], (y * width + x) * 4);
    }
  }
  return img;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function encodePng(img: Image): Uint8Array {
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, img.width);
  hv.setUint32(4, img.height);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const stride = img.width * 4;
  const raw = new Uint8Array((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(img.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array())
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}
