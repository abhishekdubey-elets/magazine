import { Suspense } from "react";
import { ReferenceStudio } from "@/components/reference-studio/ReferenceStudio";

export default function ReferenceStudioPage() {
  return (
    <Suspense fallback={null}>
      <ReferenceStudio />
    </Suspense>
  );
}
