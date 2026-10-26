import { Suspense } from "react";
import { CreateLikeThis } from "@/components/create/CreateLikeThis";

export default function CreatePage() {
  return (
    <Suspense fallback={null}>
      <CreateLikeThis />
    </Suspense>
  );
}
