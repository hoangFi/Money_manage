"use client";

import { LogTable, RequireLogin, useAppState } from "@/components/app";
import { useT } from "@/lib/i18n";

// Every fund's activity in one place. Each fund page also has its own "Nhật ký" tab.
function Log() {
  const t = useT();
  const { state, error } = useAppState();
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">{t("Đang tải…", "Loading…")}</p>;
  const blocked = state.log.filter((l) => l.outcome === "blocked");
  return (
    <>
      <h1>{t("Nhật ký tất cả quỹ", "Audit log, all funds")}</h1>
      <p className="muted">
        {t(
          `${blocked.length} lần thử vượt quyền đã bị chặn. Mọi hành động, được phép hay bị chặn, đều được ghi lại.`,
          `${blocked.length} unauthorised attempts blocked. Every action, allowed or blocked, is recorded.`
        )}
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
