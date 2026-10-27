import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { OriginalImage } from "@/lib/types";

/**
 * Measures an uploaded original exactly as InDesign will receive it, and makes
 * a screen preview. The original itself is never modified or recompressed.
 */

export const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};
export const MAX_ORIGINAL_BYTES = 150 * 1024 * 1024;

/** Description of an embedded ICC profile (v2 `desc` or v4 `mluc`). */
export function iccDescription(icc: Buffer | undefined): string | undefined {
  if (!icc || icc.length < 132) return undefined;
  try {
    const count = icc.readUInt32BE(128);
    for (let i = 0; i < count && 132 + i * 12 + 12 <= icc.length; i++) {
      const at = 132 + i * 12;
      if (icc.toString("ascii", at, at + 4) !== "desc") continue;
      const off = icc.readUInt32BE(at + 4);
      const type = icc.toString("ascii", off, off + 4);
      if (type === "desc") {
        const len = icc.readUInt32BE(off + 8);
        return icc.toString("latin1", off + 12, off + 12 + len).replace(/\0+$/, "").trim() || undefined;
      }
      if (type === "mluc") {
        const recLen = icc.readUInt32BE(off + 12);
        if (!recLen) return undefined;
        const len = icc.readUInt32BE(off + 20);
        const start = off + icc.readUInt32BE(off + 24);
        const bytes = icc.subarray(start, start + len);
        let s = "";
        for (let j = 0; j + 1 < bytes.length; j += 2) s += String.fromCharCode(bytes.readUInt16BE(j));
        return s.replace(/\0+$/, "").trim() || undefined;
      }
    }
  } catch {
    /* malformed profile */
  }
  return undefined;
}

export async function inspectOriginal(bytes: Uint8Array, key: string, ext: string): Promise<{ original: OriginalImage; preview: Buffer; vector: boolean }> {
  const buf = Buffer.from(bytes);
  const vector = ext === "svg";
  const img = sharp(buf, { failOn: "error", limitInputPixels: 1_000_000_000 });
  const m = await img.metadata();
  if (!m.width || !m.height) throw new Error("The file could not be read as an image.");
  const original: OriginalImage = {
    key,
    ext,
    bytes: buf.length,
    format: m.format ?? ext,
    width: m.width,
    height: m.height,
    colorSpace: m.space ?? "unknown",
    channels: m.channels ?? 0,
    bitDepth: m.depth,
    iccProfile: iccDescription(m.icc),
    dpi: m.density ? Math.round(m.density) : undefined,
    orientation: m.orientation,
    hasAlpha: m.hasAlpha,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
  // Screen preview only: auto-rotated, sRGB, max 1600 px.
  const preview = await sharp(buf, { density: vector ? 144 : undefined, limitInputPixels: 1_000_000_000 })
    .rotate()
    .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .webp({ quality: 82 })
    .toBuffer();
  return { original, preview, vector };
}
