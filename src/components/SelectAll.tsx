"use client";

import { useEffect, useRef } from "react";

// Header checkbox that ticks or clears every checkbox with the given name in the same form
export function SelectAll({ name }: { name: string }) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const sync = () => {
      const boxes = [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
      const ticked = boxes.filter((b) => b.checked).length;
      ref.current!.checked = ticked > 0 && ticked === boxes.length;
      ref.current!.indeterminate = ticked > 0 && ticked < boxes.length;
    };
    sync();
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
  }, [name]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all"
      className="h-4 w-4 accent-black"
      onChange={(e) => {
        for (const box of e.currentTarget.form?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? []) {
          box.checked = e.currentTarget.checked;
        }
      }}
    />
  );
}
