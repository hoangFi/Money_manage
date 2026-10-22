"use client";

import { useEffect, useState } from "react";
import { newDpopKey, saveToken } from "@/session/simDpop";
import { useT, type Text } from "@/lib/i18n";

type Account = { username: string; name: string; realmRoles: string[]; clientRoles: string[]; adminRoles: string[] };

const GROUPS: [Text, (a: Account) => boolean][] = [
  [["Quỹ nhóm Đà Lạt", "Da Lat group fund"], (a) => a.clientRoles.some((r) => r.startsWith("fund:f-dalat:"))],
  [["Chiến dịch Nậm Cang", "Nam Cang campaign"], (a) => a.clientRoles.some((r) => r.startsWith("fund:f-namcang:"))],
  [["Khác", "Other"], (a) => a.clientRoles.length === 0],
];

// Stand-in for the Tide enclave sign-in page. With a real realm the user signs in on Tide's
// enclave and TideCloak issues the token; here the simulated realm does (src/lib/simtide/realm.ts).
export default function SimTideLogin() {
  const t = useT();
  const [data, setData] = useState<{ realm: string; client: string; accounts: Account[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/sim-tide/accounts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(t("TideCloak giả lập chưa bật (npm run dev:demo).", "Simulated TideCloak is off (npm run dev:demo).")))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  async function signIn(username: string) {
    setBusy(username);
    setError(null);
    try {
      const jkt = await newDpopKey();
      const res = await fetch("/sim-tide/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, jkt }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      saveToken(body.access_token);
      const back = new URLSearchParams(location.search).get("return");
      location.href = back?.startsWith("/") && !back.startsWith("/sim-tide") ? back : "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <section className="card enclave">
      <div className="enclave-head">
        <span className="tide-mark">Tide</span>
        <div>
          <h1>{t("Đăng nhập với Tide", "Sign in with Tide")}</h1>
          <p className="muted">
            Realm <code>{data?.realm ?? "quy-chung"}</code> · client <code>{data?.client ?? "quy-chung-client"}</code>
          </p>
        </div>
      </div>
      <p className="sim-note">
        {t(
          "TideCloak giả lập: chọn tài khoản để nhận token. Với TideCloak thật, bạn đăng nhập trong Tide enclave và vai trò được cấp qua yêu cầu thay đổi IGA có quorum admin duyệt.",
          "Simulated TideCloak: pick an account to get a token. With a real TideCloak you sign in on the Tide enclave, and roles are granted through IGA change requests approved by an admin quorum."
        )}
      </p>
      {error && <p className="error">{error}</p>}
      {data &&
        GROUPS.map(([label, match]) => (
          <div key={label[0]} className="account-group">
            <p className="nav-label">{t(...label)}</p>
            {data.accounts.filter(match).map((a) => (
              <button key={a.username} className="account" disabled={!!busy} onClick={() => signIn(a.username)}>
                <span>
                  <b>{a.name}</b>
                  <small className="muted">@{a.username}</small>
                </span>
                <span className="roles">
                  {[...a.clientRoles, ...a.realmRoles.filter((r) => r === "platform-admin")].map((r) => (
                    <code key={r}>{r}</code>
                  ))}
                </span>
                {busy === a.username && <small>{t("Đang ký token…", "Signing token…")}</small>}
              </button>
            ))}
          </div>
        ))}
    </section>
  );
}
