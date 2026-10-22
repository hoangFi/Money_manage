"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Mark, vnd, when } from "@/components/app";

// Public reputation profile. Built only from quorum-approved payouts and evidence, so it cannot be self-declared.
export default function OrganiserPage() {
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
  if (!p) return <p className="muted">Đang tải…</p>;
  const rate = p.payouts ? Math.round((p.payoutsWithEvidence / p.payouts) * 100) : 0;

  return (
    <article>
      <span className="tag">Hồ sơ uy tín · công khai</span>
      <h2>{p.user.name}</h2>
      <div className="stats">
        <div className="card">
          <span className="muted">Chiến dịch</span>
          <b>{p.campaigns.length}</b>
        </div>
        <div className="card">
          <span className="muted">Tổng đã giải ngân</span>
          <b>{vnd(p.disbursed)}</b>
        </div>
        <div className="card">
          <span className="muted">Khoản chi có minh chứng được duyệt</span>
          <b>
            {p.payouts ? `${rate}%` : "–"} ({p.payoutsWithEvidence}/{p.payouts})
          </b>
        </div>
        <div className="card">
          <span className="muted">Minh chứng bị sửa sau khi nộp</span>
          <b>{p.tamperedEvidence}</b>
        </div>
      </div>
      <p className="muted">Các chỉ số này chỉ tính từ khoản chi đã đủ người duyệt và minh chứng đã được hội đồng duyệt. Người kêu gọi không tự khai được.</p>

      <h3>Lịch sử giải ngân</h3>
      <table>
        <thead>
          <tr>
            <th>Lúc</th>
            <th>Khoản chi</th>
            <th>Số tiền</th>
            <th>Minh chứng</th>
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
                    <Mark kind="ok" /> Đã duyệt
                  </>
                ) : h.evidenceStatus === "submitted" ? (
                  "Chờ duyệt"
                ) : (
                  <>
                    <Mark kind="bad" /> Chưa có
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
