"use client";

import type { ImageAsset } from "../types";
import { adoptServerItem } from "./engine";

/**
 * Server mode upload: the original goes straight to storage exactly as it is
 * (no browser resizing or recompression); the server measures it and returns
 * the library entry.
 */
export async function uploadOriginal(file: File, onProgress?: (fraction: number) => void): Promise<ImageAsset> {
  const type = file.type || (/\.tiff?$/i.test(file.name) ? "image/tiff" : "");
  const start = await fetch("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: file.name, contentType: type, size: file.size }),
  });
  const s = await start.json();
  if (!start.ok) throw new Error(s.error ?? `Upload refused (${start.status}).`);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(s.upload.method, s.upload.url);
    for (const [k, v] of Object.entries(s.upload.headers as Record<string, string>)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage refused the file (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed — check the connection (and the bucket's CORS settings)."));
    xhr.send(file);
  });

  const done = await fetch(`/api/assets/${s.id}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ext: s.ext, name: file.name }),
  });
  const d = await done.json();
  if (!done.ok) throw new Error(d.error ?? `The image could not be processed (${done.status}).`);
  adoptServerItem("uploads", d.asset, d.version);
  return d.asset as ImageAsset;
}

/** URL of the untouched original (server mode). */
export const originalUrl = (a: ImageAsset) => `/api/assets/${a.id}/original`;
