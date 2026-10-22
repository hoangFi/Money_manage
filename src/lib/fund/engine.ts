import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { verifyApprovalToken } from "../auth/tideJWT";
import { EVIDENCE_DIR, newId } from "./store";
import type { Approval, DB, Evidence, Fund, FundRole, Payout, RuleChange, RuleChangeSpec, User } from "./types";

// The fund rules. Every mutation goes through here; a rule violation throws Blocked,
// which the API logs as a blocked attempt (the "Nhật ký" screen).
//
// Approvals count towards a quorum only with a Tide-signed token (see approvalStatus below).
// TODO(tide): move payout execution itself into a Forseti contract, so the ORK network signs
// the transfer and the bank verifies that signature, instead of this server executing it.

export class Blocked extends Error {}

const now = () => new Date().toISOString();

function block(reason: string): never {
  throw new Blocked(reason);
}

export function getFund(db: DB, fundId: string): Fund {
  return db.funds.find((f) => f.id === fundId) ?? block("Không tìm thấy quỹ.");
}

function getPayout(db: DB, payoutId: string): Payout {
  return db.payouts.find((p) => p.id === payoutId) ?? block("Không tìm thấy lệnh chi.");
}

export function roleIn(fund: Fund, userId: string): FundRole | undefined {
  return fund.members.find((m) => m.userId === userId)?.role;
}

export function approversOf(fund: Fund): string[] {
  const roles: FundRole[] = fund.kind === "group" ? ["treasurer", "member"] : ["council"];
  return fund.members.filter((m) => roles.includes(m.role)).map((m) => m.userId);
}

function noAdmin(actor: User) {
  if (actor.platformAdmin) {
    block("Admin nền tảng không có quyền gì với tiền hay luật của quỹ.");
  }
}

// --- Tide-signed approvals ---------------------------------------------------
// With Tide, an approval counts only if it carries a Tide-signed token issued to that approver.
// This server holds no Tide signing key, so an approval written straight into the data store
// (by an admin, the operator or an attacker) never counts towards the quorum.

const REQUIRE_TIDE_PROOF = process.env.DEMO_AUTH !== "1";

export async function approvalStatus(db: DB, a: Approval): Promise<"tide" | "invalid" | "unsigned"> {
  if (!a.tideToken) return "unsigned";
  const user = db.users.find((u) => u.id === a.userId);
  return user && (await verifyApprovalToken(a.tideToken, user.username)) ? "tide" : "invalid";
}

async function countValid(db: DB, approvals: Approval[]) {
  if (!REQUIRE_TIDE_PROOF) return approvals.length;
  let n = 0;
  for (const a of approvals) if ((await approvalStatus(db, a)) === "tide") n++;
  return n;
}

function requireApprover(fund: Fund, actor: User) {
  noAdmin(actor);
  if (!approversOf(fund).includes(actor.id)) {
    block(
      fund.kind === "group"
        ? "Chỉ thành viên quỹ mới được duyệt."
        : "Chỉ hội đồng giám sát mới được duyệt."
    );
  }
}

// --- Money in -----------------------------------------------------------

export function contribute(db: DB, actor: User, fundId: string, amount: number) {
  noAdmin(actor);
  const fund = getFund(db, fundId);
  if (!Number.isInteger(amount) || amount <= 0) block("Số tiền không hợp lệ.");
  if (!roleIn(fund, actor.id)) fund.members.push({ userId: actor.id, role: "donor" });
  fund.balance += amount;
  db.contributions.push({ id: newId("c"), fundId, userId: actor.id, amount, at: now() });
  return `Đã góp ${amount.toLocaleString("vi-VN")}đ vào "${fund.name}".`;
}

// --- Direct withdrawal: never allowed -------------------------------------

export function directWithdraw(db: DB, actor: User, fundId: string, amount: number, toAccount: string): never {
  const fund = getFund(db, fundId);
  block(
    `Không ai được rút thẳng ${amount.toLocaleString("vi-VN")}đ từ "${fund.name}" về ${toAccount || "tài khoản riêng"}. ` +
      `Mọi khoản chi phải qua lệnh chi và đủ ${fund.rules.quorum} người duyệt.`
  );
}

