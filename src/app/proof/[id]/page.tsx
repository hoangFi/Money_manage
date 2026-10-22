"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark, vnd, when } from "@/components/app";
import { useT, type Text } from "@/lib/i18n";

const INTEGRITY: Record<string, Text> = {
  ok: ["Khớp mã băm lúc nộp", "Matches the hash recorded at submission"],
  tampered: ["File đã bị sửa sau khi nộp (mã băm không khớp)", "File changed after submission (hash mismatch)"],
  missing: ["File đã bị xoá", "File was deleted"],
};
const SIGNATURE_LABEL: Record<string, Text> = {
  tide: ["Chữ ký Tide hợp lệ", "Valid Tide signature"],
  invalid: ["Chữ ký Tide không hợp lệ (không được tính)", "Invalid Tide signature (not counted)"],
  unsigned: ["Không có chữ ký Tide (không được tính)", "No Tide signature (not counted)"],
};
const KIND: Record<string, Text> = {
  invoice: ["Hoá đơn", "Invoice"],
  photo: ["Ảnh thực tế", "Photo"],
  receipt: ["Biên bản nhận", "Delivery note"],
  other: ["Khác", "Other"],
};

// Public page: no login. Anyone can check where a payout went and who approved it.
export default function ProofPage() {
  const t = useT();
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
  if (!data) return <p className="muted">{t("Đang tải…", "Loading…")}</p>;
  const { fund, payout, transfer } = data;

  return (
    <article className="proof">
      <span className="tag">{t("Trang minh chứng công khai · ai cũng xem được", "Public proof page · anyone can view")}</span>
      <h2>
        {vnd(payout.amount)} · {payout.reason}
      </h2>
      <p className="muted">
        {t("Thuộc", "Fund")}: {fund.name}
      </p>

      <section className="card">
        <h3>{t("Tiền đi đâu", "Where the money went")}</h3>
        <p>
          {t("Người nhận", "Recipient")}: <b>{payout.recipient?.name}</b> {payout.recipient?.account && `· ${payout.recipient.account}`}
        </p>
        {transfer ? (
          <p>
            {t("Chuyển khoản (mock) lúc", "Transfer (mock) at")} {when(transfer.at)} · {t("mã giao dịch", "transaction")} <code>{transfer.id}</code>
          </p>
        ) : (
          <p className="muted">{t("Chưa chuyển tiền.", "Not paid yet.")}</p>
        )}
        {payout.recipientConfirmedAt && (
          <p>
            <Mark kind="ok" /> {t("Người nhận xác nhận đã nhận lúc", "Recipient confirmed receipt at")} {when(payout.recipientConfirmedAt)}
          </p>
        )}
      </section>

      <section className="card">
        <h3>
          {t("Ai đã duyệt", "Who approved")} ({payout.approvals.length}/{fund.quorum})
        </h3>
        <p className="muted">
          {t("Đề xuất bởi", "Proposed by")} {payout.proposer.name} · {when(payout.createdAt)}
        </p>
        <ul>
          {payout.approvals.map((a: any) => (
            <li key={a.name}>
              {a.name} · {when(a.at)} · <Mark kind={a.signature === "tide" ? "lock" : "warn"} /> {t(...SIGNATURE_LABEL[a.signature])}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>{t("Minh chứng", "Evidence")}</h3>
        {payout.evidence.length === 0 && <p className="muted">{t("Chưa có minh chứng.", "No evidence yet.")}</p>}
        {payout.evidence.map((e: any) => (
          <div key={e.id} className={`evidence-item ${e.integrity}`}>
            {e.fileName.match(/\.(png|jpe?g|webp|gif)$/i) && e.integrity !== "missing" && (
              <img src={`/api/public/evidence/${e.id}`} alt={e.note || e.fileName} />
            )}
            <div>
              <p>
                <b>{KIND[e.kind] ? t(...KIND[e.kind]) : e.kind}</b> ·{" "}
                <a href={`/api/public/evidence/${e.id}`} target="_blank" rel="noreferrer">
                  {e.fileName}
                </a>
              </p>
              {e.note && <p>{e.note}</p>}
              <p className="muted">
                {t("Nộp bởi", "Submitted by")} {e.submittedBy} · {when(e.submittedAt)}
              </p>
              <p>
                SHA-256: <code className="hash">{e.sha256}</code>
              </p>
              <p>
                <Mark kind={e.integrity === "ok" ? "ok" : "warn"} /> {t(...INTEGRITY[e.integrity])}
              </p>
            </div>
          </div>
        ))}
        {payout.evidenceStatus === "approved" && (
          <p>
            <Mark kind="ok" /> {t("Minh chứng đã được duyệt bởi", "Evidence approved by")}: {payout.evidenceApprovals.map((a: any) => a.name).join(", ")}
          </p>
        )}
      </section>

      <p>
        <Link href={`/organiser/${payout.proposer.id}`}>
          {t(`Xem hồ sơ uy tín của ${payout.proposer.name} →`, `View ${payout.proposer.name}'s reputation →`)}
        </Link>
      </p>
    </article>
  );
}
