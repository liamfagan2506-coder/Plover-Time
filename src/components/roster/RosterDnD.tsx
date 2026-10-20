"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveShift } from "@/actions/shifts";

// Wraps the roster grid. Shift chips carry data-shift-id; cells carry data-day plus
// data-emp (by staff) or data-site (by site). Dropping a chip on a cell moves the shift.
export function RosterDnD({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const over = useRef<HTMLElement | null>(null);

  const cellOf = (el: EventTarget | null) => (el as HTMLElement | null)?.closest?.("[data-day]") as HTMLElement | null;
  const highlight = (cell: HTMLElement | null) => {
    if (over.current && over.current !== cell) over.current.classList.remove("bg-neutral-100", "outline", "outline-2", "outline-ink");
    if (cell) cell.classList.add("bg-neutral-100", "outline", "outline-2", "outline-ink");
    over.current = cell;
  };

  return (
    <div
      className={pending ? "pointer-events-none opacity-60 transition-opacity" : ""}
      onDragStart={(e) => {
        const chip = (e.target as HTMLElement).closest?.("[data-shift-id]") as HTMLElement | null;
        if (!chip) return;
        e.dataTransfer.setData("application/x-plover-shift", chip.dataset.shiftId!);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        const cell = cellOf(e.target);
        if (!cell || !e.dataTransfer.types.includes("application/x-plover-shift")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (cell !== over.current) highlight(cell);
      }}
      onDragLeave={(e) => {
        if (!cellOf(e.relatedTarget)) highlight(null);
      }}
      onDrop={(e) => {
        const cell = cellOf(e.target);
        const id = e.dataTransfer.getData("application/x-plover-shift");
        highlight(null);
        if (!cell || !id) return;
        e.preventDefault();
        const { day, emp, site } = cell.dataset;
        start(async () => {
          const res = await moveShift({
            id,
            day: day!,
            employeeId: emp !== undefined ? emp : undefined,
            siteId: site,
          });
          if (res.error) alert(res.error);
          else router.refresh();
        });
      }}
      onDragEnd={() => highlight(null)}
    >
      {pending && <p className="mb-2 text-sm text-muted print:hidden">Moving shift…</p>}
      {children}
    </div>
  );
}