// --- Payouts --------------------------------------------------------------

export function proposePayout(
  db: DB,
  actor: User,
  input: { fundId: string; amount: number; reason: string; recipientId?: string; payee?: string; toAccount?: string }
) {
  noAdmin(actor);
  const fund = getFund(db, input.fundId);
  const role = roleIn(fund, actor.id);
  const amount = input.amount;
  if (!Number.isInteger(amount) || amount <= 0) block("Số tiền không hợp lệ.");
  if (!input.reason?.trim()) block("Cần ghi lý do chi.");

  if (fund.kind === "group") {
    if (role !== "treasurer") block("Chỉ thủ quỹ mới được tạo lệnh chi.");
  } else {
    if (role !== "organiser") block("Chỉ người kêu gọi mới được đề xuất giải ngân.");
    const recipient = fund.recipients.find((r) => r.id === input.recipientId);
    if (!recipient) {
      block(
        `Người nhận ${input.toAccount ? `"${input.toAccount}" ` : ""}không nằm trong danh sách đã đăng ký. ` +
          `Tiền từ thiện chỉ được chuyển cho: ${fund.recipients.map((r) => r.name).join(", ")}.`
      );
    }
    if (fund.rules.evidenceBeforeNext) {
      const missing = db.payouts.find(
        (p) => p.fundId === fund.id && p.status === "executed" && p.evidenceStatus !== "approved"
      );
      if (missing) {
        block(
          `Đợt chi trước ("${missing.reason}") chưa có minh chứng được hội đồng duyệt. ` +
            `Phải có minh chứng mới được chi tiếp.`
        );
      }
    }
  }
  if (amount > fund.balance) block("Số dư quỹ không đủ.");

  const payout: Payout = {
    id: newId("p"),
    fundId: fund.id,
    amount,
    reason: input.reason.trim(),
    recipientId: fund.kind === "charity" ? input.recipientId : undefined,
    payee: fund.kind === "group" ? input.payee?.trim() || "Không ghi" : undefined,
    proposerId: actor.id,
    createdAt: now(),
    approvals: [],
    status: "pending",
    evidence: [],
    evidenceStatus: "none",
    evidenceApprovals: [],
  };
  db.payouts.push(payout);
  return `Đã tạo lệnh chi ${amount.toLocaleString("vi-VN")}đ. Cần ${fund.rules.quorum} người duyệt.`;
}

export async function approvePayout(db: DB, actor: User, payoutId: string, tideToken?: string) {
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  requireApprover(fund, actor);
  if (payout.status !== "pending") block("Lệnh chi này không còn chờ duyệt.");
  if (payout.proposerId === actor.id) block("Người tạo lệnh chi không được tự duyệt lệnh của mình.");
  if (payout.approvals.some((a) => a.userId === actor.id)) block("Bạn đã duyệt lệnh này rồi.");

  payout.approvals.push({ userId: actor.id, at: now(), tideToken });
  const valid = await countValid(db, payout.approvals);
  if (valid < fund.rules.quorum) {
    return `Đã duyệt (${valid}/${fund.rules.quorum}).`;
  }
  if (fund.kind === "charity" && fund.rules.largeAmount && payout.amount > fund.rules.largeAmount && !payout.recipientConfirmedAt) {
    payout.status = "awaiting_recipient";
    return `Đủ ${fund.rules.quorum} người duyệt. Khoản lớn: chờ người nhận xác nhận.`;
  }
  return execute(db, fund, payout);
}

