"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark, vnd, when } from "@/components/app";
import { useT } from "@/lib/i18n";

// Public reputation profile. Built only from quorum-approved payouts and evidence, so it cannot be self-declared.
export default function OrganiserPage() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/organisers/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setP(d);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!p) return <p className="muted">{t("Đang tải…", "Loading…")}</p>;
  const rate = p.payouts ? Math.round((p.payoutsWithEvidence / p.payouts) * 100) : 0;

  return (
    <article>
      <span className="tag">{t("Hồ sơ uy tín · công khai", "Reputation · public")}</span>
      <h2>{p.user.name}</h2>
      <div className="stats">
        <div className="card">
          <span className="muted">{t("Chiến dịch", "Campaigns")}</span>
          <b>{p.campaigns.length}</b>
        </div>
        <div className="card">
          <span className="muted">{t("Tổng đã giải ngân", "Total disbursed")}</span>
          <b>{vnd(p.disbursed)}</b>
        </div>
        <div className="card">
          <span className="muted">{t("Khoản chi có minh chứng được duyệt", "Payouts with approved evidence")}</span>
          <b>
            {p.payouts ? `${rate}%` : "–"} ({p.payoutsWithEvidence}/{p.payouts})
          </b>
        </div>
        <div className="card">
          <span className="muted">{t("Minh chứng bị sửa sau khi nộp", "Evidence altered after submission")}</span>
          <b>{p.tamperedEvidence}</b>
        </div>
      </div>
      <p className="muted">
        {t(
          "Các chỉ số này chỉ tính từ khoản chi đã đủ người duyệt và minh chứng đã được hội đồng duyệt. Người kêu gọi không tự khai được.",
          "These figures only count quorum-approved payouts and council-approved evidence. Organisers cannot self-declare them."
        )}
      </p>

      <h3>{t("Lịch sử giải ngân", "Disbursement history")}</h3>
      <table>
        <thead>
          <tr>
            <th>{t("Lúc", "When")}</th>
            <th>{t("Khoản chi", "Payout")}</th>
            <th>{t("Số tiền", "Amount")}</th>
            <th>{t("Minh chứng", "Evidence")}</th>
          </tr>
        </thead>
        <tbody>
          {p.history.map((h: any) => (
            <tr key={h.id}>
              <td>{when(h.executedAt)}</td>
              <td>
                <Link href={`/proof/${h.id}`}>{h.reason}</Link>
              </td>
              <td>{vnd(h.amount)}</td>
              <td>
                {h.evidenceStatus === "approved" ? (
                  <>
                    <Mark kind="ok" /> {t("Đã duyệt", "Approved")}
                  </>
                ) : h.evidenceStatus === "submitted" ? (
                  t("Chờ duyệt", "Pending")
                ) : (
                  <>
                    <Mark kind="bad" /> {t("Chưa có", "None")}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
