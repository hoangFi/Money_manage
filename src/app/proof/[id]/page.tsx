"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark, vnd, when } from "@/components/app";

const INTEGRITY = {
  ok: "Khớp mã băm lúc nộp",
  tampered: "File đã bị sửa sau khi nộp (mã băm không khớp)",
  missing: "File đã bị xoá",
};
const SIGNATURE_LABEL: Record<string, string> = {
  tide: "Chữ ký Tide hợp lệ",
  invalid: "Chữ ký Tide không hợp lệ (không được tính)",
  unsigned: "Không có chữ ký Tide (không được tính)",
};
const KIND: Record<string, string> = { invoice: "Hoá đơn", photo: "Ảnh thực tế", receipt: "Biên bản nhận", other: "Khác" };

// Public page: no login. Anyone can check where a payout went and who approved it.
export default function ProofPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/payouts/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Đang tải…</p>;
  const { fund, payout, transfer } = data;

  return (
    <article className="proof">
      <span className="tag">Trang minh chứng công khai · ai cũng xem được</span>
      <h2>
        {vnd(payout.amount)} · {payout.reason}
      </h2>
      <p className="muted">Thuộc: {fund.name}</p>

      <section className="card">
        <h3>Tiền đi đâu</h3>
        <p>
          Người nhận: <b>{payout.recipient?.name}</b> {payout.recipient?.account && `· ${payout.recipient.account}`}
        </p>
        {transfer ? (
          <p>
            Chuyển khoản (mock) lúc {when(transfer.at)} · mã giao dịch <code>{transfer.id}</code>
          </p>
        ) : (
          <p className="muted">Chưa chuyển tiền.</p>
        )}
        {payout.recipientConfirmedAt && (
          <p>
            <Mark kind="ok" /> Người nhận xác nhận đã nhận lúc {when(payout.recipientConfirmedAt)}
          </p>
        )}
      </section>

      <section className="card">
        <h3>
          Ai đã duyệt ({payout.approvals.length}/{fund.quorum})
        </h3>
        <p className="muted">Đề xuất bởi {payout.proposer.name} lúc {when(payout.createdAt)}</p>
        <ul>
          {payout.approvals.map((a: any) => (
            <li key={a.name}>
              {a.name} · {when(a.at)} · <Mark kind={a.signature === "tide" ? "lock" : "warn"} /> {SIGNATURE_LABEL[a.signature]}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Minh chứng</h3>
        {payout.evidence.length === 0 && <p className="muted">Chưa có minh chứng.</p>}
        {payout.evidence.map((e: any) => (
          <div key={e.id} className={`evidence-item ${e.integrity}`}>
            {e.fileName.match(/\.(png|jpe?g|webp|gif)$/i) && e.integrity !== "missing" && (
              <img src={`/api/public/evidence/${e.id}`} alt={e.note || e.fileName} />
            )}
            <div>
              <p>
                <b>{KIND[e.kind] ?? e.kind}</b> ·{" "}
                <a href={`/api/public/evidence/${e.id}`} target="_blank" rel="noreferrer">
                  {e.fileName}
                </a>
              </p>
              {e.note && <p>{e.note}</p>}
              <p className="muted">
                Nộp bởi {e.submittedBy} lúc {when(e.submittedAt)}
              </p>
              <p>
                SHA-256: <code className="hash">{e.sha256}</code>
              </p>
              <p>
                <Mark kind={e.integrity === "ok" ? "ok" : "warn"} /> {INTEGRITY[e.integrity as keyof typeof INTEGRITY]}
              </p>
            </div>
          </div>
        ))}
        {payout.evidenceStatus === "approved" && (
          <p>
            <Mark kind="ok" /> Hội đồng đã duyệt minh chứng: {payout.evidenceApprovals.map((a: any) => a.name).join(", ")}
          </p>
        )}
      </section>

      <p>
        <Link href={`/organiser/${payout.proposer.id}`}>Xem hồ sơ uy tín của {payout.proposer.name} →</Link>
      </p>
    </article>
  );
}
