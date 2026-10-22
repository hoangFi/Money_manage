import { withActor } from "@/lib/actor";
import { loadDB } from "@/lib/fund/store";
import type { Approval } from "@/lib/fund/types";

const stripToken = <T extends Approval>({ tideToken, ...a }: T) => ({ ...a, tideSigned: !!tideToken });
const strip = <T extends Approval>(list?: T[]) => (list ?? []).map(stripToken);

// Everything a signed-in user sees. Fund data is transparent to all participants by design.
export const GET = withActor(async (_req, actor) => {
  const db = loadDB();
  return Response.json({
    me: actor,
    users: db.users.map(({ id, name, username, platformAdmin }) => ({ id, name, username, platformAdmin })),
    funds: db.funds,
    // Approval tokens stay server-side; the client only needs who approved and when.
    payouts: db.payouts.map((p) => ({
      ...p,
      approvals: strip(p.approvals),
      rejections: strip(p.rejections),
      evidenceApprovals: strip(p.evidenceApprovals),
      evidenceRejections: strip(p.evidenceRejections),
    })),
    ruleChanges: db.ruleChanges.map((c) => ({ ...c, approvals: strip(c.approvals), rejections: strip(c.rejections) })),
    contributions: db.contributions,
    bank: db.bank,
    log: db.log.slice(-300).reverse(),
  });
});
