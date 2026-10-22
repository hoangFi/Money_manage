"use client";

import { useEffect, useState } from "react";
import { newDpopKey, saveToken } from "@/session/simDpop";

type Account = { username: string; name: string; realmRoles: string[]; clientRoles: string[]; adminRoles: string[] };

const GROUPS: [string, (a: Account) => boolean][] = [
  ["Quỹ nhóm Đà Lạt", (a) => a.clientRoles.some((r) => r.startsWith("fund:f-dalat:"))],
  ["Chiến dịch Nậm Cang", (a) => a.clientRoles.some((r) => r.startsWith("fund:f-namcang:"))],
  ["Khác", (a) => a.clientRoles.length === 0],
];

// Stand-in for the Tide enclave sign-in page. With a real realm the user signs in on Tide's
// enclave and TideCloak issues the token; here the simulated realm does (src/lib/simtide/realm.ts).
export default function SimTideLogin() {
  const [data, setData] = useState<{ realm: string; client: string; accounts: Account[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/sim-tide/accounts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("TideCloak giả lập chưa bật (npm run dev:demo)."))))
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
          <h1>Đăng nhập với Tide</h1>
          <p className="muted">
            Realm <code>{data?.realm ?? "quy-chung"}</code> · client <code>{data?.client ?? "quy-chung-client"}</code>
          </p>
        </div>
      </div>
      <p className="sim-note">
        TideCloak giả lập: chọn tài khoản để nhận token. Với TideCloak thật, bạn đăng nhập trong Tide enclave và vai trò được
        cấp qua yêu cầu thay đổi IGA có quorum admin duyệt.
      </p>
      {error && <p className="error">{error}</p>}
      {data &&
        GROUPS.map(([label, match]) => (
          <div key={label} className="account-group">
            <p className="nav-label">{label}</p>
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
                {busy === a.username && <small>Đang ký token…</small>}
              </button>
            ))}
          </div>
        ))}
    </section>
  );
}
