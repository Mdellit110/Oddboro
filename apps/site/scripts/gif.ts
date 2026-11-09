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
  return writeGif(frames.length, (i) => frames[i], false);
}

/**
 * The same for a long animation of a big picture, made one frame at a time:
 * `frame(i)` is called twice for each frame, once to count its colours and
 * once to write it, so only one frame is held at once. Each frame after the
 * first stores only what changed since the one before: the rectangle round
 * every changed pixel, with the unchanged ones in it see-through, so the
 * frame before shows through. One colour of the 256 is the see-through one.
 */
export function encodeGifChanges(count: number, frame: (i: number) => GifFrame): Uint8Array {
  return writeGif(count, frame, true);
}

function writeGif(count: number, frame: (i: number) => GifFrame, changes: boolean): Uint8Array {
  const { width, height } = frame(0).image;
  const counts = new Map<number, number>();
  for (let f = 0; f < count; f++) {
    const { image } = frame(f);
    if (image.width !== width || image.height !== height)
      throw new Error('Every GIF frame must be the same size');
    for (let p = 0; p < width * height; p++) {
      const rgb = rgbAt(image, p);
      counts.set(rgb, (counts.get(rgb) ?? 0) + 1);
    }
  }
  const { table: colours, index } = quantize(counts, changes ? 255 : 256);
  // The see-through colour comes after the table's own.
  const clear = colours.length;
  // The colour table holds a power of two entries, at least 4.
  let bits = 2;
  while (1 << bits < colours.length + (changes ? 1 : 0)) bits++;

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

  let before: Uint8Array | undefined;
  for (let f = 0; f < count; f++) {
    const { image, delay } = frame(f);
    const now = new Uint8Array(width * height);
    for (let p = 0; p < now.length; p++) now[p] = index.get(rgbAt(image, p))!;
    // The part of the picture this frame stores: all of it, or what changed.
    let [x0, y0, x1, y1] = [0, 0, width - 1, height - 1];
    if (changes && before) {
      [x0, y0, x1, y1] = [width, height, -1, -1];
      for (let p = 0; p < now.length; p++)
        if (now[p] !== before[p]) {
          const x = p % width;
          const y = (p - x) / width;
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
      // Nothing changed: one see-through pixel.
      if (x1 < 0) [x0, y0, x1, y1] = [0, 0, 0, 0];
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const pixels = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const p = (y0 + y) * width + x0 + x;
        pixels[y * w + x] = changes && before && now[p] === before[p] ? clear : now[p];
      }
    before = now;

    // Leave the frame in place under the next, with the see-through colour when there is one.
    bytes.push(0x21, 0xf9, 0x04, changes ? 0x05 : 0x04);
    word(delay);
    bytes.push(changes ? clear : 0, 0);
    bytes.push(0x2c);
    word(x0);
    word(y0);
    word(w);
    word(h);
    bytes.push(0);
    const data = lzw(pixels, bits);
    bytes.push(bits);
    for (let at = 0; at < data.length; at += 255) {
      const block = data.subarray(at, at + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}

const channels = (rgb: number) => [rgb >> 16, (rgb >> 8) & 0xff, rgb & 0xff];

/**
 * At most `most` colours for the table, and each colour's place in it. With
 * that many or fewer, every colour keeps itself. Otherwise median cut: split
 * the box with the most pixels along its widest channel at its median, until
 * there are `most`, then give each box its pixel-weighted mean.
 */
function quantize(
  counts: Map<number, number>,
  most: number
): {
  table: number[];
  index: Map<number, number>;
} {
  const all = [...counts.keys()];
  if (all.length <= most) return { table: all, index: new Map(all.map((c, i) => [c, i])) };
  const weight = (box: number[]) => box.reduce((n, c) => n + counts.get(c)!, 0);
  const boxes = [all];
  while (boxes.length < most) {
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
