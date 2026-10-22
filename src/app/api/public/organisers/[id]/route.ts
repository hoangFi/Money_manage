import { organiserProfile } from "@/lib/fund/engine";
import { loadDB } from "@/lib/fund/store";

// Public reputation profile, derived only from quorum-approved payouts and evidence.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = organiserProfile(loadDB(), id);
  if (!profile.user) return Response.json({ error: "Không tìm thấy người kêu gọi." }, { status: 404 });
  return Response.json(profile);
}
