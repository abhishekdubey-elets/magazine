import { getSampleImageSrc, sampleArtworks } from "./artwork";
import type { ImageAsset } from "./types";

/** Sample artwork exposed as image assets (not persisted; generated locally). */
export const sampleImageAssets: ImageAsset[] = sampleArtworks.map((a) => ({
  id: a.id,
  name: a.name,
  source: "sample",
  width: a.width,
  height: a.height,
  vector: true,
  subject: a.subject,
  alt: a.alt,
  credit: a.credit,
  createdAt: "2026-05-01T00:00:00.000Z",
}));

const sampleIndex = new Map(sampleImageAssets.map((a) => [a.id, a]));

export function findImage(id: string | null | undefined, uploads: ImageAsset[]): ImageAsset | undefined {
  if (!id) return undefined;
  return sampleIndex.get(id) ?? uploads.find((u) => u.id === id);
}

export function imageSrc(asset: ImageAsset | undefined): string {
  if (!asset) return "";
  return asset.source === "sample" ? getSampleImageSrc(asset.id) : asset.src ?? "";
}

/** Effective resolution of an image placed in a frame (pixels per inch at print size). */
export function effectivePpi(asset: ImageAsset, frameW: number, frameH: number, fit: "cover" | "contain"): number {
  if (asset.vector) return Infinity;
  const frameAspect = frameW / frameH;
  const imgAspect = asset.width / asset.height;
  // Size of the image as placed, in mm.
  let placedW: number;
  if (fit === "cover") placedW = imgAspect > frameAspect ? frameH * imgAspect : frameW;
  else placedW = imgAspect > frameAspect ? frameW : frameH * imgAspect;
  return asset.width / (placedW / 25.4);
}

/**
 * Read a local file, downscale it if needed and return an ImageAsset with a
 * JPEG/PNG data URL suitable for localStorage persistence.
 */
export async function fileToAsset(file: File, compress: boolean, maxPx = 1800): Promise<ImageAsset> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG, WebP or SVG).");
  if (file.size > 15 * 1024 * 1024) throw new Error("Image is larger than 15 MB — please use a smaller file.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("The file could not be decoded as an image."));
    i.src = dataUrl;
  });
  let { naturalWidth: w, naturalHeight: h } = img;
  let src = dataUrl;
  if (compress && file.type !== "image/svg+xml" && (w > maxPx || h > maxPx || file.size > 600_000)) {
    const scale = Math.min(1, maxPx / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    src = canvas.toDataURL("image/jpeg", 0.84);
    w = canvas.width;
    h = canvas.height;
  }
  return {
    id: `img-up-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    source: "upload",
    src,
    width: w || 1200,
    height: h || 800,
    vector: file.type === "image/svg+xml",
    subject: w < h ? "portrait" : "scene",
    alt: file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "),
    credit: "Uploaded",
    createdAt: new Date().toISOString(),
  };
}

/** File name used for an image inside export packages. */
export function linkName(asset: ImageAsset) {
  if (asset.source === "sample") return `links/${asset.id}.svg`;
  const ext = asset.src?.startsWith("data:image/png") ? "png" : asset.src?.startsWith("data:image/svg") ? "svg" : asset.src?.startsWith("data:image/webp") ? "webp" : "jpg";
  return `links/${asset.id}.${ext}`;
}
