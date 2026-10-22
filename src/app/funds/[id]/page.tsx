"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppState, fundText, Icon, LogTable, Mark, nameOf, NoticeBar, RequireLogin, ROLE_LABEL, roleOf, useAppState, vnd, when } from "@/components/app";
import { useLang, useT, type Text } from "@/lib/i18n";
import type { Approval, Fund, Payout, Rejection, RuleChange } from "@/lib/fund/types";

type Act = (body: Record<string, unknown> | FormData) => Promise<boolean>;

const STATUS: Record<Payout["status"], Text> = {
  pending: ["Chờ duyệt", "Pending"],
  awaiting_recipient: ["Chờ người nhận xác nhận", "Awaiting recipient"],
  executed: ["Đã chuyển tiền", "Paid"],
  rejected: ["Bị từ chối", "Rejected"],
};
const EVIDENCE: Record<Payout["evidenceStatus"], Text> = {
  none: ["Chưa có minh chứng", "No evidence yet"],
  submitted: ["Minh chứng chờ hội đồng duyệt", "Evidence awaiting council review"],
  approved: ["Minh chứng đã duyệt", "Evidence approved"],
  rejected: ["Minh chứng bị từ chối, cần nộp lại", "Evidence rejected, resubmit"],
};
const EVIDENCE_GROUP: Partial<Record<Payout["evidenceStatus"], Text>> = {
  submitted: ["Minh chứng chờ thành viên duyệt", "Evidence awaiting members' review"],
};

/** Asks for the reason a rejection must carry; null if the user cancels. */
function askReason(question: string) {
  const reason = window.prompt(question);
  return reason?.trim() ? reason.trim() : null;
}

/** Who approved and who rejected, with each rejection's reason. */
function Votes({ state, approvals, rejections, quorum }: { state: AppState; approvals: Approval[]; rejections?: Rejection[]; quorum: number }) {
  const t = useT();
  // Only votes whose Tide signature verifies count; a forged one is shown but not counted.
  const valid = approvals.filter((a) => a.signature === "tide");
  const forged = approvals.filter((a) => a.signature !== "tide");
  return (
    <div className="votes">
      <span>
        <Mark kind="ok" /> {t("Duyệt", "Approved")} {valid.length}/{quorum}
        {valid.length > 0 && <>: {valid.map((a) => nameOf(state, a.userId)).join(", ")}</>}
        {valid.length > 0 && (
          <span className="muted">
            {" "}
            · <Mark kind="lock" /> {t("chữ ký Tide hợp lệ", "valid Tide signatures")}
          </span>
        )}
      </span>
      {forged.map((a) => (
        <span key={a.userId} className="bad">
          <Mark kind="warn" />{" "}
          {t(
            `Lượt duyệt mạo danh ${nameOf(state, a.userId)}: chữ ký Tide không hợp lệ, không được tính`,
            `Forged approval in ${nameOf(state, a.userId)}'s name: invalid Tide signature, not counted`
          )}
        </span>
      ))}
      {rejections?.map((r) => (
        <span key={r.userId} className="bad">
          <Mark kind="bad" /> {nameOf(state, r.userId)} {t("từ chối", "rejected")}: “{r.reason}”
        </span>
      ))}
    </div>
  );
}

/** Approve and reject buttons for whoever may vote (the server enforces who that is). */
function VoteButtons({ onApprove, onReject, approveLabel }: { onApprove: () => void; onReject: () => void; approveLabel?: string }) {
  const t = useT();
  return (
    <>
      <button className="small" onClick={onApprove}>
        {approveLabel ?? t("Duyệt", "Approve")}
      </button>
      <button className="small ghost bad-outline" onClick={onReject}>
        {t("Từ chối", "Reject")}
      </button>
    </>
  );
}

