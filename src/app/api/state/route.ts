import { withActor } from "@/lib/actor";
import { loadDB } from "@/lib/fund/store";
import type { Approval } from "@/lib/fund/types";

const stripToken = ({ tideToken, ...a }: Approval) => ({ ...a, tideSigned: !!tideToken });

// Everything a signed-in user sees. Fund data is transparent to all participants by design.
export const GET = withActor(async (_req, actor) => {
  const db = loadDB();
  return Response.json({
    me: actor,
    users: db.users.map(({ id, name, username, platformAdmin }) => ({ id, name, username, platformAdmin })),
    funds: db.funds,
    // Approval tokens stay server-side; the client only needs who approved and when.
    payouts: db.payouts.map((p) => ({ ...p, approvals: p.approvals.map(stripToken), evidenceApprovals: p.evidenceApprovals.map(stripToken) })),
    ruleChanges: db.ruleChanges.map((c) => ({ ...c, approvals: c.approvals.map(stripToken) })),
    contributions: db.contributions,
    bank: db.bank,
    log: db.log.slice(-100).reverse(),
  });
});
