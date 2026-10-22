"use client";

import { LogTable, RequireLogin, useAppState } from "@/components/app";

// Every fund's activity in one place. Each fund page also has its own "Nhật ký" tab.
function Log() {
  const { state, error } = useAppState();
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Đang tải…</p>;
  const blocked = state.log.filter((l) => l.outcome === "blocked");
  return (
    <>
      <h1>Nhật ký tất cả quỹ</h1>
      <p className="muted">
        {blocked.length} lần thử vượt quyền đã bị chặn. Mọi hành động, được phép hay bị chặn, đều được ghi lại.
      </p>
      <LogTable state={state} entries={state.log} />
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
