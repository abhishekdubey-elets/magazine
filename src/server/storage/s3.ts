import "server-only";
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config";

/**
 * S3 storage for InDesign job inputs. Adobe downloads inputs from pre-signed
 * URLs on supported storage (AWS S3, Azure, GCS, Dropbox…), so manifests,
 * images and fonts are staged here. Outputs stay in Adobe's temporary storage.
 *
 * Layout under S3_PREFIX:
 *   fonts/                 licensed font files (OTF/TTF) used by every job
 *   assets/sample/         sample artwork (rendered on demand)
 *   assets/uploads/        images uploaded in the app
 *   jobs/<key>/manifest.json
 *   registry/script.json   registered build-script execution URL
 */

let client: S3Client | null = null;
function s3() {
  client ??= new S3Client({
    region: env.s3.region,
    credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
  });
  return client;
}

export const key = (k: string) => `${env.s3.prefix}/${k}`;

export async function put(k: string, body: Uint8Array | string, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: env.s3.bucket, Key: key(k), Body: body, ContentType: contentType }));
}

export async function exists(k: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: env.s3.bucket, Key: key(k) }));
    return true;
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 403) return false;
    throw e;
  }
}

export async function getText(k: string): Promise<string | null> {
  try {
    const res = await s3().send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key(k) }));
    return (await res.Body?.transformToString("utf-8")) ?? null;
  } catch (e) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404 || status === 403 || (e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

/** Object keys (relative to S3_PREFIX) under a folder. */
export async function list(folder: string): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const res = await s3().send(new ListObjectsV2Command({ Bucket: env.s3.bucket, Prefix: key(folder), ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key && !o.Key.endsWith("/")) out.push({ key: o.Key.slice(env.s3.prefix.length + 1), size: o.Size ?? 0 });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Pre-signed GET URL Adobe uses to download an input (default 2 hours). */
export async function signedGet(k: string, seconds = 7200) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: env.s3.bucket, Key: key(k) }), { expiresIn: seconds });
}
