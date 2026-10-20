// Shown instantly while a page loads, so navigation feels responsive
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-4 w-40 rounded bg-neutral-200" />
      <div className="mb-6 h-7 w-64 rounded bg-neutral-300" />
      <div className="space-y-3">
        <div className="h-24 rounded-xl bg-neutral-200" />
        <div className="h-24 rounded-xl bg-neutral-200" />
        <div className="h-24 rounded-xl bg-neutral-200" />
      </div>
    </div>
  );
}
