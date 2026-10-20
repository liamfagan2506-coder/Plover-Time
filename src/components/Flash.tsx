export function Flash({ params }: { params: { error?: string; ok?: string } }) {
  if (params.error) return <p className="mb-4 rounded-lg border border-bad/20 bg-red-50 px-4 py-2.5 text-sm text-bad">{params.error}</p>;
  if (params.ok) return <p className="mb-4 rounded-lg border border-ok/20 bg-green-50 px-4 py-2.5 text-sm text-ok">{params.ok}</p>;
  return null;
}

export type PageParams = Promise<Record<string, string | undefined>>;
