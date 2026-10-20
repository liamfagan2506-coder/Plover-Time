import { redirect } from "next/navigation";

export function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

export function optStr(form: FormData, key: string): string | null {
  return str(form, key) || null;
}

export function num(form: FormData, key: string, fallback = 0): number {
  const n = Number(form.get(key));
  return Number.isFinite(n) ? n : fallback;
}

// Redirect back to a page with a message shown by <Flash>
export function back(path: string, msg: { error?: string; ok?: string }): never {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.delete("error");
  params.delete("ok");
  if (msg.error) params.set("error", msg.error);
  if (msg.ok) params.set("ok", msg.ok);
  redirect(`${base}?${params.toString()}`);
}
