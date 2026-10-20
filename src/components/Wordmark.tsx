/* eslint-disable @next/next/no-img-element */

// Plover Security logo with the "Time" product name. The logo sits on black,
// so on light pages it is shown inside a black panel.
export function Wordmark({ inverted = false, large = false }: { inverted?: boolean; large?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${inverted ? "" : "rounded-xl bg-black px-5 py-4"}`}>
      <img src="/plover-logo.png" alt="Plover Security" width={600} height={249} className={large ? "h-16 w-auto" : "h-9 w-auto"} />
      <span className={`border-l border-white/25 pl-3 font-semibold tracking-tight text-white ${large ? "text-2xl" : "text-base"}`}>Time</span>
    </div>
  );
}