export async function confirmByRecipient(db: DB, actor: User, payoutId: string) {
  noAdmin(actor);
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  const recipient = fund.recipients.find((r) => r.id === payout.recipientId);
  if (!recipient || recipient.userId !== actor.id) block("Chỉ người nhận của khoản chi này mới được xác nhận.");
  if (payout.status === "executed") block("Khoản chi đã thực hiện.");
  payout.recipientConfirmedAt = now();
  if (payout.status === "awaiting_recipient") {
    if ((await countValid(db, payout.approvals)) < fund.rules.quorum) {
      block("Lệnh chi chưa đủ lượt duyệt có chữ ký Tide hợp lệ.");
    }
    return execute(db, fund, payout);
  }
  return "Người nhận đã xác nhận.";
}

function execute(db: DB, fund: Fund, payout: Payout) {
  if (payout.amount > fund.balance) block("Số dư quỹ không đủ.");
  const recipient = fund.recipients.find((r) => r.id === payout.recipientId);
  fund.balance -= payout.amount;
  payout.status = "executed";
  payout.executedAt = now();
  // Mock bank transfer
  db.bank.push({
    id: newId("t"),
    at: payout.executedAt,
    fromFund: fund.id,
    toName: recipient?.name ?? payout.payee ?? "",
    toAccount: recipient?.account ?? "",
    amount: payout.amount,
    payoutId: payout.id,
  });
  return `Đủ ${fund.rules.quorum} người duyệt. Đã chuyển ${payout.amount.toLocaleString("vi-VN")}đ cho ${
    recipient?.name ?? payout.payee
  }.`;
}

// --- Evidence -------------------------------------------------------------

export function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export function submitEvidence(
  db: DB,
  actor: User,
  payoutId: string,
  file: { name: string; data: Buffer },
  kind: Evidence["kind"],
  note: string
) {
  noAdmin(actor);
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  if (roleIn(fund, actor.id) !== "organiser" && payout.proposerId !== actor.id) {
    block("Chỉ người đề xuất khoản chi mới nộp minh chứng.");
  }
  if (payout.status !== "executed") block("Chỉ nộp minh chứng sau khi khoản chi đã thực hiện.");

  const hash = sha256(file.data);
  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-80);
  const storedAs = `${hash.slice(0, 16)}-${safeName}`;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  // Append-only: an existing file is never overwritten.
  if (!existsSync(join(EVIDENCE_DIR, storedAs))) writeFileSync(join(EVIDENCE_DIR, storedAs), file.data);

  payout.evidence.push({
    id: newId("e"),
    kind,
    note: note.trim(),
    fileName: file.name,
    storedAs,
    sha256: hash,
    submittedAt: now(),
    submittedBy: actor.id,
  });
  // New evidence needs a fresh review.
  payout.evidenceStatus = "submitted";
  payout.evidenceApprovals = [];
  return `Đã nộp minh chứng. Mã băm SHA-256: ${hash.slice(0, 16)}…`;
}

export async function approveEvidence(db: DB, actor: User, payoutId: string, tideToken?: string) {
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  requireApprover(fund, actor);
  if (payout.evidenceStatus !== "submitted") block("Không có minh chứng nào chờ duyệt.");
  if (payout.evidenceApprovals.some((a) => a.userId === actor.id)) block("Bạn đã duyệt minh chứng này rồi.");
  payout.evidenceApprovals.push({ userId: actor.id, at: now(), tideToken });
  const valid = await countValid(db, payout.evidenceApprovals);
  if (valid >= fund.rules.quorum) {
    payout.evidenceStatus = "approved";
    return "Minh chứng đã được hội đồng duyệt. Có thể đề xuất đợt chi tiếp theo.";
  }
  return `Đã duyệt minh chứng (${valid}/${fund.rules.quorum}).`;
}

/** Recomputes each evidence file's hash and compares it with the hash recorded at submission. */
export function checkEvidence(e: Evidence): "ok" | "tampered" | "missing" {
  const path = join(EVIDENCE_DIR, e.storedAs);
  if (!existsSync(path)) return "missing";
  return sha256(readFileSync(path)) === e.sha256 ? "ok" : "tampered";
}

