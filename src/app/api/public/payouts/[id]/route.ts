import { approvalStatus, checkEvidence } from "@/lib/fund/engine";
import { loadDB } from "@/lib/fund/store";

// Public proof page data. No login required: anyone can audit where the money went.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = loadDB();
  const payout = db.payouts.find((p) => p.id === id);
  if (!payout) return Response.json({ error: "Không tìm thấy khoản chi." }, { status: 404 });
  const fund = db.funds.find((f) => f.id === payout.fundId)!;
  const name = (uid: string) => db.users.find((u) => u.id === uid)?.name ?? uid;

  return Response.json({
    fund: { id: fund.id, name: fund.name, kind: fund.kind, quorum: fund.rules.quorum },
    payout: {
      id: payout.id,
      amount: payout.amount,
      reason: payout.reason,
      status: payout.status,
      createdAt: payout.createdAt,
      executedAt: payout.executedAt,
      proposer: { id: payout.proposerId, name: name(payout.proposerId) },
      recipient: fund.recipients.find((r) => r.id === payout.recipientId) ?? { name: payout.payee },
      recipientConfirmedAt: payout.recipientConfirmedAt,
      approvals: await Promise.all(
        payout.approvals.map(async (a) => ({ name: name(a.userId), at: a.at, signature: await approvalStatus(db, a) }))
      ),
      evidenceStatus: payout.evidenceStatus,
      evidenceApprovals: payout.evidenceApprovals.map((a) => ({ name: name(a.userId), at: a.at })),
      evidence: payout.evidence.map((e) => ({ ...e, submittedBy: name(e.submittedBy), integrity: checkEvidence(e) })),
    },
    transfer: db.bank.find((t) => t.payoutId === payout.id) ?? null,
  });
}