function Contribute({ fund, act }: { fund: Fund; act: Act }) {
  const t = useT();
  const [amount, setAmount] = useState("500000");
  return (
    <form
      className="contribute"
      onSubmit={(e) => {
        e.preventDefault();
        act({ action: "contribute", fundId: fund.id, amount: Number(amount) });
      }}
    >
      <input type="number" min={1000} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t("Số tiền góp", "Amount to contribute")} />
      <button className="ghost">{t("Góp tiền (mock)", "Contribute (mock)")}</button>
    </form>
  );
}

/** Centered dialog; closes on the backdrop, the close button or Escape. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label={t("Đóng", "Close")}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProposeForm({ fund, act, onDone }: { fund: Fund; act: Act; onDone: () => void }) {
  const t = useT();
  const [amount, setAmount] = useState(fund.kind === "group" ? "3000000" : "80000000");
  const [reason, setReason] = useState(fund.kind === "group" ? "Đặt cọc homestay 2 đêm" : "Mua 200 bao xi măng, cát, thép");
  const [payee, setPayee] = useState("Homestay Đồi Thông");
  const [recipientId, setRecipientId] = useState(fund.recipients[0]?.id ?? "");
  const [other, setOther] = useState("Techcombank 1903 xxxx (Lan)");
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        // Close either way: the notice bar says whether it went through or was blocked.
        await act({
          action: "propose_payout",
          fundId: fund.id,
          amount: Number(amount),
          reason,
          payee,
          recipientId: recipientId === "__other" ? undefined : recipientId,
          toAccount: recipientId === "__other" ? other : undefined,
        });
        onDone();
      }}
    >
      <label>
        {t("Số tiền (đ)", "Amount (VND)")}
        <input type="number" min={1000} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <label>
        {t("Lý do chi", "Reason")}
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {fund.kind === "group" ? (
        <label>
          {t("Chi cho", "Pay to")}
          <input value={payee} onChange={(e) => setPayee(e.target.value)} />
        </label>
      ) : (
        <>
          <label>
            {t("Người nhận", "Recipient")}
            <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              {fund.recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.account}
                </option>
              ))}
              <option value="__other">{t("Tài khoản khác…", "Another account…")}</option>
            </select>
          </label>
          {recipientId === "__other" && (
            <label>
              {t("Tài khoản khác", "Other account")}
              <input value={other} onChange={(e) => setOther(e.target.value)} />
            </label>
          )}
        </>
      )}
      <p className="muted small-text">
        {fund.kind === "group"
          ? t(
              `Cần ${fund.rules.quorum} thành viên khác duyệt thì tiền mới được chuyển. Bạn không tự duyệt lệnh của mình.`,
              `${fund.rules.quorum} other members must approve before money moves. You cannot approve your own payout.`
            )
          : t(
              `Cần ${fund.rules.quorum} thành viên hội đồng duyệt thì tiền mới được chuyển. Bạn không tự duyệt lệnh của mình.`,
              `${fund.rules.quorum} council members must approve before money moves. You cannot approve your own proposal.`
            )}
      </p>
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onDone}>
          {t("Huỷ", "Cancel")}
        </button>
        <button>{fund.kind === "group" ? t("Tạo lệnh chi", "Create payout") : t("Gửi đề xuất", "Submit proposal")}</button>
      </div>
    </form>
  );
}

const EVIDENCE_KINDS: [string, Text][] = [
  ["invoice", ["Hoá đơn", "Invoice"]],
  ["photo", ["Ảnh thực tế", "Photo"]],
  ["receipt", ["Biên bản nhận", "Delivery note"]],
  ["other", ["Khác", "Other"]],
];

function EvidenceForm({ payout, act }: { payout: Payout; act: Act }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("invoice");
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);

  const pick = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  if (!open) {
    return (
      <button className="ghost small" onClick={() => setOpen(true)}>
        <Icon name="upload" size={15} /> {t("Thêm minh chứng", "Add evidence")}
      </button>
    );
  }
  return (
    <form
      className="evidence-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return;
        const fd = new FormData();
        fd.set("action", "submit_evidence");
        fd.set("payoutId", payout.id);
        fd.set("kind", kind);
        fd.set("note", note);
        fd.set("file", file);
        if (await act(fd)) {
          pick(null);
          setNote("");
          setOpen(false);
        }
      }}
    >
      <div className="seg" role="group" aria-label={t("Loại minh chứng", "Evidence type")}>
        {EVIDENCE_KINDS.map(([k, label]) => (
          <button type="button" key={k} className={kind === k ? "seg-btn active" : "seg-btn"} onClick={() => setKind(k)}>
            {t(...label)}
          </button>
        ))}
      </div>
      <label
        className={`dropzone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <input type="file" accept="image/*,application/pdf" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={t("Ảnh minh chứng đã chọn", "Selected evidence image")} />
        ) : (
          <span className="dz-icon">
            <Icon name={file ? "file" : "upload"} size={22} />
          </span>
        )}
        <span>
          <b>{file ? file.name : t("Kéo ảnh hoặc PDF vào đây", "Drop a photo or PDF here")}</b>
          <small className="muted">
            {file
              ? `${Math.ceil(file.size / 1024)} KB · ${t("bấm để chọn file khác", "click to choose another file")}`
              : t("hoặc bấm để chọn file từ máy", "or click to choose a file")}
          </small>
        </span>
      </label>
      <input placeholder={t("Ghi chú, ví dụ: Hoá đơn số 0012 của VLXD Minh Phát", "Note, e.g. Invoice no. 0012 from Minh Phat building supplies")} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="modal-actions">
        <span className="muted small-text">{t("Khoá bằng SHA-256, không ai sửa hay ghi đè được.", "Sealed with SHA-256; no one can edit or overwrite it.")}</span>
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            pick(null);
            setOpen(false);
          }}
        >
          {t("Huỷ", "Cancel")}
        </button>
        <button className="small" disabled={!file}>
          {t("Nộp minh chứng", "Submit evidence")}
        </button>
      </div>
    </form>
  );
}

const TONE: Record<Payout["status"], { tone: string; icon: string }> = {
  pending: { tone: "warn", icon: "clock" },
  awaiting_recipient: { tone: "warn", icon: "user" },
  executed: { tone: "ok", icon: "check" },
  rejected: { tone: "bad", icon: "x" },
};

/** One payout, laid out like a notification: status icon, title and tag, meta line, content boxes. */
function PayoutItem({ fund, payout, state, act }: { fund: Fund; payout: Payout; state: AppState; act: Act }) {
  const t = useT();
  const me = state.me.id;
  const recipient = fund.recipients.find((r) => r.id === payout.recipientId);
  const iAmRecipient = recipient?.userId === me;
  const { tone, icon } = TONE[payout.status];
  const mayUpload = payout.proposerId === me;
  const evidenceLabel = t(...((fund.kind === "group" && EVIDENCE_GROUP[payout.evidenceStatus]) || EVIDENCE[payout.evidenceStatus]));

  return (
    <article className="feed-item">
      <span className={`feed-icon ${tone}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="feed-body">
        <div className="feed-title">
          <b>
            {vnd(payout.amount)} · {payout.reason}
          </b>
          <span className={`tag-pill ${tone}`}>{t(...STATUS[payout.status])}</span>
        </div>
        <div className="feed-meta">
          {when(payout.createdAt)} • {t("Đề xuất bởi", "Proposed by")} {nameOf(state, payout.proposerId)} • {t("Chi cho", "Pay to")}{" "}
          {recipient ? `${recipient.name} (${recipient.account})` : payout.payee}
        </div>

        <div className="feed-box">
          <Votes state={state} approvals={payout.approvals} rejections={payout.rejections} quorum={fund.rules.quorum} />
          {payout.recipientConfirmedAt && (
            <p className="muted">
              <Mark kind="ok" /> {t("Người nhận xác nhận lúc", "Recipient confirmed at")} {when(payout.recipientConfirmedAt)}
            </p>
          )}
          <div className="row">
            {payout.status === "pending" && (
              <VoteButtons
                onApprove={() => act({ action: "approve_payout", payoutId: payout.id })}
                onReject={() => {
                  const reason = askReason(t("Lý do từ chối lệnh chi này:", "Why are you rejecting this payout?"));
                  if (reason) act({ action: "reject_payout", payoutId: payout.id, reason });
                }}
              />
            )}
            {(payout.status === "awaiting_recipient" || (iAmRecipient && payout.status === "pending")) && (
              <button className="small" onClick={() => act({ action: "confirm_receipt", payoutId: payout.id })}>
                {t("Người nhận xác nhận", "Confirm receipt")}
              </button>
            )}
            {payout.status === "pending" && state.me.platformAdmin && (
              <button className="small ghost bad-outline" onClick={() => act({ action: "forge_approval", payoutId: payout.id })}>
                {t("Giả lập: chèn lượt duyệt mạo danh vào DB", "Simulate: insert a forged approval into the DB")}
              </button>
            )}
            {payout.status === "executed" && (
              <Link href={`/proof/${payout.id}`} className="link-more">
                {t("Xem lại lệnh chi và minh chứng →", "Review payout and evidence →")}
              </Link>
            )}
          </div>
        </div>

        {payout.status === "executed" && (
          <div className="feed-box">
            <div className="row between">
              <b>{evidenceLabel}</b>
              {payout.evidence.length > 0 && <span className="muted small-text">{payout.evidence.length} {t("file", payout.evidence.length === 1 ? "file" : "files")}</span>}
            </div>
            {payout.evidenceStatus !== "none" && (
              <Votes state={state} approvals={payout.evidenceApprovals} rejections={payout.evidenceRejections} quorum={fund.rules.quorum} />
            )}
            {payout.evidence.length > 0 && (
              <div className="evidence-grid">
                {payout.evidence.map((e) => (
                  <a key={e.id} className="evidence-thumb" href={`/api/public/evidence/${e.id}`} target="_blank" rel="noreferrer">
                    {/\.(png|jpe?g|webp|gif)$/i.test(e.fileName) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/public/evidence/${e.id}`} alt={e.note || e.fileName} />
                    ) : (
                      <span className="file-icon">{e.fileName.split(".").pop()?.toUpperCase()}</span>
                    )}
                    <span>
                      <b>{e.note || e.fileName}</b>
                      <small className="muted">
                        {nameOf(state, e.submittedBy)} · {when(e.submittedAt)} · <code>{e.sha256.slice(0, 10)}…</code>
                      </small>
                    </span>
                  </a>
                ))}
              </div>
            )}
            <div className="row">
              {payout.evidenceStatus === "submitted" && (
                <VoteButtons
                  approveLabel={t("Duyệt minh chứng", "Approve evidence")}
                  onApprove={() => act({ action: "approve_evidence", payoutId: payout.id })}
                  onReject={() => {
                    const reason = askReason(t("Lý do từ chối minh chứng này:", "Why are you rejecting this evidence?"));
                    if (reason) act({ action: "reject_evidence", payoutId: payout.id, reason });
                  }}
                />
              )}
              {payout.evidence.length > 0 && state.me.platformAdmin && (
                <button className="small ghost bad-outline" onClick={() => act({ action: "tamper_evidence", payoutId: payout.id })}>
                  {t("Giả lập: sửa file hoá đơn trên máy chủ", "Simulate: tamper with the invoice on the server")}
                </button>
              )}
            </div>
            {mayUpload && <EvidenceForm payout={payout} act={act} />}
          </div>
        )}
      </div>
    </article>
  );
}

