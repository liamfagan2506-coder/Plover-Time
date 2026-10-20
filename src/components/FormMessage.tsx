import type { FormState } from "@/actions/auth";

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-bad">{state.error}</p>;
  if (state?.ok) return <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-ok">{state.ok}</p>;
  return null;
}
