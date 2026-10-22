"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppState, Icon, LogTable, nameOf, NoticeBar, RequireLogin, ROLE_LABEL, roleOf, useAppState, vnd, when } from "@/components/app";
import type { Approval, Fund, Payout, Rejection, RuleChange } from "@/lib/fund/types";

type Act = (body: Record<string, unknown> | FormData) => Promise<boolean>;

const STATUS: Record<Payout["status"], string> = {
  pending: "Chờ duyệt",
  awaiting_recipient: "Chờ người nhận xác nhận",
  executed: "Đã chuyển tiền",
  rejected: "Bị từ chối",
};
const EVIDENCE: Record<Payout["evidenceStatus"], string> = {
  none: "Chưa có minh chứng",
  submitted: "Minh chứng chờ hội đồng duyệt",
  approved: "Minh chứng đã duyệt",
  rejected: "Minh chứng bị từ chối, cần nộp lại",
};

/** Asks for the reason a rejection must carry; null if the user cancels. */
function askReason(what: string) {
  const reason = window.prompt(`Lý do từ chối ${what}:`);
  return reason?.trim() ? reason.trim() : null;
}

/** Who approved and who rejected, with each rejection's reason. */
function Votes({ state, approvals, rejections, quorum }: { state: AppState; approvals: Approval[]; rejections?: Rejection[]; quorum: number }) {
  // Only votes whose Tide signature verifies count; a forged one is shown but not counted.
  const valid = approvals.filter((a) => a.signature === "tide");
  const forged = approvals.filter((a) => a.signature !== "tide");
  return (
    <div className="votes">
      <span>
        ✅ Duyệt {valid.length}/{quorum}
        {valid.length > 0 && <>: {valid.map((a) => nameOf(state, a.userId)).join(", ")}</>}
        {valid.length > 0 && <span className="muted"> · 🔏 chữ ký Tide hợp lệ</span>}
      </span>
      {forged.map((a) => (
        <span key={a.userId} className="bad">
          ⚠️ Lượt duyệt mạo danh {nameOf(state, a.userId)}: chữ ký Tide không hợp lệ, không được tính
        </span>
      ))}
      {rejections?.map((r) => (
        <span key={r.userId} className="bad">
          ❌ {nameOf(state, r.userId)} từ chối: “{r.reason}”
        </span>
      ))}
    </div>
  );
}

/** Approve and reject buttons for whoever may vote (the server enforces who that is). */
function VoteButtons({ onApprove, onReject, approveLabel = "Duyệt" }: { onApprove: () => void; onReject: () => void; approveLabel?: string }) {
  return (
    <>
      <button className="small" onClick={onApprove}>
        {approveLabel}
      </button>
      <button className="small ghost bad-outline" onClick={onReject}>
        Từ chối
      </button>
    </>
  );
}

function Contribute({ fund, act }: { fund: Fund; act: Act }) {
  const [amount, setAmount] = useState("500000");
  return (
    <form
      className="contribute"
      onSubmit={(e) => {
        e.preventDefault();
        act({ action: "contribute", fundId: fund.id, amount: Number(amount) });
      }}
    >
      <input type="number" min={1000} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Số tiền góp" />
      <button className="ghost">Góp tiền (mock)</button>
    </form>
  );
}

/** Centered dialog; closes on the backdrop, the ✕ or Escape. */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProposeForm({ fund, act, onDone }: { fund: Fund; act: Act; onDone: () => void }) {
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
        Số tiền (đ)
        <input type="number" min={1000} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <label>
        Lý do chi
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {fund.kind === "group" ? (
        <label>
          Chi cho
          <input value={payee} onChange={(e) => setPayee(e.target.value)} />
        </label>
      ) : (
        <>
          <label>
            Người nhận
            <select value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
              {fund.recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.account}
                </option>
              ))}
              <option value="__other">Tài khoản khác…</option>
            </select>
          </label>
          {recipientId === "__other" && (
            <label>
              Tài khoản khác
              <input value={other} onChange={(e) => setOther(e.target.value)} />
            </label>
          )}
        </>
      )}
      <p className="muted small-text">
        Cần {fund.rules.quorum} {fund.kind === "group" ? "thành viên khác" : "thành viên hội đồng"} duyệt thì tiền mới được chuyển. Bạn không tự duyệt
        lệnh của mình.
      </p>
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onDone}>
          Huỷ
        </button>
        <button>{fund.kind === "group" ? "Tạo lệnh chi" : "Gửi đề xuất"}</button>
      </div>
    </form>
  );
}

const EVIDENCE_KINDS = [
  ["invoice", "Hoá đơn"],
  ["photo", "Ảnh thực tế"],
  ["receipt", "Biên bản nhận"],
  ["other", "Khác"],
] as const;

