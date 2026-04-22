export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 rounded bg-muted animate-pulse" />
      <div className="h-4 w-96 rounded bg-muted animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-lg border bg-muted/30 animate-pulse"
          />
        ))}
      </div>
      <div className="rounded-lg border p-4 space-y-3">
        <div className="h-5 w-32 rounded bg-muted animate-pulse" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-muted/40 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
