import { DEMO_AUTH, withActor } from "@/lib/actor";
import * as engine from "@/lib/fund/engine";
import { loadDB, newId, saveDB } from "@/lib/fund/store";
import type { DB, User } from "@/lib/fund/types";

// Single entry point for every fund mutation. The engine enforces the rules; this route
// records each attempt, allowed or blocked, in the audit log.
type Body = Record<string, any>;

async function run(db: DB, actor: User, body: Body, file?: File, tideToken?: string): Promise<string> {
  switch (body.action) {
    case "contribute":
      return engine.contribute(db, actor, body.fundId, Number(body.amount));
    case "withdraw":
      return engine.directWithdraw(db, actor, body.fundId, Number(body.amount), body.toAccount);
    case "propose_payout":
      return engine.proposePayout(db, actor, { ...body, amount: Number(body.amount) } as any);
    case "approve_payout":
      return engine.approvePayout(db, actor, body.payoutId, tideToken);
    case "confirm_receipt":
      return engine.confirmByRecipient(db, actor, body.payoutId);
    case "submit_evidence": {
      if (!file) throw new engine.Blocked("Cần đính kèm file minh chứng.");
      const data = Buffer.from(await file.arrayBuffer());
      return engine.submitEvidence(db, actor, body.payoutId, { name: file.name, data }, body.kind ?? "other", body.note ?? "");
    }
    case "approve_evidence":
      return engine.approveEvidence(db, actor, body.payoutId, tideToken);
    case "propose_rule":
      return engine.proposeRuleChange(db, actor, body.fundId, body.spec);
    case "approve_rule":
      return engine.approveRuleChange(db, actor, body.changeId, tideToken);
    case "tamper_evidence":
      if (!DEMO_AUTH) throw new engine.Blocked("Chỉ có trong chế độ demo.");
      return engine.tamperEvidence(db, body.payoutId);
    default:
      throw new engine.Blocked("Hành động không hợp lệ.");
  }
}

export const POST = withActor(async (req, actor, tideToken) => {
  let body: Body;
  let file: File | undefined;
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    const f = form.get("file");
    file = f instanceof File ? f : undefined;
  } else {
    body = await req.json();
  }

  const db = loadDB();
  const fundId =
    body.fundId ??
    db.payouts.find((p) => p.id === body.payoutId)?.fundId ??
    db.ruleChanges.find((c) => c.id === body.changeId)?.fundId;

  try {
    const message = await run(db, actor, body, file, tideToken);
    db.log.push({ id: newId("l"), at: new Date().toISOString(), actorId: actor.id, fundId, action: body.action, outcome: "ok", detail: message });
    saveDB(db);
    return Response.json({ ok: true, message });
  } catch (err) {
    if (!(err instanceof engine.Blocked)) throw err;
    // Reload so a half-applied mutation is never saved, then record the blocked attempt.
    const clean = loadDB();
    clean.log.push({ id: newId("l"), at: new Date().toISOString(), actorId: actor.id, fundId, action: body.action, outcome: "blocked", detail: err.message });
    saveDB(clean);
    return Response.json({ ok: false, blocked: true, message: err.message }, { status: 403 });
  }
});