/** Demo only: simulates someone with server access editing an evidence file on disk. */
export function tamperEvidence(db: DB, payoutId: string) {
  const payout = getPayout(db, payoutId);
  const e = payout.evidence[0] ?? block("Khoản chi chưa có minh chứng.");
  writeFileSync(join(EVIDENCE_DIR, e.storedAs), Buffer.from("hoa don da bi sua"));
  return "Đã giả lập việc sửa file minh chứng trên máy chủ.";
}

// --- Rule changes ---------------------------------------------------------

export function proposeRuleChange(db: DB, actor: User, fundId: string, spec: RuleChangeSpec) {
  const fund = getFund(db, fundId);
  noAdmin(actor);
  const role = roleIn(fund, actor.id);
  if (!role || role === "donor" || role === "recipient") block("Bạn không có quyền đề xuất sửa luật quỹ này.");
  if (spec.type === "set_quorum") {
    const n = approversOf(fund).length;
    if (!Number.isInteger(spec.quorum) || spec.quorum < 1 || spec.quorum > n) block(`Quorum phải từ 1 đến ${n}.`);
  } else if (spec.type === "add_recipient") {
    if (fund.kind !== "charity") block("Quỹ nhóm không có danh sách người nhận.");
    if (!spec.name?.trim() || !spec.account?.trim()) block("Cần tên và tài khoản người nhận.");
  }
  const change: RuleChange = {
    id: newId("rc"),
    fundId,
    spec,
    proposerId: actor.id,
    createdAt: now(),
    approvals: [],
    status: "pending",
  };
  db.ruleChanges.push(change);
  return `Đã đề xuất sửa luật. Cần ${fund.rules.quorum} người duyệt theo luật hiện tại.`;
}

export async function approveRuleChange(db: DB, actor: User, changeId: string, tideToken?: string) {
  const change = db.ruleChanges.find((c) => c.id === changeId) ?? block("Không tìm thấy đề xuất.");
  const fund = getFund(db, change.fundId);
  requireApprover(fund, actor);
  if (change.status !== "pending") block("Đề xuất này đã được áp dụng.");
  if (change.approvals.some((a) => a.userId === actor.id)) block("Bạn đã duyệt đề xuất này rồi.");
  change.approvals.push({ userId: actor.id, at: now(), tideToken });
  const valid = await countValid(db, change.approvals);
  if (valid < fund.rules.quorum) {
    return `Đã duyệt (${valid}/${fund.rules.quorum}).`;
  }
  change.status = "applied";
  if (change.spec.type === "set_quorum") {
    fund.rules.quorum = change.spec.quorum;
    return `Luật mới có hiệu lực: cần ${change.spec.quorum} người duyệt.`;
  }
  fund.recipients.push({ id: newId("r"), name: change.spec.name.trim(), account: change.spec.account.trim() });
  return `Đã thêm người nhận "${change.spec.name}".`;
}

// --- Reputation -----------------------------------------------------------

export function organiserProfile(db: DB, userId: string) {
  const user = db.users.find((u) => u.id === userId);
  const funds = db.funds.filter((f) => f.members.some((m) => m.userId === userId && m.role === "organiser"));
  const fundIds = new Set(funds.map((f) => f.id));
  const executed = db.payouts.filter((p) => fundIds.has(p.fundId) && p.status === "executed");
  const withEvidence = executed.filter((p) => p.evidenceStatus === "approved");
  const tampered = executed.flatMap((p) => p.evidence).filter((e) => checkEvidence(e) !== "ok").length;
  return {
    user: user ? { id: user.id, name: user.name } : null,
    campaigns: funds.map((f) => ({ id: f.id, name: f.name, goal: f.goal, balance: f.balance })),
    disbursed: executed.reduce((s, p) => s + p.amount, 0),
    payouts: executed.length,
    payoutsWithEvidence: withEvidence.length,
    tamperedEvidence: tampered,
    history: executed.map((p) => ({ id: p.id, reason: p.reason, amount: p.amount, executedAt: p.executedAt, evidenceStatus: p.evidenceStatus })),
  };
}