function RuleChanges({ fund, changes, state, act }: { fund: Fund; changes: RuleChange[]; state: AppState; act: Act }) {
  const t = useT();
  const [quorum, setQuorum] = useState("1");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const describe = (c: RuleChange) =>
    c.spec.type === "set_quorum"
      ? t(`Đổi quorum thành ${c.spec.quorum}`, `Set quorum to ${c.spec.quorum}`)
      : c.spec.type === "add_recipient"
        ? t(`Thêm người nhận "${c.spec.name}" (${c.spec.account})`, `Add recipient "${c.spec.name}" (${c.spec.account})`)
        : t(`Đóng chiến dịch và hoàn tiền: ${c.spec.reason}`, `Close and refund the campaign: ${c.spec.reason}`);
  const STATUS_LABEL: Record<string, React.ReactNode> = {
    applied: (
      <>
        <Mark kind="ok" /> {t("đã áp dụng", "applied")}
      </>
    ),
    rejected: (
      <>
        <Mark kind="bad" /> {t("bị từ chối", "rejected")}
      </>
    ),
  };
  return (
    <section className="card">
      <h3>{t("Luật quỹ", "Fund rules")}</h3>
      <ul>
        <li>
          {fund.kind === "group"
            ? t(
                `Thành viên nào cũng tạo được lệnh chi; mỗi khoản chi cần ${fund.rules.quorum} thành viên khác duyệt.`,
                `Any member can create a payout; each needs ${fund.rules.quorum} other members to approve.`
              )
            : t(
                `Mỗi khoản chi cần ${fund.rules.quorum} thành viên hội đồng giám sát duyệt. Người đề xuất không tự duyệt.`,
                `Each payout needs ${fund.rules.quorum} oversight council members to approve. The proposer cannot approve.`
              )}
        </li>
        {fund.rules.largeAmount && (
          <li>
            {t(
              `Khoản trên ${vnd(fund.rules.largeAmount)} cần người nhận xác nhận.`,
              `Payouts above ${vnd(fund.rules.largeAmount)} need the recipient's confirmation.`
            )}
          </li>
        )}
        {fund.rules.evidenceBeforeNext && (
          <li>
            {t(
              "Đợt chi trước chưa có minh chứng được duyệt thì đợt sau bị khoá.",
              "The next payout stays locked until the previous one's evidence is approved."
            )}
          </li>
        )}
        {fund.kind === "charity" && <li>{t("Chỉ chuyển cho người nhận đã đăng ký.", "Money only goes to registered recipients.")}</li>}
        <li>
          {t(
            `Sửa luật cũng cần ${fund.rules.quorum} người duyệt. Admin nền tảng không có quyền.`,
            `Changing the rules also needs ${fund.rules.quorum} approvals. The platform admin has no say.`
          )}
        </li>
      </ul>

      {changes.length > 0 && (
        <>
          <h4>{t("Đề xuất", "Proposals")}</h4>
          <ul>
            {changes.map((c) => (
              <li key={c.id} className="stack-sm">
                <span>
                  {describe(c)} · {nameOf(state, c.proposerId)} {STATUS_LABEL[c.status] && <>· {STATUS_LABEL[c.status]}</>}
                </span>
                <Votes state={state} approvals={c.approvals} rejections={c.rejections} quorum={fund.rules.quorum} />
                {c.status === "pending" && (
                  <div className="row">
                    <VoteButtons
                      onApprove={() => act({ action: "approve_rule", changeId: c.id })}
                      onReject={() => {
                        const reason = askReason(t("Lý do từ chối đề xuất này:", "Why are you rejecting this proposal?"));
                        if (reason) act({ action: "reject_rule", changeId: c.id, reason });
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          act({ action: "propose_rule", fundId: fund.id, spec: { type: "set_quorum", quorum: Number(quorum) } });
        }}
      >
        <label>
          {t("Đề xuất quorum mới", "Propose a new quorum")}
          <input type="number" min={1} value={quorum} onChange={(e) => setQuorum(e.target.value)} />
        </label>
        <button>{t("Đề xuất", "Propose")}</button>
      </form>
      {fund.kind === "charity" && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "propose_rule", fundId: fund.id, spec: { type: "add_recipient", name, account } });
          }}
        >
          <input placeholder={t("Tên người nhận mới", "New recipient name")} value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder={t("Số tài khoản", "Account number")} value={account} onChange={(e) => setAccount(e.target.value)} />
          <button>{t("Đề xuất thêm người nhận", "Propose adding recipient")}</button>
        </form>
      )}
    </section>
  );
}

/** Closing a charity campaign: by council quorum, or by anyone once the deadline has passed. */
function CloseCampaign({ fund, changes, state, act }: { fund: Fund; changes: RuleChange[]; state: AppState; act: Act }) {
  const t = useT();
  const [reason, setReason] = useState(t("Người kêu gọi không nộp minh chứng, mất liên lạc", "Organiser stopped submitting evidence and cannot be reached"));
  if (fund.closed) {
    const total = fund.closed.refunds.reduce((s, r) => s + r.amount, 0);
    return (
      <section className="card">
        <h3>{t(`Chiến dịch đã đóng · đã hoàn ${vnd(total)}`, `Campaign closed · ${vnd(total)} refunded`)}</h3>
        <p className="muted">
          {when(fund.closed.at)} ·{" "}
          {fund.closed.how === "expired" ? t("Tự động khi hết hạn", "Automatically at the deadline") : t("Hội đồng duyệt đóng", "Closed by council vote")} ·{" "}
          {t("Lý do", "Reason")}: {fund.closed.reason}
        </p>
        <table>
          <thead>
            <tr>
              <th>{t("Nhà hảo tâm", "Donor")}</th>
              <th>{t("Đã góp", "Gave")}</th>
              <th>{t("Được hoàn", "Refunded")}</th>
              <th>{t("Về tài khoản đã góp", "To the account they paid from")}</th>
            </tr>
          </thead>
          <tbody>
            {fund.closed.refunds.map((r) => (
              <tr key={`${r.userId}-${r.account}`}>
                <td>{nameOf(state, r.userId)}</td>
                <td>{vnd(r.contributed)}</td>
                <td>
                  <b>{vnd(r.amount)}</b>
                </td>
                <td>{r.account}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  const expired = !!fund.deadline && new Date(fund.deadline) <= new Date();
  return (
    <section className="card">
      <h3>{t("Đóng chiến dịch và hoàn tiền", "Close and refund")}</h3>
      <ul>
        <li>
          {t("Hạn chiến dịch", "Deadline")}: <b>{fund.deadline ? new Date(fund.deadline).toLocaleDateString("vi-VN") : t("không có", "none")}</b>.{" "}
          {t("Hết hạn thì ai cũng bấm hoàn tiền được, không cần ai duyệt.", "After it, anyone can trigger the refund; no approval needed.")}
        </li>
        <li>{t(`Đóng sớm cần ${fund.rules.quorum} thành viên hội đồng duyệt.`, `Closing early needs ${fund.rules.quorum} council approvals.`)}</li>
        <li>
          {t(
            "Số dư còn lại được hoàn theo tỷ lệ mỗi người đã góp, và chỉ về đúng tài khoản đã góp.",
            "The remaining balance is refunded in proportion to what each donor gave, only to the account they paid from."
          )}
        </li>
      </ul>
      {changes.length > 0 && (
        <ul>
          {changes.map((c) => (
            <li key={c.id} className="stack-sm">
              <span>
                “{c.spec.type === "close_refund" && c.spec.reason}” · {t("đề xuất bởi", "proposed by")} {nameOf(state, c.proposerId)}
                {c.status === "rejected" && (
                  <>
                    {" "}
                    · <Mark kind="bad" /> {t("bị từ chối", "rejected")}
                  </>
                )}
              </span>
              <Votes state={state} approvals={c.approvals} rejections={c.rejections} quorum={fund.rules.quorum} />
              {c.status === "pending" && (
                <div className="row">
                  <VoteButtons
                    approveLabel={t("Duyệt đóng và hoàn tiền", "Approve closing and refund")}
                    onApprove={() => act({ action: "approve_rule", changeId: c.id })}
                    onReject={() => {
                      const reason = askReason(t("Lý do từ chối việc đóng chiến dịch:", "Why are you rejecting closing the campaign?"));
                      if (reason) act({ action: "reject_rule", changeId: c.id, reason });
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          act({ action: "propose_rule", fundId: fund.id, spec: { type: "close_refund", reason } });
        }}
      >
        <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t("Lý do đóng chiến dịch", "Reason for closing")} />
        <button>{t("Đề xuất đóng và hoàn tiền", "Propose closing and refund")}</button>
      </form>
      <button className={expired ? "" : "ghost"} onClick={() => act({ action: "refund_expired", fundId: fund.id })}>
        {t("Hoàn tiền vì hết hạn", "Refund: deadline passed")}
      </button>
    </section>
  );
}

// "Đã chi" is where executed payouts are reviewed, with their evidence.
const FILTERS = [
  ["all", ["Tất cả", "All"]],
  ["pending", ["Chờ duyệt", "Pending"]],
  ["executed", ["Đã chi", "Paid"]],
  ["rejected", ["Bị từ chối", "Rejected"]],
] as const;
type Filter = (typeof FILTERS)[number][0];
const FILTER_TEST: Record<Filter, (p: Payout) => boolean> = {
  all: () => true,
  pending: (p) => p.status === "pending" || p.status === "awaiting_recipient",
  executed: (p) => p.status === "executed",
  rejected: (p) => p.status === "rejected",
};

const TABS = [
  ["payouts", ["Khoản chi", "Payouts"]],
  ["log", ["Nhật ký", "Audit log"]],
  ["rules", ["Luật và thành viên", "Rules & members"]],
] as const;
type Tab = (typeof TABS)[number][0];

function FundView({ id }: { id: string }) {
  const t = useT();
  const { lang } = useLang();
  const { state, error, notice, setNotice, act } = useAppState();
  const [tab, setTab] = useState<Tab>("payouts");
  const [filter, setFilter] = useState<Filter>("all");
  const [proposing, setProposing] = useState(false);
  // A link to /funds/<id>#log opens the log tab.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (TABS.some(([key]) => key === hash)) setTab(hash as Tab);
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">{t("Đang tải…", "Loading…")}</p>;
  const fund = state.funds.find((f) => f.id === id);
  if (!fund) return <p className="error">{t("Không tìm thấy quỹ.", "Fund not found.")}</p>;
  const text = fundText(fund, lang);
  const proposeLabel = fund.kind === "group" ? t("Tạo lệnh chi", "Create payout") : t("Đề xuất giải ngân", "Propose disbursement");

  const myRole = roleOf(fund, state.me.id);
  const payouts = state.payouts.filter((p) => p.fundId === fund.id).reverse();
  const organiser = fund.members.find((m) => m.role === "organiser");
  const raised = state.contributions.filter((c) => c.fundId === fund.id).reduce((s, c) => s + c.amount, 0);
  const changes = state.ruleChanges.filter((c) => c.fundId === fund.id);
  const log = state.log.filter((l) => l.fundId === fund.id);
  const blocked = log.filter((l) => l.outcome === "blocked").length;
  const shown = payouts.filter(FILTER_TEST[filter]);

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <section className="card hero">
        <span className="tag">{fund.kind === "group" ? t("Quỹ nhóm", "Group fund") : t("Chiến dịch từ thiện", "Charity campaign")}</span>
        <h2>
          {text.name} {fund.closed && <span className="pill">{t("Đã đóng · đã hoàn tiền", "Closed · refunded")}</span>}
        </h2>
        <p className="muted">{text.description}</p>
        <div className="hero-stats">
          <div>
            <small className="muted">{t("Số dư", "Balance")}</small>
            <b>{vnd(fund.balance)}</b>
          </div>
          {fund.goal && (
            <div>
              <small className="muted">{t("Đã góp / mục tiêu", "Raised / goal")}</small>
              <b>
                {vnd(raised)} / {vnd(fund.goal)}
              </b>
            </div>
          )}
          <div>
            <small className="muted">{t("Cần duyệt", "Approvals needed")}</small>
            <b>{t(`${fund.rules.quorum} người`, `${fund.rules.quorum} people`)}</b>
          </div>
        </div>
        <p>
          {t("Bạn là", "You are")}:{" "}
          <b>{myRole ? t(...ROLE_LABEL[myRole]) : state.me.platformAdmin ? t("Admin nền tảng", "Platform admin") : t("Người xem", "Viewer")}</b>
          {organiser && (
            <>
              {" "}
              · {t("Người kêu gọi", "Organiser")}:{" "}
              <Link href={`/organiser/${organiser.userId}`}>
                {nameOf(state, organiser.userId)} ({t("hồ sơ uy tín", "reputation")})
              </Link>
            </>
          )}
        </p>
        {!fund.closed && (
          <div className="hero-actions">
            <Contribute fund={fund} act={act} />
            <button onClick={() => setProposing(true)}>
              <Icon name="plus" size={16} /> {proposeLabel}
            </button>
          </div>
        )}
      </section>

      {proposing && (
        <Modal title={proposeLabel} onClose={() => setProposing(false)}>
          <ProposeForm fund={fund} act={act} onDone={() => setProposing(false)} />
        </Modal>
      )}

      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "tab active" : "tab"} onClick={() => setTab(key)}>
            {t(...(label as Text))}
            {key === "payouts" && <span className="count">{payouts.length}</span>}
            {key === "log" && (
              <span className={blocked ? "count bad" : "count"}>{blocked ? t(`${blocked} bị chặn`, `${blocked} blocked`) : log.length}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "payouts" && (
        <div className={fund.kind === "charity" ? "cols" : ""}>
          <section className="card feed">
            <div className="feed-head">
              <div className="filters" role="group" aria-label={t("Lọc lệnh chi", "Filter payouts")}>
                {FILTERS.map(([f, label]) => (
                  <button key={f} className={filter === f ? "chip-btn active" : "chip-btn"} onClick={() => setFilter(f)}>
                    {t(...(label as Text))} <span className="count">{payouts.filter(FILTER_TEST[f]).length}</span>
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 && <p className="muted feed-empty">{t("Không có lệnh chi nào ở mục này.", "No payouts here.")}</p>}
            {shown.map((p) => (
              <PayoutItem key={p.id} fund={fund} payout={p} state={state} act={act} />
            ))}
          </section>
          {fund.kind === "charity" && (
            <aside>
              <CloseCampaign fund={fund} changes={changes.filter((c) => c.spec.type === "close_refund")} state={state} act={act} />
            </aside>
          )}
        </div>
      )}

      {tab === "log" && (
        <>
          <p className="muted">
            {t(
              `Nhật ký của riêng quỹ này: ${log.length} hoạt động, ${blocked} lần thử vượt quyền bị chặn.`,
              `This fund's own log: ${log.length} actions, ${blocked} unauthorised attempts blocked.`
            )}
          </p>
          <LogTable state={state} entries={log} />
        </>
      )}

      {tab === "rules" && (
        <div className="cols">
          <RuleChanges fund={fund} changes={changes.filter((c) => c.spec.type !== "close_refund")} state={state} act={act} />
          <aside>
            {fund.kind === "charity" && (
              <section className="card">
                <h3>{t("Người nhận đã đăng ký", "Registered recipients")}</h3>
                <ul>
                  {fund.recipients.map((r) => (
                    <li key={r.id}>
                      {r.name} · {r.account}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="card">
              <h3>{t("Thành viên", "Members")}</h3>
              <ul>
                {fund.members.map((m) => (
                  <li key={m.userId}>
                    {nameOf(state, m.userId)} · {t(...ROLE_LABEL[m.role])}
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

export default function FundPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireLogin>
      <FundView id={id} />
    </RequireLogin>
  );
}