function EvidenceForm({ payout, act }: { payout: Payout; act: Act }) {
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
        <Icon name="upload" size={15} /> Thêm minh chứng
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
      <div className="seg" role="group" aria-label="Loại minh chứng">
        {EVIDENCE_KINDS.map(([k, label]) => (
          <button type="button" key={k} className={kind === k ? "seg-btn active" : "seg-btn"} onClick={() => setKind(k)}>
            {label}
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
          <img src={preview} alt="Ảnh minh chứng đã chọn" />
        ) : (
          <span className="dz-icon">
            <Icon name={file ? "file" : "upload"} size={22} />
          </span>
        )}
        <span>
          <b>{file ? file.name : "Kéo ảnh hoặc PDF vào đây"}</b>
          <small className="muted">{file ? `${Math.ceil(file.size / 1024)} KB · bấm để chọn file khác` : "hoặc bấm để chọn file từ máy"}</small>
        </span>
      </label>
      <input placeholder="Ghi chú, ví dụ: Hoá đơn số 0012 của VLXD Minh Phát" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="modal-actions">
        <span className="muted small-text">Khoá bằng SHA-256, không ai sửa hay ghi đè được.</span>
        <button
          type="button"
          className="ghost small"
          onClick={() => {
            pick(null);
            setOpen(false);
          }}
        >
          Huỷ
        </button>
        <button className="small" disabled={!file}>
          Nộp minh chứng
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
  const me = state.me.id;
  const recipient = fund.recipients.find((r) => r.id === payout.recipientId);
  const iAmRecipient = recipient?.userId === me;
  const myRole = roleOf(fund, me);
  const { tone, icon } = TONE[payout.status];
  const mayUpload =
    myRole === "organiser" || payout.proposerId === me || (fund.kind === "group" && (myRole === "treasurer" || myRole === "member"));
  const evidenceLabel = fund.kind === "group" ? EVIDENCE[payout.evidenceStatus].replace("hội đồng", "thành viên") : EVIDENCE[payout.evidenceStatus];

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
          <span className={`tag-pill ${tone}`}>{STATUS[payout.status]}</span>
        </div>
        <div className="feed-meta">
          {when(payout.createdAt)} • Đề xuất bởi {nameOf(state, payout.proposerId)} • Chi cho{" "}
          {recipient ? `${recipient.name} (${recipient.account})` : payout.payee}
        </div>

        <div className="feed-box">
          <Votes state={state} approvals={payout.approvals} rejections={payout.rejections} quorum={fund.rules.quorum} />
          {payout.recipientConfirmedAt && <p className="muted">✔ Người nhận xác nhận lúc {when(payout.recipientConfirmedAt)}</p>}
          <div className="row">
            {payout.status === "pending" && (
              <VoteButtons
                onApprove={() => act({ action: "approve_payout", payoutId: payout.id })}
                onReject={() => {
                  const reason = askReason("lệnh chi này");
                  if (reason) act({ action: "reject_payout", payoutId: payout.id, reason });
                }}
              />
            )}
            {(payout.status === "awaiting_recipient" || (iAmRecipient && payout.status === "pending")) && (
              <button className="small" onClick={() => act({ action: "confirm_receipt", payoutId: payout.id })}>
                Người nhận xác nhận
              </button>
            )}
            {payout.status === "pending" && state.me.platformAdmin && (
              <button className="small ghost bad-outline" onClick={() => act({ action: "forge_approval", payoutId: payout.id })}>
                Giả lập: chèn lượt duyệt mạo danh vào DB
              </button>
            )}
            {payout.status === "executed" && (
              <Link href={`/proof/${payout.id}`} className="link-more">
                Xem lại lệnh chi và minh chứng →
              </Link>
            )}
          </div>
        </div>

        {payout.status === "executed" && (
          <div className="feed-box">
            <div className="row between">
              <b>{evidenceLabel}</b>
              {payout.evidence.length > 0 && <span className="muted small-text">{payout.evidence.length} file</span>}
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
                  approveLabel="Duyệt minh chứng"
                  onApprove={() => act({ action: "approve_evidence", payoutId: payout.id })}
                  onReject={() => {
                    const reason = askReason("minh chứng này");
                    if (reason) act({ action: "reject_evidence", payoutId: payout.id, reason });
                  }}
                />
              )}
              {payout.evidence.length > 0 && state.me.platformAdmin && (
                <button className="small ghost bad-outline" onClick={() => act({ action: "tamper_evidence", payoutId: payout.id })}>
                  Giả lập: sửa file hoá đơn trên máy chủ
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
  const [quorum, setQuorum] = useState("1");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const describe = (c: RuleChange) =>
    c.spec.type === "set_quorum"
      ? `Đổi quorum thành ${c.spec.quorum}`
      : c.spec.type === "add_recipient"
        ? `Thêm người nhận "${c.spec.name}" (${c.spec.account})`
        : `Đóng chiến dịch và hoàn tiền: ${c.spec.reason}`;
  const STATUS_LABEL = { applied: "✅ đã áp dụng", rejected: "❌ bị từ chối" } as Record<string, string>;
  return (
    <section className="card">
      <h3>Luật quỹ</h3>
      <ul>
        <li>
          {fund.kind === "group" ? "Thành viên nào cũng tạo được lệnh chi; " : ""}Mỗi khoản chi cần <b>{fund.rules.quorum}</b> người duyệt (
          {fund.kind === "group" ? "thành viên" : "hội đồng giám sát"}). Người tạo lệnh không tự duyệt.
        </li>
        {fund.rules.largeAmount && <li>Khoản trên {vnd(fund.rules.largeAmount)} cần người nhận xác nhận.</li>}
        {fund.rules.evidenceBeforeNext && <li>Đợt chi trước chưa có minh chứng được duyệt thì đợt sau bị khoá.</li>}
        {fund.kind === "charity" && <li>Chỉ chuyển cho người nhận đã đăng ký.</li>}
        <li>Sửa luật cũng cần {fund.rules.quorum} người duyệt. Admin nền tảng không có quyền.</li>
      </ul>

      {changes.length > 0 && (
        <>
          <h4>Đề xuất</h4>
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
                        const reason = askReason("đề xuất này");
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
          Đề xuất quorum mới
          <input type="number" min={1} value={quorum} onChange={(e) => setQuorum(e.target.value)} />
        </label>
        <button>Đề xuất</button>
      </form>
      {fund.kind === "charity" && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            act({ action: "propose_rule", fundId: fund.id, spec: { type: "add_recipient", name, account } });
          }}
        >
          <input placeholder="Tên người nhận mới" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Số tài khoản" value={account} onChange={(e) => setAccount(e.target.value)} />
          <button>Đề xuất thêm người nhận</button>
        </form>
      )}
    </section>
  );
}

/** Closing a charity campaign: by council quorum, or by anyone once the deadline has passed. */
function CloseCampaign({ fund, changes, state, act }: { fund: Fund; changes: RuleChange[]; state: AppState; act: Act }) {
  const [reason, setReason] = useState("Người kêu gọi không nộp minh chứng, mất liên lạc");
  if (fund.closed) {
    const total = fund.closed.refunds.reduce((s, r) => s + r.amount, 0);
    return (
      <section className="card">
        <h3>Chiến dịch đã đóng · đã hoàn {vnd(total)}</h3>
        <p className="muted">
          {when(fund.closed.at)} · {fund.closed.how === "expired" ? "Tự động khi hết hạn" : "Hội đồng duyệt đóng"} · Lý do: {fund.closed.reason}
        </p>
        <table>
          <thead>
            <tr>
              <th>Nhà hảo tâm</th>
              <th>Đã góp</th>
              <th>Được hoàn</th>
              <th>Về tài khoản đã góp</th>
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
      <h3>Đóng chiến dịch và hoàn tiền</h3>
      <ul>
        <li>
          Hạn chiến dịch: <b>{fund.deadline ? new Date(fund.deadline).toLocaleDateString("vi-VN") : "không có"}</b>. Hết hạn thì ai cũng bấm hoàn tiền được, không
          cần ai duyệt.
        </li>
        <li>Đóng sớm cần {fund.rules.quorum} thành viên hội đồng duyệt.</li>
        <li>Số dư còn lại được hoàn theo tỷ lệ mỗi người đã góp, và chỉ về đúng tài khoản đã góp.</li>
      </ul>
      {changes.length > 0 && (
        <ul>
          {changes.map((c) => (
            <li key={c.id} className="stack-sm">
              <span>
                “{c.spec.type === "close_refund" && c.spec.reason}” · đề xuất bởi {nameOf(state, c.proposerId)}
                {c.status === "rejected" && " · ❌ bị từ chối"}
              </span>
              <Votes state={state} approvals={c.approvals} rejections={c.rejections} quorum={fund.rules.quorum} />
              {c.status === "pending" && (
                <div className="row">
                  <VoteButtons
                    approveLabel="Duyệt đóng và hoàn tiền"
                    onApprove={() => act({ action: "approve_rule", changeId: c.id })}
                    onReject={() => {
                      const reason = askReason("việc đóng chiến dịch");
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
        <input value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lý do đóng chiến dịch" />
        <button>Đề xuất đóng và hoàn tiền</button>
      </form>
      <button className={expired ? "" : "ghost"} onClick={() => act({ action: "refund_expired", fundId: fund.id })}>
        Hoàn tiền vì hết hạn
      </button>
    </section>
  );
}

// "Đã chi" is where executed payouts are reviewed, with their evidence.
const FILTERS = [
  ["all", "Tất cả"],
  ["pending", "Chờ duyệt"],
  ["executed", "Đã chi"],
  ["rejected", "Bị từ chối"],
] as const;
type Filter = (typeof FILTERS)[number][0];
const FILTER_TEST: Record<Filter, (p: Payout) => boolean> = {
  all: () => true,
  pending: (p) => p.status === "pending" || p.status === "awaiting_recipient",
  executed: (p) => p.status === "executed",
  rejected: (p) => p.status === "rejected",
};

const TABS = [
  ["payouts", "Khoản chi"],
  ["log", "Nhật ký"],
  ["rules", "Luật và thành viên"],
] as const;
type Tab = (typeof TABS)[number][0];

function FundView({ id }: { id: string }) {
  const { state, error, notice, setNotice, act } = useAppState();
  const [tab, setTab] = useState<Tab>("payouts");
  const [filter, setFilter] = useState<Filter>("all");
  const [proposing, setProposing] = useState(false);
  // A link to /funds/<id>#log opens the log tab.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (TABS.some(([t]) => t === hash)) setTab(hash as Tab);
  }, []);
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Đang tải…</p>;
  const fund = state.funds.find((f) => f.id === id);
  if (!fund) return <p className="error">Không tìm thấy quỹ.</p>;

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
        <span className="tag">{fund.kind === "group" ? "Quỹ nhóm" : "Chiến dịch từ thiện"}</span>
        <h2>
          {fund.name} {fund.closed && <span className="pill">Đã đóng · đã hoàn tiền</span>}
        </h2>
        <p className="muted">{fund.description}</p>
        <div className="hero-stats">
          <div>
            <small className="muted">Số dư</small>
            <b>{vnd(fund.balance)}</b>
          </div>
          {fund.goal && (
            <div>
              <small className="muted">Đã góp / mục tiêu</small>
              <b>
                {vnd(raised)} / {vnd(fund.goal)}
              </b>
            </div>
          )}
          <div>
            <small className="muted">Cần duyệt</small>
            <b>
              {fund.rules.quorum} người
            </b>
          </div>
        </div>
        <p>
          Bạn là: <b>{myRole ? ROLE_LABEL[myRole] : state.me.platformAdmin ? "Admin nền tảng" : "Người xem"}</b>
          {organiser && (
            <>
              {" "}
              · Người kêu gọi: <Link href={`/organiser/${organiser.userId}`}>{nameOf(state, organiser.userId)} (hồ sơ uy tín)</Link>
            </>
          )}
        </p>
        {!fund.closed && (
          <div className="hero-actions">
            <Contribute fund={fund} act={act} />
            <button onClick={() => setProposing(true)}>
              <Icon name="plus" size={16} /> {fund.kind === "group" ? "Tạo lệnh chi" : "Đề xuất giải ngân"}
            </button>
          </div>
        )}
      </section>

      {proposing && (
        <Modal title={fund.kind === "group" ? "Tạo lệnh chi" : "Đề xuất giải ngân"} onClose={() => setProposing(false)}>
          <ProposeForm fund={fund} act={act} onDone={() => setProposing(false)} />
        </Modal>
      )}

      <div className="tabs" role="tablist">
        {TABS.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "tab active" : "tab"} onClick={() => setTab(t)}>
            {label}
            {t === "payouts" && <span className="count">{payouts.length}</span>}
            {t === "log" && <span className={blocked ? "count bad" : "count"}>{blocked ? `${blocked} bị chặn` : log.length}</span>}
          </button>
        ))}
      </div>

      {tab === "payouts" && (
        <div className={fund.kind === "charity" ? "cols" : ""}>
          <section className="card feed">
            <div className="feed-head">
              <div className="filters" role="group" aria-label="Lọc lệnh chi">
                {FILTERS.map(([f, label]) => (
                  <button key={f} className={filter === f ? "chip-btn active" : "chip-btn"} onClick={() => setFilter(f)}>
                    {label} <span className="count">{payouts.filter(FILTER_TEST[f]).length}</span>
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0 && <p className="muted feed-empty">Không có lệnh chi nào ở mục này.</p>}
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
            Nhật ký của riêng quỹ này: {log.length} hoạt động, {blocked} lần thử vượt quyền bị chặn.
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
                <h3>Người nhận đã đăng ký</h3>
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
              <h3>Thành viên</h3>
              <ul>
                {fund.members.map((m) => (
                  <li key={m.userId}>
                    {nameOf(state, m.userId)} · {ROLE_LABEL[m.role]}
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
