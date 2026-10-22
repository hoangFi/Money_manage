import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { SignJWT, generateKeyPair } from "jose";
import { verifyApprovalToken } from "../auth/tideJWT";
import { loadTideConfig } from "../auth/tidecloakConfig";
import { EVIDENCE_DIR, newId } from "./store";
import type { Approval, DB, Evidence, Fund, FundRole, Payout, Rejection, RuleChange, RuleChangeSpec, User } from "./types";

// The fund rules. Every mutation goes through here; a rule violation throws Blocked,
// which the API logs as a blocked attempt (the "Nhật ký" screen).
//
// Who holds which role in a fund comes from the caller's verified TideCloak token
// (client roles `fund:<fundId>:<role>`), never from this database, so editing the data store
// cannot promote anyone. Approvals count towards a quorum only with a Tide-signed token issued
// to that voter with the approver role (see approvalStatus below).
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

/**
 * The caller's role in a fund. Privileged roles come only from TideCloak (`actor.tideRoles`);
 * the database can only say someone is a donor, which needs no permission.
 */
export function actorRole(fund: Fund, actor: User): FundRole | undefined {
  const granted = (actor.tideRoles ?? [])
    .map((r) => r.split(":"))
    .find(([kind, fundId]) => kind === "fund" && fundId === fund.id)?.[2] as FundRole | undefined;
  if (granted) return granted;
  return roleIn(fund, actor.id) === "donor" ? "donor" : undefined;
}

