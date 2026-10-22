import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { EVIDENCE_DIR, loadDB } from "@/lib/fund/store";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
};

// Serves an evidence file publicly. Lookup is by evidence id, never by a client-supplied path.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = loadDB().payouts.flatMap((p) => p.evidence).find((x) => x.id === id);
  const path = e && join(EVIDENCE_DIR, e.storedAs);
  if (!e || !path || !existsSync(path)) return new Response("Not found", { status: 404 });
  const ext = e.storedAs.split(".").pop()?.toLowerCase() ?? "";
  return new Response(readFileSync(path), {
    headers: {
      "Content-Type": TYPES[ext] ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${e.storedAs}"`,
    },
  });
}
