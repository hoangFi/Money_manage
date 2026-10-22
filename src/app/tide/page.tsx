"use client";

import { useState } from "react";
import { useSession } from "quy-session";
import { Mark, RequireLogin, when } from "@/components/app";

const ROLE_MEANING: Record<string, string> = {
  treasurer: "Thủ quỹ: tạo lệnh chi, duyệt lệnh chi của người khác",
  member: "Thành viên: duyệt hoặc từ chối lệnh chi",
  organiser: "Người kêu gọi: đề xuất giải ngân, nộp minh chứng",
  council: "Hội đồng giám sát: duyệt chi, duyệt minh chứng, đóng chiến dịch",
  recipient: "Người nhận: xác nhận đã nhận tiền",
};

type Probe = { label: string; status?: number; message?: string };

// Shows the caller's TideCloak token and roles, and lets them try the server's access checks.
function TidePanel() {
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
    setProbes((p) => [{ label, status: res?.status, message: body.error ?? (res?.ok ? "Cho phép" : "") }, ...p]);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>TideCloak và quyền</h1>
          <p className="muted">
            Bạn là ai và được làm gì đều do TideCloak quyết định, không phải cơ sở dữ liệu của Quỹ Chung.
            {session.demo && " Đang chạy TideCloak giả lập: cùng loại token, cùng các bước kiểm tra ở server."}
          </p>
        </div>
      </div>

      <div className="cols">
        <section className="card">
          <h3>Token của bạn</h3>
          {session.token ? (
            <table>
              <tbody>
                <tr>
                  <th>Tài khoản</th>
                  <td>
                    {String(claims.name ?? "")} <code>@{String(claims.preferred_username ?? "")}</code>
                  </td>
                </tr>
                <tr>
                  <th>Cấp bởi</th>
                  <td>
                    <code>{String(claims.iss ?? "")}</code>
                  </td>
                </tr>
                <tr>
                  <th>Vai trò realm</th>
                  <td>{realmRoles.map((r) => <code key={r}>{r} </code>)}</td>
                </tr>
                <tr>
                  <th>Vai trò trong quỹ</th>
                  <td>
                    {clientRoles.length === 0 && <span className="muted">Không có (vẫn được góp tiền)</span>}
                    <ul>
                      {clientRoles.map((r) => (
                        <li key={r}>
                          <code>{r}</code> · {ROLE_MEANING[r.split(":")[2]] ?? ""}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
                {adminRoles.length > 0 && (
                  <tr>
                    <th>Quản trị TideCloak</th>
                    <td>{adminRoles.map((r) => <code key={r}>{r} </code>)} · cấp vai trò vẫn cần quorum admin (IGA)</td>
                  </tr>
                )}
                <tr>
                  <th>Gắn với thiết bị (DPoP)</th>
                  <td>
                    <code>cnf.jkt = {String((claims.cnf as any)?.jkt ?? "").slice(0, 16)}…</code>
                  </td>
                </tr>
                <tr>
                  <th>Hết hạn</th>
                  <td>{when(new Date(Number(claims.exp) * 1000).toISOString())}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="muted">Với TideCloak thật, token nằm trong SDK; vai trò hiển thị trong từng quỹ.</p>
          )}
        </section>

        <aside>
          <section className="card">
            <h3>Thử các bước kiểm tra ở server</h3>
            <p className="muted">Mỗi lần gọi API, server kiểm tra chữ ký token, realm, client, hạn dùng, rồi bằng chứng DPoP.</p>
            <div className="stack">
              <button className="ghost" onClick={() => probe("Gọi đúng cách (token + DPoP)", () => session.api("/api/state"))}>
                Gọi đúng cách
              </button>
              <button className="ghost" onClick={() => probe("Không có token", () => fetch("/api/state"))}>
                Gọi không có token
              </button>
              {session.token && (
                <>
                  <button
                    className="ghost"
                    onClick={() =>
                      probe("Token bị đánh cắp, gửi lại dạng Bearer", () =>
                        fetch("/api/state", { headers: { Authorization: `Bearer ${session.token}` } })
                      )
                    }
                  >
                    Dùng lại token bị đánh cắp
                  </button>
                  <button
                    className="ghost"
                    onClick={() =>
                      probe("Token bị sửa (tự thêm vai trò hội đồng)", () => {
                        const [h, p, s] = session.token!.split(".");
                        const payload = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
                        payload.resource_access = { [resource]: { roles: ["fund:f-namcang:council"] } };
                        const forged = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                        return fetch("/api/state", { headers: { Authorization: `DPoP ${h}.${forged}.${s}` } });
                      })
                    }
                  >
                    Tự sửa token để thành hội đồng
                  </button>
                </>
              )}
            </div>
            <ul className="probes">
              {probes.map((p, i) => (
                <li key={i} className={p.status === 200 ? "ok" : "bad"}>
                  <b>
                    <Mark kind={p.status === 200 ? "ok" : "bad"} /> {p.label}
                  </b> · HTTP {p.status ?? "lỗi"} {p.message && `· ${p.message}`}
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h3>Kế hoạch tích hợp</h3>
            <p className="muted">
              Lập bằng Tide MCP (kịch bản <code>iga-admin-governance</code>). Chi tiết: <code>docs/TIDECLOAK.md</code>.
            </p>
            <ul>
              <li>Vai trò quỹ là vai trò TideCloak <code>fund:&lt;quỹ&gt;:&lt;vai trò&gt;</code>, cấp qua IGA có quorum admin.</li>
              <li>Mọi API kiểm tra token, vai trò và DPoP ở server.</li>
              <li>Mỗi lượt duyệt lưu kèm token Tide của người duyệt; lượt duyệt giả không được tính.</li>
              <li>Bước tiếp: chuyển việc chi tiền vào hợp đồng Forseti.</li>
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
