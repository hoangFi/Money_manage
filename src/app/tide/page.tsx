"use client";

import { useState } from "react";
import { useSession } from "quy-session";
import { Mark, RequireLogin, when } from "@/components/app";
import { useT, type Text } from "@/lib/i18n";

const ROLE_MEANING: Record<string, Text> = {
  treasurer: ["Thủ quỹ: tạo lệnh chi, duyệt lệnh chi của người khác", "Treasurer: create payouts, approve others' payouts"],
  member: ["Thành viên: tạo, duyệt hoặc từ chối lệnh chi", "Member: create, approve or reject payouts"],
  organiser: ["Người kêu gọi: đề xuất giải ngân, nộp minh chứng", "Organiser: propose disbursements, submit evidence"],
  council: ["Hội đồng giám sát: duyệt chi, duyệt minh chứng, đóng chiến dịch", "Oversight council: approve payouts and evidence, close campaigns"],
  recipient: ["Người nhận: xác nhận đã nhận tiền", "Recipient: confirm money received"],
};

type Probe = { label: string; status?: number; message?: string };

// Shows the caller's TideCloak token and roles, and lets them try the server's access checks.
function TidePanel() {
  const t = useT();
  const session = useSession();
  const [probes, setProbes] = useState<Probe[]>([]);
  const claims = session.claims ?? {};
  const realmRoles: string[] = (claims.realm_access as any)?.roles ?? [];
  const resource = (claims.azp as string) ?? "quy-chung-client";
  const clientRoles: string[] = (claims.resource_access as any)?.[resource]?.roles ?? [];
  const adminRoles: string[] = (claims.resource_access as any)?.["realm-management"]?.roles ?? [];

  async function probe(label: string, init: () => Promise<Response>) {
    const res = await init().catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    setProbes((p) => [{ label, status: res?.status, message: body.error ?? (res?.ok ? t("Cho phép", "Allowed") : "") }, ...p]);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("TideCloak và quyền", "TideCloak & roles")}</h1>
          <p className="muted">
            {t(
              "Bạn là ai và được làm gì đều do TideCloak quyết định, không phải cơ sở dữ liệu của Quỹ Chung.",
              "Who you are and what you may do is decided by TideCloak, not by Quỹ Chung's database."
            )}
            {session.demo &&
              t(
                " Đang chạy TideCloak giả lập: cùng loại token, cùng các bước kiểm tra ở server.",
                " Running a simulated TideCloak: same kind of token, same server-side checks."
              )}
          </p>
        </div>
      </div>

      <div className="cols">
        <section className="card">
          <h3>{t("Token của bạn", "Your token")}</h3>
          {session.token ? (
            <table>
              <tbody>
                <tr>
                  <th>{t("Tài khoản", "Account")}</th>
                  <td>
                    {String(claims.name ?? "")} <code>@{String(claims.preferred_username ?? "")}</code>
                  </td>
                </tr>
                <tr>
                  <th>{t("Cấp bởi", "Issued by")}</th>
                  <td>
                    <code>{String(claims.iss ?? "")}</code>
                  </td>
                </tr>
                <tr>
                  <th>{t("Vai trò realm", "Realm roles")}</th>
                  <td>{realmRoles.map((r) => <code key={r}>{r} </code>)}</td>
                </tr>
                <tr>
                  <th>{t("Vai trò trong quỹ", "Fund roles")}</th>
                  <td>
                    {clientRoles.length === 0 && <span className="muted">{t("Không có (vẫn được góp tiền)", "None (can still contribute)")}</span>}
                    <ul>
                      {clientRoles.map((r) => (
                        <li key={r}>
                          <code>{r}</code> · {ROLE_MEANING[r.split(":")[2]] ? t(...ROLE_MEANING[r.split(":")[2]]) : ""}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
                {adminRoles.length > 0 && (
                  <tr>
                    <th>{t("Quản trị TideCloak", "TideCloak admin")}</th>
                    <td>{adminRoles.map((r) => <code key={r}>{r} </code>)} · {t("cấp vai trò vẫn cần quorum admin (IGA)", "role grants still need an admin quorum (IGA)")}</td>
                  </tr>
                )}
                <tr>
                  <th>{t("Gắn với thiết bị (DPoP)", "Bound to device (DPoP)")}</th>
                  <td>
                    <code>cnf.jkt = {String((claims.cnf as any)?.jkt ?? "").slice(0, 16)}…</code>
                  </td>
                </tr>
                <tr>
                  <th>{t("Hết hạn", "Expires")}</th>
                  <td>{when(new Date(Number(claims.exp) * 1000).toISOString())}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">
              {t("Với TideCloak thật, token nằm trong SDK; vai trò hiển thị trong từng quỹ.", "With a real TideCloak the token stays in the SDK; roles show on each fund.")}
            </p>
          )}
        </section>

        <aside>
          <section className="card">
            <h3>{t("Thử các bước kiểm tra ở server", "Try the server-side checks")}</h3>
            <p className="muted">
              {t(
                "Mỗi lần gọi API, server kiểm tra chữ ký token, realm, client, hạn dùng, rồi bằng chứng DPoP.",
                "On every API call the server checks the token signature, realm, client and expiry, then the DPoP proof."
              )}
            </p>
            <div className="stack">
              <button className="ghost" onClick={() => probe(t("Gọi đúng cách (token + DPoP)", "Proper call (token + DPoP)"), () => session.api("/api/state"))}>
                {t("Gọi đúng cách", "Proper call")}
              </button>
              <button className="ghost" onClick={() => probe(t("Không có token", "No token"), () => fetch("/api/state"))}>
                {t("Gọi không có token", "Call without a token")}
              </button>
              {session.token && (
                <>
                  <button
                    className="ghost"
                    onClick={() =>
                      probe(t("Token bị đánh cắp, gửi lại dạng Bearer", "Stolen token replayed as Bearer"), () =>
                        fetch("/api/state", { headers: { Authorization: `Bearer ${session.token}` } })
                      )
                    }
                  >
                    {t("Dùng lại token bị đánh cắp", "Replay a stolen token")}
                  </button>
                  <button
                    className="ghost"
                    onClick={() =>
                      probe(t("Token bị sửa (tự thêm vai trò hội đồng)", "Edited token (added council role)"), () => {
                        const [h, p, s] = session.token!.split(".");
                        const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
                        payload.resource_access = { [resource]: { roles: ["fund:f-namcang:council"] } };
                        const forged = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                        return fetch("/api/state", { headers: { Authorization: `DPoP ${h}.${forged}.${s}` } });
                      })
                    }
                  >
                    {t("Tự sửa token để thành hội đồng", "Edit token to become council")}
                  </button>
                </>
              )}
            </div>
            <ul className="probes">
              {probes.map((p, i) => (
                <li key={i} className={p.status === 200 ? "ok" : "bad"}>
                  <b>
                    <Mark kind={p.status === 200 ? "ok" : "bad"} /> {p.label}
                  </b> · HTTP {p.status ?? t("lỗi", "error")} {p.message && `· ${p.message}`}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h3>{t("Kế hoạch tích hợp", "Integration plan")}</h3>
            <p className="muted">
              Lập bằng Tide MCP (kịch bản <code>iga-admin-governance</code>). Chi tiết: <code>docs/TIDECLOAK.md</code>.
            </p>
            <ul>
              <li>
                {t("Vai trò quỹ là vai trò TideCloak", "Fund roles are TideCloak roles")} <code>fund:&lt;fund&gt;:&lt;role&gt;</code>,{" "}
                {t("cấp qua IGA có quorum admin.", "granted through IGA with an admin quorum.")}
              </li>
              <li>{t("Mọi API kiểm tra token, vai trò và DPoP ở server.", "Every API checks the token, roles and DPoP on the server.")}</li>
              <li>
                {t(
                  "Mỗi lượt duyệt lưu kèm token Tide của người duyệt; lượt duyệt giả không được tính.",
                  "Each approval is stored with the approver's Tide token; forged approvals are not counted."
                )}
              </li>
              <li>{t("Bước tiếp: chuyển việc chi tiền vào hợp đồng Forseti.", "Next: move payout execution into a Forseti contract.")}</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}

export default function TidePage() {
  return (
    <RequireLogin>
      <TidePanel />
    </RequireLogin>
  );
}
