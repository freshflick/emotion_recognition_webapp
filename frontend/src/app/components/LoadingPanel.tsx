import { Loader2 } from "lucide-react";

export function LoadingPanel({ title, description }: { title: string; description?: string }) {
  return (
    <div role="status" aria-live="polite" className="mb-6 flex min-h-32 flex-col items-center justify-center gap-4 border p-6 text-center sm:flex-row sm:justify-start sm:p-8 sm:text-left" style={{ borderColor: "var(--primary)", backgroundColor: "color-mix(in srgb, var(--primary) 10%, var(--background))", color: "var(--foreground)" }}>
      <Loader2 className="size-10 shrink-0 animate-spin motion-reduce:animate-none" style={{ color: "var(--primary)" }} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xl font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{title}</p>
        {description && <p className="mt-2 text-sm leading-relaxed" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>{description}</p>}
      </div>
    </div>
  );
}
