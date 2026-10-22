import { withActor } from "@/lib/actor";
import { SIM_TIDE } from "@/lib/simtide/realm";
import { L } from "@/lib/lang";
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
    case "reject_payout":
      return engine.rejectPayout(db, actor, body.payoutId, body.reason, tideToken);
    case "reject_evidence":
      return engine.rejectEvidence(db, actor, body.payoutId, body.reason, tideToken);
    case "reject_rule":
      return engine.rejectRuleChange(db, actor, body.changeId, body.reason, tideToken);
    case "refund_expired":
      return engine.refundExpired(db, actor, body.fundId);
    case "refund_to":
      return engine.refundTo(db, actor, body.fundId, body.toAccount);
    case "confirm_receipt":
      return engine.confirmByRecipient(db, actor, body.payoutId);
    case "submit_evidence": {
      if (!file) throw new engine.Blocked(L("Cần đính kèm file minh chứng.", "Attach an evidence file."));
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
      if (!SIM_TIDE) throw new engine.Blocked(L("Chỉ có trong chế độ demo.", "Demo mode only."));
      return engine.tamperEvidence(db, body.payoutId);
    case "forge_approval":
      // Demo of an insider attack: only the platform admin may trigger it, and only in the demo.
      if (!SIM_TIDE || !actor.platformAdmin) throw new engine.Blocked(L("Chỉ admin nền tảng, trong chế độ demo.", "Platform admin only, in demo mode."));
      return engine.forgeApproval(db, body.payoutId);
    default:
      throw new engine.Blocked(L("Hành động không hợp lệ.", "Invalid action."));
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
