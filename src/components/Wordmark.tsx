export function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
          inverted ? "bg-white text-black" : "bg-black text-white"
        }`}
      >
        PT
      </span>
      <span className="leading-tight">
        <span className="block text-base font-semibold tracking-tight">Plover Time</span>
        <span className={`block text-[11px] uppercase tracking-widest ${inverted ? "text-neutral-400" : "text-muted"}`}>
          Plover Security
        </span>
      </span>
    </div>
  );
}
