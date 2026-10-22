"use client";

import { nameOf, RequireLogin, useAppState, when } from "@/components/app";

const ACTION_LABEL: Record<string, string> = {
  contribute: "Góp tiền",
  withdraw: "Rút thẳng",
  propose_payout: "Tạo lệnh chi",
  approve_payout: "Duyệt lệnh chi",
  confirm_receipt: "Người nhận xác nhận",
  submit_evidence: "Nộp minh chứng",
  approve_evidence: "Duyệt minh chứng",
  propose_rule: "Đề xuất sửa luật",
  approve_rule: "Duyệt sửa luật",
  tamper_evidence: "Sửa file minh chứng",
};

function Log() {
  const { state, error } = useAppState();
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Đang tải…</p>;
  const blocked = state.log.filter((l) => l.outcome === "blocked");
  return (
    <>
      <h2>Nhật ký</h2>
      <p className="muted">
        {blocked.length} lần thử vượt quyền đã bị chặn. Mọi hành động, được phép hay bị chặn, đều được ghi lại.
      </p>
      <table>
        <thead>
          <tr>
            <th>Lúc</th>
            <th>Ai</th>
            <th>Làm gì</th>
            <th>Kết quả</th>
          </tr>
        </thead>
        <tbody>
          {state.log.map((l) => (
            <tr key={l.id} className={l.outcome}>
              <td>{when(l.at)}</td>
              <td>{nameOf(state, l.actorId)}</td>
              <td>{ACTION_LABEL[l.action] ?? l.action}</td>
              <td>
                {l.outcome === "blocked" ? "⛔ " : "✅ "}
                {l.detail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function LogPage() {
  return (
    <RequireLogin>
      <Log />
    </RequireLogin>
  );
}
