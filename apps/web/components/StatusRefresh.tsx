"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function StatusRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return children;
}
