import { withActor } from "@/lib/actor";
import { approvalStatus } from "@/lib/fund/engine";
import { loadDB } from "@/lib/fund/store";
import type { Approval, DB, Fund } from "@/lib/fund/types";

// Approval tokens stay server-side; the client gets who voted, when, and whether the vote's
// Tide signature verifies (a forged vote is shown but marked, and never counted).
async function votes<T extends Approval>(db: DB, fund: Fund, list?: T[]) {
  return Promise.all(
    (list ?? []).map(async ({ tideToken, ...v }) => ({ ...v, signature: await approvalStatus(db, fund, { ...v, tideToken }) }))
  );
}

// Everything a signed-in user sees. Fund data is transparent to all participants by design.
export const GET = withActor(async (_req, actor) => {
  const db = loadDB();
  const fundOf = (id: string) => db.funds.find((f) => f.id === id)!;
  return Response.json({
    me: actor,
    users: db.users.map(({ id, name, username, platformAdmin }) => ({ id, name, username, platformAdmin })),
    funds: db.funds,
    payouts: await Promise.all(
      db.payouts.map(async (p) => {
        const fund = fundOf(p.fundId);
        return {
          ...p,
          approvals: await votes(db, fund, p.approvals),
          rejections: await votes(db, fund, p.rejections),
          evidenceApprovals: await votes(db, fund, p.evidenceApprovals),
          evidenceRejections: await votes(db, fund, p.evidenceRejections),
        };
      })
    ),
    ruleChanges: await Promise.all(
      db.ruleChanges.map(async (c) => ({
        ...c,
        approvals: await votes(db, fundOf(c.fundId), c.approvals),
        rejections: await votes(db, fundOf(c.fundId), c.rejections),
      }))
    ),
    contributions: db.contributions,
    bank: db.bank,
    log: db.log.slice(-300).reverse(),
  });
});
