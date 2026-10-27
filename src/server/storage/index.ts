import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { env } from "../config";
import * as s3 from "./s3";

/**
 * File storage for the workspace: S3 in production (required for InDesign
 * builds — Adobe fetches inputs from pre-signed URLs), or a local folder for
 * development. Same key layout either way (see `s3.ts`).
 */

export interface FileInfo {
  size: number;
  etag: string;
  contentType?: string;
}

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

const local = () => path.resolve(env.storage.localDir);
const localPath = (k: string) => {
  const p = path.resolve(local(), k);
  if (!p.startsWith(local() + path.sep)) throw new Error("Invalid storage key");
  return p;
};
export const isS3 = () => env.storage.driver === "s3";

/* Local driver: uploads go to /api/storage/local with an HMAC-signed, expiring token. */
const sign = (k: string, exp: number) => createHmac("sha256", env.auth.secret || "dev").update(`${k}\n${exp}`).digest("base64url");
export function verifyLocalToken(k: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(k, exp));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function put(k: string, body: Uint8Array | string, contentType: string) {
  if (isS3()) return s3.put(k, body, contentType);
  const p = localPath(k);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

export async function getBytes(k: string): Promise<Uint8Array | null> {
  if (isS3()) return s3.getBytes(k);
  try {
    return new Uint8Array(await readFile(localPath(k)));
  } catch {
    return null;
  }
}

export async function head(k: string): Promise<FileInfo | null> {
  if (isS3()) return s3.head(k);
  try {
    const st = await stat(localPath(k));
    return { size: st.size, etag: `${st.size}-${st.mtimeMs}` };
  } catch {
    return null;
  }
}

export async function remove(k: string) {
  if (isS3()) return s3.del(k);
  await rm(localPath(k), { force: true });
}

export async function list(folder: string): Promise<{ key: string; size: number; etag: string }[]> {
  if (isS3()) return s3.list(folder);
  const out: { key: string; size: number; etag: string }[] = [];
  const walk = async (rel: string) => {
    let entries: import("node:fs").Dirent[] = [];
    try {
      entries = await readdir(localPath(rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const k = `${rel.replace(/\/$/, "")}/${e.name}`;
      if (e.isDirectory()) await walk(k);
      else {
        const st = await stat(localPath(k));
        out.push({ key: k, size: st.size, etag: `${st.size}-${st.mtimeMs}` });
      }
    }
  };
  await walk(folder);
  return out;
}

/** Where the browser uploads a file directly. */
export async function uploadTarget(k: string, contentType: string, origin: string): Promise<UploadTarget> {
  if (isS3()) return { url: await s3.signedPut(k, contentType), method: "PUT", headers: { "content-type": contentType } };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const u = new URL("/api/storage/local", origin);
  u.searchParams.set("key", k);
  u.searchParams.set("exp", String(exp));
  u.searchParams.set("sig", sign(k, exp));
  return { url: u.toString(), method: "PUT", headers: { "content-type": contentType } };
}

/** Time-limited download link (S3 only; local files are streamed by the routes). */
export async function downloadUrl(k: string, seconds = 3600): Promise<string | null> {
  return isS3() ? s3.signedGet(k, seconds) : null;
}

/** Copy a file from a URL (e.g. Adobe's temporary output storage) into storage, streaming. */
export async function copyFromUrl(url: string, k: string, contentType: string): Promise<number> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (isS3() && length > 0) {
    await s3.putStream(k, Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), length, contentType);
    return length;
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  await put(k, bytes, contentType);
  return bytes.length;
}
