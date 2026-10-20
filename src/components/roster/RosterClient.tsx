"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// On phones, open the roster in day view unless a view was chosen explicitly
export function AutoDayView() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    if (params.get("view") || window.innerWidth >= 768) return;
    const next = new URLSearchParams(params);
    next.set("view", "day");
    router.replace(`${path}?${next}`);
  }, [params, path, router]);
  return null;
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-secondary">
      Print / PDF
    </button>
  );
}
