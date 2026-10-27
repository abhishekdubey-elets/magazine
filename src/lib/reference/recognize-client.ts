"use client";

import { recognizeOnServer } from "@/services/ai";
import type { ReferenceProfile } from "../types";
import type { AnalyzeProgress } from "./analyze";
import { batchRequests, buildRecognitionRequest, mergeRecognition, type RecognitionResult } from "./recognize";

/** Width (px) of the page renders sent to the AI — readable headlines and captions at low cost. */
export const AI_IMAGE_WIDTH = 420;

/**
 * Run the AI recognition pass for a measured profile in the browser: batches
 * of pages go to the server (which holds the provider key); answers are
 * merged into the profile. Images default to the stored previews/thumbnails
 * when the analysis renders are no longer available (re-run).
 */
export async function recognizeProfile(
  profile: ReferenceProfile,
  images: Record<number, string | undefined>,
  opts: { onProgress?: (p: AnalyzeProgress) => void; signal?: AbortSignal; numbers?: number[] } = {},
): Promise<ReferenceProfile> {
  const request = buildRecognitionRequest(profile, images, opts.numbers);
  if (!request.pages.length) throw new Error("No page images available for recognition — analyse the PDF again.");
  const batches = batchRequests(request);
  const results: RecognitionResult[] = [];
  let done = 0;
  for (const b of batches) {
    if (opts.signal?.aborted) throw new Error("Analysis cancelled.");
    opts.onProgress?.({ stage: `AI recognition: pages ${b.pages[0].number}–${b.pages.at(-1)!.number} (${done}/${request.pages.length})`, value: 100 });
    results.push(await recognizeOnServer(b));
    done += b.pages.length;
  }
  return mergeRecognition(profile, results);
}

/** Best images available for a stored profile (sharper previews first, else thumbnails). */
export function storedImages(profile: ReferenceProfile): Record<number, string | undefined> {
  return Object.fromEntries(profile.pages.map((p) => [p.number, profile.previews[p.number] ?? p.thumb]));
}
