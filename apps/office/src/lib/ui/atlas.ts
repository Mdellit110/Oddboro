// Shared access to the atlas for HTML-side art (portraits, avatars), so the
// card and the dock draw the same pixels the floor does.
type Frame = { frame: { x: number; y: number; w: number; h: number } };
type AtlasData = { frames: Record<string, Frame> };

let pending: Promise<{ image: HTMLImageElement; data: AtlasData }> | undefined;

export function atlas() {
  pending ??= Promise.all([
    fetch('/atlas/atlas.json').then((r) => r.json() as Promise<AtlasData>),
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = '/atlas/atlas.png';
    })
  ]).then(([data, image]) => ({ data, image }));
  return pending;
}

/** Draw one atlas frame into a canvas at a whole-number scale. Returns false if the frame is missing. */
export async function paint(
  canvas: HTMLCanvasElement,
  key: string,
  scale: number,
  crop?: { x: number; y: number; w: number; h: number }
): Promise<boolean> {
  const { image, data } = await atlas();
  const f = data.frames[key]?.frame;
  if (!f) return false;
  const src = crop ? { x: f.x + crop.x, y: f.y + crop.y, w: crop.w, h: crop.h } : f;
  canvas.width = src.w * scale;
  canvas.height = src.h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height);
  return true;
}

const images = new Map<string, Promise<HTMLImageElement>>();

/** Draw an image URL into a canvas at a whole-number scale. Returns false if it fails to load. */
export async function paintImage(
  canvas: HTMLCanvasElement,
  src: string,
  scale: number,
  crop?: { x: number; y: number; w: number; h: number }
): Promise<boolean> {
  let pending = images.get(src);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    images.set(src, pending);
  }
  const image = await pending.catch(() => undefined);
  if (!image) return false;
  const r = crop ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
  canvas.width = r.w * scale;
  canvas.height = r.h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return true;
}
