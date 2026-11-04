// Writes an animated GIF from opaque frames of the same size. Lit art holds
// more than GIF's 256 colours (the lamps' glow shades the palette), so the
// frames share one table made by median cut over every colour they use, and
// each colour becomes the mean of its group. No dithering: pixel art stays
// crisp.
// It loops forever; the page shows a still frame to anyone who asks for
// reduced motion.
import type { Image } from '@oddboro/sprites/png';

/** One frame and how long it shows, in hundredths of a second. */
export type GifFrame = { image: Image; delay: number };

const rgbAt = (img: Image, p: number) =>
  (img.data[p * 4] << 16) | (img.data[p * 4 + 1] << 8) | img.data[p * 4 + 2];

export function encodeGif(frames: GifFrame[]): Uint8Array {
  const { width, height } = frames[0].image;
  const counts = new Map<number, number>();
  for (const { image } of frames) {
    if (image.width !== width || image.height !== height)
      throw new Error('Every GIF frame must be the same size');
    for (let p = 0; p < width * height; p++) {
      const rgb = rgbAt(image, p);
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
    }
  }
  const { table: colours, index } = quantize(counts);
  const indexed = frames.map(({ image }) => {
    const out = new Uint8Array(width * height);
    for (let p = 0; p < out.length; p++) out[p] = index.get(rgbAt(image, p))!;
    return out;
  });
  // The colour table holds a power of two entries, at least 4.
  let bits = 2;
  while (1 << bits < colours.length) bits++;

  const bytes: number[] = [];
  const word = (n: number) => bytes.push(n & 0xff, (n >> 8) & 0xff);
  bytes.push(...Buffer.from('GIF89a'));
  word(width);
  word(height);
  bytes.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
  const table = new Uint8Array(3 << bits);
  colours.forEach((rgb, i) => table.set([rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff], i * 3));
  bytes.push(...table);
  // Loop forever.
  bytes.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0, 0, 0);

  frames.forEach(({ delay }, f) => {
    bytes.push(0x21, 0xf9, 0x04, 0x04);
    word(delay);
    bytes.push(0, 0);
    bytes.push(0x2c);
    word(0);
    word(0);
    word(width);
    word(height);
    bytes.push(0);
    const data = lzw(indexed[f], bits);
    bytes.push(bits);
    for (let at = 0; at < data.length; at += 255) {
      const block = data.subarray(at, at + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  });
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}

const channels = (rgb: number) => [rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff];

/**
 * At most 256 colours for the table, and each colour's place in it. With 256
 * or fewer, every colour keeps itself. Otherwise median cut: split the box
 * with the most pixels along its widest channel at its median, until there
 * are 256, then give each box its pixel-weighted mean.
 */
function quantize(counts: Map<number, number>): {
  table: number[];
  index: Map<number, number>;
} {
  const all = [...counts.keys()];
  if (all.length <= 256) return { table: all, index: new Map(all.map((c, i) => [c, i])) };
  const weight = (box: number[]) => box.reduce((n, c) => n + counts.get(c)!, 0);
  const boxes = [all];
  while (boxes.length < 256) {
    let at = -1;
    for (let i = 0; i < boxes.length; i++)
      if (boxes[i].length > 1 && (at < 0 || weight(boxes[i]) > weight(boxes[at]))) at = i;
    if (at < 0) break;
    const box = boxes[at];
    const spans = [0, 1, 2].map((ch) => {
      const v = box.map((c) => channels(c)[ch]);
      return Math.max(...v) - Math.min(...v);
    });
    const ch = spans.indexOf(Math.max(...spans));
    box.sort((a, b) => channels(a)[ch] - channels(b)[ch]);
    const half = weight(box) / 2;
    let seen = 0;
    let cut = 1;
    for (; cut < box.length - 1; cut++) {
      seen += counts.get(box[cut - 1])!;
      if (seen >= half) break;
    }
    boxes.splice(at, 1, box.slice(0, cut), box.slice(cut));
  }
  const table: number[] = [];
  const index = new Map<number, number>();
  boxes.forEach((box, i) => {
    const sum = [0, 0, 0];
    let n = 0;
    for (const c of box) {
      const w = counts.get(c)!;
      channels(c).forEach((v, ch) => (sum[ch] += v * w));
      n += w;
      index.set(c, i);
    }
    const [r, g, b] = sum.map((v) => Math.round(v / n));
    table.push((r << 16) | (g << 8) | b);
  });
  return { table, index };
}

/** GIF's variable-width LZW, codes packed least significant bit first. */
function lzw(pixels: Uint8Array, minBits: number): Uint8Array {
  const clear = 1 << minBits;
  const end = clear + 1;
  const out: number[] = [];
  let acc = 0;
  let accBits = 0;
  let size = minBits + 1;
  const emit = (code: number) => {
    acc |= code << accBits;
    accBits += size;
    while (accBits >= 8) {
      out.push(acc & 0xff);
      acc >>>= 8;
      accBits -= 8;
    }
  };
  let dict = new Map<number, number>();
  let next = end + 1;
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const k = pixels[i];
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      size = minBits + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(end);
  if (accBits > 0) out.push(acc & 0xff);
  return Uint8Array.from(out);
}
