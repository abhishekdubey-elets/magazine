import type { ProductionStage } from "./types";

export const STAGES: { id: ProductionStage; label: string }[] = [
  { id: "planning", label: "Planning" },
  { id: "content-collection", label: "Content" },
  { id: "layout", label: "Layout" },
  { id: "review", label: "Review" },
  { id: "print-ready", label: "Print-ready" },
  { id: "published", label: "Published" },
];

export function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
