"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AppState, nameOf, NoticeBar, RequireLogin, ROLE_LABEL, roleOf, useAppState, vnd, when } from "@/components/app";
import type { Fund, Payout, RuleChange } from "@/lib/fund/types";

type Act = (body: Record<string, unknown> | FormData) => Promise<boolean>;

const STATUS: Record<Payout["status"], string> = {
  pending: "Chờ duyệt",
  awaiting_recipient: "Chờ người nhận xác nhận",
  executed: "Đã chuyển tiền",
};
const EVIDENCE: Record<Payout["evidenceStatus"], string> = {
  none: "Chưa có minh chứng",
  submitted: "Minh chứng chờ hội đồng duyệt",
  approved: "Minh chứng đã duyệt",
};

function Contribute({ fund, act }: { fund: Fund; act: Act }) {
  const [amount, setAmount] = useState("500000");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        act({ action: "contribute", fundId: fund.id, amount: Number(amount) });
      }}
    >
      <input type="number" min={1000} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Số tiền góp" />
      <button>Góp tiền (mock)</button>
    </form>
  );
}

function Withdraw({ fund, act }: { fund: Fund; act: Act }) {
  const [amount, setAmount] = useState(fund.kind === "group" ? "10000000" : "50000000");
  const [account, setAccount] = useState("Techcombank 1903 xxxx (tài khoản cá nhân)");
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        act({ action: "withdraw", fundId: fund.id, amount: Number(amount), toAccount: account });
      }}
    >
      <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Số tiền rút" />
      <input value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Tài khoản nhận" />
      <button className="danger">Rút thẳng về tài khoản này</button>
    </form>
  );
}

function Propose({ fund, act }: { fund: Fund; act: Act }) {
  const [amount, setAmount] = useState(fund.kind === "group" ? "3000000" : "80000000");
  const [reason, setReason] = useState(fund.kind === "group" ? "Đặt cọc homestay 2 đêm" : "Mua 200 bao xi măng, cát, thép");
  const [payee, setPayee] = useState("Homestay Đồi Thông");
  const [recipientId, setRecipientId] = useState(fund.recipients[0]?.id ?? "");
  const [other, setOther] = useState("Techcombank 1903 xxxx (Lan)");
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        act({
          action: "propose_payout",
          fundId: fund.id,
          amount: Number(amount),
          reason,
          payee,
          recipientId: recipientId === "__other" ? undefined : recipientId,
          toAccount: recipientId === "__other" ? other : undefined,
        });
      }}
    >
      <label>
        Số tiền
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>
        Lý do
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
      <button>{fund.kind === "group" ? "Tạo lệnh chi" : "Đề xuất giải ngân"}</button>
    </form>
  );
}

function EvidenceForm({ payout, act }: { payout: Payout; act: Act }) {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState("invoice");
  const [note, setNote] = useState("");
  return (
    <form
      className="stack evidence-form"
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
          setFile(null);
          setNote("");
          (e.target as HTMLFormElement).reset();
        }
      }}
    >
      <strong>Nộp minh chứng</strong>
      <div className="row">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Loại minh chứng">
          <option value="invoice">Hoá đơn</option>
          <option value="photo">Ảnh thực tế</option>
          <option value="receipt">Biên bản nhận</option>
          <option value="other">Khác</option>
        </select>
        <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="File minh chứng" />
      </div>
      <input placeholder="Ghi chú, ví dụ: Hoá đơn số 0012 của VLXD Minh Phát" value={note} onChange={(e) => setNote(e.target.value)} />
      <button disabled={!file}>Nộp (khoá bằng SHA-256, không ghi đè được)</button>
    </form>
  );
}

