import { Suspense } from "react";
import { LayoutStudio } from "@/components/studio/LayoutStudio";

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <LayoutStudio />
    </Suspense>
  );
}