/** TideCloak roles that make someone an approver of this fund. */
function approverRoles(fund: Fund): FundRole[] {
  return fund.kind === "group" ? ["treasurer", "member"] : ["council"];
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

export async function approvalStatus(db: DB, fund: Fund, a: Approval): Promise<"tide" | "invalid" | "unsigned"> {
  if (!a.tideToken) return "unsigned";
  const user = db.users.find((u) => u.id === a.userId);
  const roles = approverRoles(fund).map((r) => `fund:${fund.id}:${r}`);
  return user && (await verifyApprovalToken(a.tideToken, user.username, roles)) ? "tide" : "invalid";
}

async function countValid(db: DB, fund: Fund, votes: Approval[]) {
  let n = 0;
  for (const a of votes) if ((await approvalStatus(db, fund, a)) === "tide") n++;
  return n;
}

function requireApprover(fund: Fund, actor: User) {
  noAdmin(actor);
  const role = actorRole(fund, actor);
  if (!role || !approverRoles(fund).includes(role)) {
    block(
      fund.kind === "group"
        ? `Chỉ thành viên quỹ mới được duyệt (cần vai trò TideCloak fund:${fund.id}:member).`
        : `Chỉ hội đồng giám sát mới được duyệt (cần vai trò TideCloak fund:${fund.id}:council).`
    );
  }
}

function requireOpen(fund: Fund) {
  if (fund.closed) block(`"${fund.name}" đã đóng và hoàn tiền cho nhà hảo tâm. Không thể thao tác thêm.`);
}

function requireUnvoted(actor: User, approvals: Approval[], rejections: Rejection[] = []) {
  if (approvals.some((a) => a.userId === actor.id)) block("Bạn đã duyệt rồi.");
  if (rejections.some((r) => r.userId === actor.id)) block("Bạn đã từ chối rồi.");
}

/**
 * Records a rejection. Returns true once the quorum can no longer be reached, i.e. fewer
 * eligible voters remain than the quorum needs. A rejection always needs a reason.
 */
async function reject(db: DB, fund: Fund, rejections: Rejection[], eligible: number, actor: User, reason: string, tideToken?: string) {
  if (!reason?.trim()) block("Cần ghi lý do từ chối.");
  rejections.push({ userId: actor.id, at: now(), reason: reason.trim(), tideToken });
  return eligible - (await countValid(db, fund, rejections)) < fund.rules.quorum;
}

// --- Money in -----------------------------------------------------------

export function contribute(db: DB, actor: User, fundId: string, amount: number) {
  noAdmin(actor);
  const fund = getFund(db, fundId);
  requireOpen(fund);
  if (!Number.isInteger(amount) || amount <= 0) block("Số tiền không hợp lệ.");
  if (!roleIn(fund, actor.id)) fund.members.push({ userId: actor.id, role: "donor" });
  fund.balance += amount;
  const fromAccount = actor.account ?? `TK của ${actor.name}`;
  db.contributions.push({ id: newId("c"), fundId, userId: actor.id, amount, fromAccount, at: now() });
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
  requireOpen(fund);
  const role = actorRole(fund, actor);
  const amount = input.amount;
  if (!Number.isInteger(amount) || amount <= 0) block("Số tiền không hợp lệ.");
  if (!input.reason?.trim()) block("Cần ghi lý do chi.");

  if (fund.kind === "group") {
    // Any member may propose; the quorum of the other members decides.
    if (role !== "treasurer" && role !== "member") block("Chỉ thành viên quỹ mới được tạo lệnh chi.");
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
    rejections: [],
    status: "pending",
    evidence: [],
    evidenceStatus: "none",
    evidenceApprovals: [],
    evidenceRejections: [],
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
  await dropForgedVote(db, fund, payout, actor);
  requireUnvoted(actor, payout.approvals, (payout.rejections ??= []));

  payout.approvals.push({ userId: actor.id, at: now(), tideToken });
  const valid = await countValid(db, fund, payout.approvals);
  if (valid < fund.rules.quorum) {
    return `Đã duyệt (${valid}/${fund.rules.quorum}).`;
  }
  if (fund.kind === "charity" && fund.rules.largeAmount && payout.amount > fund.rules.largeAmount && !payout.recipientConfirmedAt) {
    payout.status = "awaiting_recipient";
    return `Đủ ${fund.rules.quorum} người duyệt. Khoản lớn: chờ người nhận xác nhận.`;
  }
  return execute(db, fund, payout);
}

/** Removes a vote recorded under the actor's name whose Tide signature does not verify. */
async function dropForgedVote(db: DB, fund: Fund, payout: Payout, actor: User) {
  const mine = payout.approvals.find((a) => a.userId === actor.id);
  if (mine && (await approvalStatus(db, fund, mine)) !== "tide") {
    payout.approvals = payout.approvals.filter((a) => a !== mine);
  }
}

/**
 * Demo only: someone with access to our server or database writes an approval in a council
 * member's name, with a token they signed themselves. It is stored, shown, and never counted,
 * because only the realm key (in TideCloak: Tide's ORK network) can sign a valid token.
 */
export async function forgeApproval(db: DB, payoutId: string) {
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  if (payout.status !== "pending") block("Lệnh chi này không còn chờ duyệt.");
  const voted = new Set([...payout.approvals, ...(payout.rejections ?? [])].map((v) => v.userId));
  const victimId = approversOf(fund).find((id) => id !== payout.proposerId && !voted.has(id)) ?? block("Không còn ai để mạo danh.");
  const victim = db.users.find((u) => u.id === victimId)!;
  const config = loadTideConfig();
  const { privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const forged = await new SignJWT({
    azp: config.resource,
    preferred_username: victim.username,
    resource_access: { [config.resource]: { roles: approverRoles(fund).map((r) => `fund:${fund.id}:${r}`) } },
  })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuer(`${config["auth-server-url"]}/realms/${config.realm}`)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  payout.approvals.push({ userId: victim.id, at: now(), tideToken: forged });
  const valid = await countValid(db, fund, payout.approvals);
  return `Đã giả lập: chèn lượt duyệt mạo danh ${victim.name} thẳng vào cơ sở dữ liệu. Chữ ký Tide không hợp lệ nên không được tính (vẫn ${valid}/${fund.rules.quorum}).`;
}

export async function rejectPayout(db: DB, actor: User, payoutId: string, reason: string, tideToken?: string) {
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  requireApprover(fund, actor);
  if (payout.status !== "pending") block("Lệnh chi này không còn chờ duyệt.");
  if (payout.proposerId === actor.id) block("Người tạo lệnh chi không bỏ phiếu cho lệnh của mình.");
  requireUnvoted(actor, payout.approvals, (payout.rejections ??= []));
  // The proposer cannot vote, so they are not counted among the voters who could still approve.
  const eligible = approversOf(fund).filter((id) => id !== payout.proposerId).length;
  if (await reject(db, fund, payout.rejections, eligible, actor, reason, tideToken)) {
    payout.status = "rejected";
    return `Lệnh chi ${payout.amount.toLocaleString("vi-VN")}đ bị từ chối: không còn đủ người để đạt ${fund.rules.quorum} lượt duyệt.`;
  }
  return `Đã từ chối (${payout.rejections.length} người). Lệnh chi vẫn chờ duyệt.`;
}

export async function confirmByRecipient(db: DB, actor: User, payoutId: string) {
  noAdmin(actor);
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  const recipient = fund.recipients.find((r) => r.id === payout.recipientId);
  if (!recipient || recipient.userId !== actor.id || actorRole(fund, actor) !== "recipient") {
    block("Chỉ người nhận của khoản chi này mới được xác nhận.");
  }
  if (payout.status === "executed") block("Khoản chi đã thực hiện.");
  payout.recipientConfirmedAt = now();
  if (payout.status === "awaiting_recipient") {
    if ((await countValid(db, fund, payout.approvals)) < fund.rules.quorum) {
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
  // Charity: the organiser or the proposer. Group fund: any member (whoever paid has the receipt).
  const role = actorRole(fund, actor);
  const mayUpload = payout.proposerId === actor.id || role === "organiser" || (fund.kind === "group" && (role === "treasurer" || role === "member"));
  if (!mayUpload) {
    block(fund.kind === "group" ? "Chỉ thành viên quỹ mới nộp minh chứng." : "Chỉ người đề xuất khoản chi mới nộp minh chứng.");
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
  payout.evidenceRejections = [];
  return `Đã nộp minh chứng. Mã băm SHA-256: ${hash.slice(0, 16)}…`;
}

export async function approveEvidence(db: DB, actor: User, payoutId: string, tideToken?: string) {
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  requireApprover(fund, actor);
  if (payout.evidenceStatus !== "submitted") block("Không có minh chứng nào chờ duyệt.");
  requireUnvoted(actor, payout.evidenceApprovals, (payout.evidenceRejections ??= []));
  payout.evidenceApprovals.push({ userId: actor.id, at: now(), tideToken });
  const valid = await countValid(db, fund, payout.evidenceApprovals);
  if (valid >= fund.rules.quorum) {
    payout.evidenceStatus = "approved";
    return fund.kind === "group" ? "Minh chứng đã được các thành viên duyệt." : "Minh chứng đã được hội đồng duyệt. Có thể đề xuất đợt chi tiếp theo.";
  }
  return `Đã duyệt minh chứng (${valid}/${fund.rules.quorum}).`;
}

export async function rejectEvidence(db: DB, actor: User, payoutId: string, reason: string, tideToken?: string) {
  const payout = getPayout(db, payoutId);
  const fund = getFund(db, payout.fundId);
  requireApprover(fund, actor);
  if (payout.evidenceStatus !== "submitted") block("Không có minh chứng nào chờ duyệt.");
  requireUnvoted(actor, payout.evidenceApprovals, (payout.evidenceRejections ??= []));
  if (await reject(db, fund, payout.evidenceRejections, approversOf(fund).length, actor, reason, tideToken)) {
    payout.evidenceStatus = "rejected";
    return fund.kind === "group"
      ? "Minh chứng bị các thành viên từ chối. Cần nộp minh chứng mới."
      : "Minh chứng bị hội đồng từ chối. Người kêu gọi phải nộp minh chứng mới; đợt chi sau vẫn bị khoá.";
  }
  return `Đã từ chối minh chứng (${payout.evidenceRejections.length} người).`;
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
  requireOpen(fund);
  const role = actorRole(fund, actor);
  if (!role || role === "donor" || role === "recipient") block("Bạn không có quyền đề xuất sửa luật quỹ này.");
  if (spec.type === "set_quorum") {
    const n = approversOf(fund).length;
    if (!Number.isInteger(spec.quorum) || spec.quorum < 1 || spec.quorum > n) block(`Quorum phải từ 1 đến ${n}.`);
  } else if (spec.type === "add_recipient") {
    if (fund.kind !== "charity") block("Quỹ nhóm không có danh sách người nhận.");
    if (!spec.name?.trim() || !spec.account?.trim()) block("Cần tên và tài khoản người nhận.");
  } else if (spec.type === "close_refund") {
    if (fund.kind !== "charity") block("Chỉ chiến dịch từ thiện mới đóng và hoàn tiền.");
    if (!spec.reason?.trim()) block("Cần ghi lý do đóng chiến dịch.");
    if (db.ruleChanges.some((c) => c.fundId === fund.id && c.spec.type === "close_refund" && c.status === "pending")) {
      block("Đã có một đề xuất đóng chiến dịch đang chờ duyệt.");
    }
  } else {
    block("Loại đề xuất không hợp lệ.");
  }
  const change: RuleChange = {
    id: newId("rc"),
    fundId,
    spec,
    proposerId: actor.id,
    createdAt: now(),
    approvals: [],
    rejections: [],
    status: "pending",
  };
  db.ruleChanges.push(change);
  const what = spec.type === "close_refund" ? "đóng chiến dịch và hoàn tiền" : "sửa luật";
  return `Đã đề xuất ${what}. Cần ${fund.rules.quorum} người duyệt theo luật hiện tại.`;
}

export async function approveRuleChange(db: DB, actor: User, changeId: string, tideToken?: string) {
  const change = db.ruleChanges.find((c) => c.id === changeId) ?? block("Không tìm thấy đề xuất.");
  const fund = getFund(db, change.fundId);
  requireApprover(fund, actor);
  if (change.status !== "pending") block("Đề xuất này không còn chờ duyệt.");
  requireUnvoted(actor, change.approvals, (change.rejections ??= []));
  change.approvals.push({ userId: actor.id, at: now(), tideToken });
  const valid = await countValid(db, fund, change.approvals);
  if (valid < fund.rules.quorum) {
    return `Đã duyệt (${valid}/${fund.rules.quorum}).`;
  }
  change.status = "applied";
  if (change.spec.type === "close_refund") {
    return closeAndRefund(db, fund, change.spec.reason, "council");
  }
  if (change.spec.type === "set_quorum") {
    fund.rules.quorum = change.spec.quorum;
    return `Luật mới có hiệu lực: cần ${change.spec.quorum} người duyệt.`;
  }
  fund.recipients.push({ id: newId("r"), name: change.spec.name.trim(), account: change.spec.account.trim() });
  return `Đã thêm người nhận "${change.spec.name}".`;
}

export async function rejectRuleChange(db: DB, actor: User, changeId: string, reason: string, tideToken?: string) {
  const change = db.ruleChanges.find((c) => c.id === changeId) ?? block("Không tìm thấy đề xuất.");
  const fund = getFund(db, change.fundId);
  requireApprover(fund, actor);
  if (change.status !== "pending") block("Đề xuất này không còn chờ duyệt.");
  requireUnvoted(actor, change.approvals, (change.rejections ??= []));
  if (await reject(db, fund, change.rejections, approversOf(fund).length, actor, reason, tideToken)) {
    change.status = "rejected";
    return "Đề xuất bị từ chối: không còn đủ người để đạt quorum.";
  }
  return `Đã từ chối đề xuất (${change.rejections.length} người).`;
}

// --- Closing a campaign and refunding donors ---------------------------------
// What is left goes back to donors in proportion to what each gave, and ONLY to the
// account each contribution came from. No input anywhere names a refund account, so
// nobody (organiser, council, admin) can redirect a refund.

function closeAndRefund(db: DB, fund: Fund, reason: string, how: "council" | "expired") {
  requireOpen(fund);
  const byDonor = new Map<string, { userId: string; account: string; contributed: number; amount: number }>();
  for (const c of db.contributions.filter((c) => c.fundId === fund.id)) {
    const key = `${c.userId}|${c.fromAccount}`;
    const row = byDonor.get(key) ?? { userId: c.userId, account: c.fromAccount, contributed: 0, amount: 0 };
    row.contributed += c.amount;
    byDonor.set(key, row);
  }
  const refunds = [...byDonor.values()];
  const raised = refunds.reduce((s, r) => s + r.contributed, 0);
  const left = Math.min(fund.balance, raised);
  if (left > 0) {
    // BigInt: balance × contribution can exceed Number's exact integer range.
    for (const r of refunds) r.amount = Number((BigInt(left) * BigInt(r.contributed)) / BigInt(raised));
    // Rounding leaves a few đồng; they go to the largest donor, so nothing stays behind.
    const largest = refunds.reduce((a, b) => (b.contributed > a.contributed ? b : a));
    largest.amount += left - refunds.reduce((s, r) => s + r.amount, 0);
  }

  const at = now();
  for (const r of refunds.filter((r) => r.amount > 0)) {
    const user = db.users.find((u) => u.id === r.userId);
    db.bank.push({ id: newId("t"), at, fromFund: fund.id, toName: user?.name ?? r.userId, toAccount: r.account, amount: r.amount, refund: true });
  }
  for (const p of db.payouts.filter((p) => p.fundId === fund.id && (p.status === "pending" || p.status === "awaiting_recipient"))) {
    p.status = "rejected";
  }
  fund.balance -= left;
  fund.closed = { at, reason, how, refunds };
  return `Đã đóng "${fund.name}" và hoàn ${left.toLocaleString("vi-VN")}đ cho ${refunds.length} nhà hảo tâm, theo tỷ lệ đã góp, về đúng tài khoản đã góp.`;
}

/** After the deadline anyone can trigger the refund: the rule decides, not a person. */
export function refundExpired(db: DB, actor: User, fundId: string) {
  noAdmin(actor);
  const fund = getFund(db, fundId);
  if (fund.kind !== "charity" || !fund.deadline) block("Quỹ này không có hạn chiến dịch.");
  if (new Date(fund.deadline) > new Date()) {
    block(`Chiến dịch chưa hết hạn (${new Date(fund.deadline).toLocaleDateString("vi-VN")}). Muốn đóng sớm phải được hội đồng duyệt.`);
  }
  return closeAndRefund(db, fund, "Hết hạn chiến dịch", "expired");
}

/** Never allowed: refunds go back to the account each contribution came from. */
export function refundTo(db: DB, actor: User, fundId: string, toAccount: string): never {
  const fund = getFund(db, fundId);
  block(
    `Không ai được chuyển tiền hoàn của "${fund.name}" về ${toAccount || "tài khoản khác"}. ` +
      `Tiền hoàn chỉ trả về đúng tài khoản mà từng nhà hảo tâm đã dùng để góp.`
  );
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