function PayoutCard({ fund, payout, state, act }: { fund: Fund; payout: Payout; state: AppState; act: Act }) {
  const me = state.me.id;
  const recipient = fund.recipients.find((r) => r.id === payout.recipientId);
  const iAmRecipient = recipient?.userId === me;
  const myRole = roleOf(fund, me);
  return (
    <article className={`card payout ${payout.status}`}>
      <div className="row between">
        <h4>
          {vnd(payout.amount)} · {payout.reason}
        </h4>
        <span className="pill">{STATUS[payout.status]}</span>
      </div>
      <p className="muted">
        Chi cho <b>{recipient ? `${recipient.name} (${recipient.account})` : payout.payee}</b> · đề xuất bởi {nameOf(state, payout.proposerId)} ·{" "}
        {when(payout.createdAt)}
      </p>
      <p>
        Đã duyệt {payout.approvals.length}/{fund.rules.quorum}
        {payout.approvals.length > 0 && <>: {payout.approvals.map((a) => nameOf(state, a.userId)).join(", ")}</>}
      </p>
      {payout.recipientConfirmedAt && <p>✔ Người nhận xác nhận lúc {when(payout.recipientConfirmedAt)}</p>}

      <div className="row">
        {payout.status === "pending" && <button onClick={() => act({ action: "approve_payout", payoutId: payout.id })}>Duyệt</button>}
        {(payout.status === "awaiting_recipient" || (iAmRecipient && payout.status === "pending")) && (
          <button onClick={() => act({ action: "confirm_receipt", payoutId: payout.id })}>Người nhận xác nhận</button>
        )}
        {payout.status === "executed" && <Link href={`/proof/${payout.id}`}>Trang minh chứng công khai →</Link>}
      </div>

      {fund.kind === "charity" && payout.status === "executed" && (
        <div className="evidence">
          <p>
            <b>{EVIDENCE[payout.evidenceStatus]}</b>
            {payout.evidenceStatus === "submitted" && ` (${payout.evidenceApprovals.length}/${fund.rules.quorum})`}
          </p>
          {payout.evidence.length > 0 && (
            <ul>
              {payout.evidence.map((e) => (
                <li key={e.id}>
                  <a href={`/api/public/evidence/${e.id}`} target="_blank" rel="noreferrer">
                    {e.fileName}
                  </a>{" "}
                  · {e.note} · <code>{e.sha256.slice(0, 12)}…</code>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            {payout.evidenceStatus === "submitted" && (
              <button onClick={() => act({ action: "approve_evidence", payoutId: payout.id })}>Duyệt minh chứng</button>
            )}
            {payout.evidence.length > 0 && state.me.platformAdmin && (
              <button className="danger" onClick={() => act({ action: "tamper_evidence", payoutId: payout.id })}>
                Giả lập: sửa file hoá đơn trên máy chủ
              </button>
            )}
          </div>
          {(myRole === "organiser" || payout.proposerId === me) && <EvidenceForm payout={payout} act={act} />}
        </div>
      )}
    </article>
  );
}

function RuleChanges({ fund, changes, state, act }: { fund: Fund; changes: RuleChange[]; state: AppState; act: Act }) {
  const [quorum, setQuorum] = useState("1");
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const describe = (c: RuleChange) =>
    c.spec.type === "set_quorum" ? `Đổi quorum thành ${c.spec.quorum}` : `Thêm người nhận "${c.spec.name}" (${c.spec.account})`;
  return (
    <section className="card">
      <h3>Luật quỹ</h3>
      <ul>
        <li>
          Mỗi khoản chi cần <b>{fund.rules.quorum}</b> người duyệt ({fund.kind === "group" ? "thành viên" : "hội đồng giám sát"}). Người tạo lệnh không tự duyệt.
        </li>
        {fund.rules.largeAmount && <li>Khoản trên {vnd(fund.rules.largeAmount)} cần người nhận xác nhận.</li>}
        {fund.rules.evidenceBeforeNext && <li>Đợt chi trước chưa có minh chứng được duyệt thì đợt sau bị khoá.</li>}
        {fund.kind === "charity" && <li>Chỉ chuyển cho người nhận đã đăng ký.</li>}
        <li>Sửa luật cũng cần {fund.rules.quorum} người duyệt. Admin nền tảng không có quyền.</li>
      </ul>

      {changes.length > 0 && (
        <>
          <h4>Đề xuất sửa luật</h4>
          <ul>
            {changes.map((c) => (
              <li key={c.id}>
                {describe(c)} · {nameOf(state, c.proposerId)} · {c.status === "applied" ? "✅ đã áp dụng" : `${c.approvals.length}/${fund.rules.quorum} duyệt`}{" "}
                {c.status === "pending" && (
                  <button className="small" onClick={() => act({ action: "approve_rule", changeId: c.id })}>
                    Duyệt
                  </button>
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

function FundView({ id }: { id: string }) {
  const { state, error, notice, setNotice, act } = useAppState();
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Đang tải…</p>;
  const fund = state.funds.find((f) => f.id === id);
  if (!fund) return <p className="error">Không tìm thấy quỹ.</p>;

  const myRole = roleOf(fund, state.me.id);
  const payouts = state.payouts.filter((p) => p.fundId === fund.id).reverse();
  const organiser = fund.members.find((m) => m.role === "organiser");
  const raised = state.contributions.filter((c) => c.fundId === fund.id).reduce((s, c) => s + c.amount, 0);

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <Link href="/">← Tất cả quỹ</Link>
      <section className="card hero">
        <span className="tag">{fund.kind === "group" ? "Quỹ nhóm" : "Chiến dịch từ thiện"}</span>
        <h2>{fund.name}</h2>
        <p className="muted">{fund.description}</p>
        <p className="big">Số dư: {vnd(fund.balance)}</p>
        {fund.goal && (
          <p>
            Đã góp {vnd(raised)} / mục tiêu {vnd(fund.goal)}
          </p>
        )}
        <p>
          Bạn là: <b>{myRole ? ROLE_LABEL[myRole] : state.me.platformAdmin ? "Admin nền tảng" : "Người xem"}</b>
          {organiser && (
            <>
              {" "}
              · Người kêu gọi: <Link href={`/organiser/${organiser.userId}`}>{nameOf(state, organiser.userId)} (hồ sơ uy tín)</Link>
            </>
          )}
        </p>
        <Contribute fund={fund} act={act} />
      </section>

      <div className="cols">
        <div>
          <h3>Các khoản chi</h3>
          {payouts.length === 0 && <p className="muted">Chưa có khoản chi nào.</p>}
          {payouts.map((p) => (
            <PayoutCard key={p.id} fund={fund} payout={p} state={state} act={act} />
          ))}
        </div>
        <aside>
          <section className="card">
            <h3>{fund.kind === "group" ? "Tạo lệnh chi" : "Đề xuất giải ngân"}</h3>
            <Propose fund={fund} act={act} />
          </section>
          <section className="card warn">
            <h3>Thử vượt quyền</h3>
            <p className="muted">Rút tiền thẳng, không qua duyệt. Ai thử cũng bị chặn, kể cả thủ quỹ, người kêu gọi và admin.</p>
            <Withdraw fund={fund} act={act} />
          </section>
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
          <RuleChanges fund={fund} changes={state.ruleChanges.filter((c) => c.fundId === fund.id)} state={state} act={act} />
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
