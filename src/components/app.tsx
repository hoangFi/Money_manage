"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "quy-session";
import { useLang, useT, type Text } from "@/lib/i18n";
import type { DB, Fund, User } from "@/lib/fund/types";

export const vnd = (n: number) => `${n.toLocaleString("vi-VN")}đ`;
export const when = (iso?: string) => (iso ? new Date(iso).toLocaleString("vi-VN") : "");

export type AppState = Omit<DB, "users"> & { me: User; users: User[] };

export function nameOf(state: AppState | null, userId: string) {
  return state?.users.find((u) => u.id === userId)?.name ?? userId;
}

/** Fund name and description in the chosen language (English is optional seed data). */
export function fundText(fund: Fund, lang: "vi" | "en") {
  return lang === "en"
    ? { name: fund.nameEn ?? fund.name, description: fund.descriptionEn ?? fund.description }
    : { name: fund.name, description: fund.description };
}

export function roleOf(fund: Fund, userId: string) {
  return fund.members.find((m) => m.userId === userId)?.role;
}

export const ROLE_LABEL: Record<string, Text> = {
  treasurer: ["Thủ quỹ", "Treasurer"],
  member: ["Thành viên", "Member"],
  organiser: ["Người kêu gọi", "Organiser"],
  council: ["Hội đồng giám sát", "Oversight council"],
  recipient: ["Người nhận", "Recipient"],
  donor: ["Nhà hảo tâm", "Donor"],
};

export const ACTION_LABEL: Record<string, Text> = {
  contribute: ["Góp tiền", "Contribute"],
  withdraw: ["Rút thẳng", "Direct withdrawal"],
  propose_payout: ["Tạo lệnh chi", "Create payout"],
  approve_payout: ["Duyệt lệnh chi", "Approve payout"],
  reject_payout: ["Từ chối lệnh chi", "Reject payout"],
  confirm_receipt: ["Người nhận xác nhận", "Recipient confirms"],
  submit_evidence: ["Nộp minh chứng", "Submit evidence"],
  approve_evidence: ["Duyệt minh chứng", "Approve evidence"],
  reject_evidence: ["Từ chối minh chứng", "Reject evidence"],
  propose_rule: ["Đề xuất sửa luật / đóng quỹ", "Propose rule change / closing"],
  approve_rule: ["Duyệt đề xuất", "Approve proposal"],
  reject_rule: ["Từ chối đề xuất", "Reject proposal"],
  refund_expired: ["Hoàn tiền khi hết hạn", "Refund after deadline"],
  refund_to: ["Hoàn tiền về tài khoản khác", "Refund to another account"],
  tamper_evidence: ["Sửa file minh chứng", "Tamper with evidence file"],
  forge_approval: ["Chèn lượt duyệt mạo danh", "Forge an approval"],
};

/** Audit log table; pass the entries already filtered (e.g. to one fund). */
export function LogTable({ state, entries }: { state: AppState; entries: AppState["log"] }) {
  const t = useT();
  if (entries.length === 0) return <p className="muted">{t("Chưa có hoạt động nào.", "No activity yet.")}</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>{t("Lúc", "When")}</th>
          <th>{t("Ai", "Who")}</th>
          <th>{t("Làm gì", "Action")}</th>
          <th>{t("Kết quả", "Result")}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((l) => (
          <tr key={l.id} className={l.outcome}>
            <td>{when(l.at)}</td>
            <td>{nameOf(state, l.actorId)}</td>
            <td>{ACTION_LABEL[l.action] ? t(...ACTION_LABEL[l.action]) : l.action}</td>
            <td>
              <Mark kind={l.outcome === "blocked" ? "bad" : "ok"} />{" "}
              {l.detail}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Notice = { ok: boolean; message: string } | null;

/** Loads /api/state and runs actions, reporting allowed/blocked results as a notice. */
export function useAppState() {
  const session = useSession();
  const { lang } = useLang();
  // Every API call says which language server messages should come back in.
  const api = useCallback(
    (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-lang", lang);
      return session.api(url, { ...init, headers });
    },
    [session, lang]
  );
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const refresh = useCallback(async () => {
    if (!session.authenticated) return;
    const res = await api("/api/state");
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? res.statusText);
    setError(null);
    setState(data);
  }, [session, api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = useCallback(
    async (body: Record<string, unknown> | FormData) => {
      const isForm = body instanceof FormData;
      const res = await api("/api/actions", {
        method: "POST",
        headers: isForm ? undefined : { "Content-Type": "application/json" },
        body: isForm ? body : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({ message: res.statusText }));
      setNotice({ ok: res.ok, message: data.message ?? data.error });
      await refresh();
      return res.ok;
    },
    [api, refresh]
  );

  return { session, state, error, notice, setNotice, refresh, act };
}

/** Result of the last action, as a toast in the bottom-right corner that hides itself. */
export function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(onClose, notice.ok ? 5000 : 9000);
    return () => clearTimeout(t);
    // Only a new notice restarts the timer; onClose is a fresh closure on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);
  if (!notice) return null;
  return (
    <div className={`notice ${notice.ok ? "ok" : "blocked"}`} role="status">
      <strong className="notice-title">
        <Mark kind={notice.ok ? "ok" : "bad"} size={16} /> {notice.ok ? t("Thành công", "Done") : t("Bị chặn", "Blocked")}
      </strong>
      <span>{notice.message}</span>
      <button className="link" onClick={onClose} aria-label={t("Đóng", "Close")}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}

// Small stroke icons (lucide-style) so the shell needs no icon package.
const ICONS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  log: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  panel: "M4 4h16v16H4zM9 4v16",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  key: "M15 7a4 4 0 1 1-3.9 5H8v3H5v-3H3v-3h8.1A4 4 0 0 1 15 7z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  check: "M4 12.5 9 17.5 20 6.5",
  x: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5",
  alert: "M12 4 2.5 20h19zM12 10v4M12 17h.01",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z",
};

const MARK: Record<string, { icon: string; className: string }> = {
  ok: { icon: "check", className: "mark ok" },
  bad: { icon: "x", className: "mark bad" },
  warn: { icon: "alert", className: "mark warn" },
  lock: { icon: "lock", className: "mark lock" },
};

/** Small status icon used inline in text, in place of emoji. */
export function Mark({ kind, size = 14 }: { kind: keyof typeof MARK; size?: number }) {
  const m = MARK[kind];
  return (
    <span className={m.className}>
      <Icon name={m.icon} size={size} />
    </span>
  );
}

const THEME_KEY = "quy-chung-theme";

/** Light by default; the choice is remembered per browser (applied before paint in layout.tsx). */
function ThemeToggle() {
  const t = useT();
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.dataset.theme === "dark"), []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {}
  };
  return (
    <button className="ghost small" onClick={toggle} aria-label={dark ? t("Chuyển sang nền sáng", "Switch to light") : t("Chuyển sang nền tối", "Switch to dark")}>
      <Icon name={dark ? "sun" : "moon"} size={15} /> {dark ? t("Sáng", "Light") : t("Tối", "Dark")}
    </button>
  );
}

/** VI | EN switch. */
function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Ngôn ngữ / Language">
      {(["vi", "en"] as const).map((l) => (
        <button key={l} className={lang === l ? "active" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// Solid (filled) icons; every other icon is drawn as a stroke.
const FILLED_ICONS: Record<string, string> = {
  person: "M12 12.5a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM2.5 22c0-5.2 4.3-8 9.5-8s9.5 2.8 9.5 8z",
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  if (FILLED_ICONS[name]) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d={FILLED_ICONS[name]} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

function NavLink({ href, icon, badge, children }: { href: string; icon?: string; badge?: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link href={href} className={`nav-item${active ? " active" : ""}`}>
      {icon ? <Icon name={icon} /> : <span className="nav-badge">{badge}</span>}
      <span className="nav-text">{children}</span>
    </Link>
  );
}

export function Sidebar() {
  const t = useT();
  const { lang } = useLang();
  const session = useSession();
  const { state } = useAppState();
  const organisers = state
    ? [...new Set(state.funds.flatMap((f) => f.members.filter((m) => m.role === "organiser").map((m) => m.userId)))]
    : [];
  return (
    <aside className="sidebar">
      <Link href="/" className="brand">
        <span className="logo" aria-hidden="true">
          <span className="logo-mark" />
        </span>
        <span>
          <b>Quỹ Chung</b>
          <small>{t("Tiền chung không ai ôm được", "Shared money no one can grab")}</small>
        </span>
      </Link>
      <nav>
        <NavLink href="/" icon="home">
          {t("Tổng quan", "Overview")}
        </NavLink>
        <NavLink href="/tide" icon="person">
          {t("TideCloak và quyền", "TideCloak & roles")}
        </NavLink>
        {state && (
          <>
            <hr />
            <p className="nav-label">{t("Quỹ nhóm", "Group funds")}</p>
            {state.funds
              .filter((f) => f.kind === "group")
              .map((f) => (
                <NavLink key={f.id} href={`/funds/${f.id}`} badge={fundText(f, lang).name[0]}>
                  {fundText(f, lang).name}
                </NavLink>
              ))}
            <p className="nav-label">{t("Chiến dịch từ thiện", "Charity campaigns")}</p>
            {state.funds
              .filter((f) => f.kind === "charity")
              .map((f) => (
                <NavLink key={f.id} href={`/funds/${f.id}`} badge={fundText(f, lang).name[0]}>
                  {fundText(f, lang).name}
                </NavLink>
              ))}
            <hr />
            {organisers.map((id) => (
              <NavLink key={id} href={`/organiser/${id}`} icon="user">
                {t("Uy tín", "Reputation")}: {nameOf(state, id)}
              </NavLink>
            ))}
          </>
        )}
      </nav>
      <div className="sidebar-foot">
        <Icon name="shield" size={16} />
        <span>
          {t("Bảo vệ bởi TideCloak", "Protected by TideCloak")}
          {session.demo && t(" (giả lập)", " (simulated)")}
        </span>
      </div>
    </aside>
  );
}

const PAGE_TITLE: [string, Text][] = [
  ["/tide", ["TideCloak và quyền", "TideCloak & roles"]],
  ["/sim-tide", ["Đăng nhập với Tide", "Sign in with Tide"]],
  ["/log", ["Nhật ký", "Audit log"]],
  ["/funds/", ["Quỹ", "Fund"]],
  ["/proof/", ["Minh chứng", "Proof"]],
  ["/organiser/", ["Hồ sơ uy tín", "Reputation"]],
];

export function Header() {
  const t = useT();
  const session = useSession();
  const path = usePathname();
  const title = t(...(PAGE_TITLE.find(([p]) => path.startsWith(p))?.[1] ?? (["Tổng quan", "Overview"] as const)));
  return (
    <header className="top">
      <div className="crumbs">
        <span className="muted">Quỹ Chung</span>
        <span className="muted">›</span>
        <span className="crumb">
          <Icon name="home" size={16} /> {title}
        </span>
      </div>
      <div className="who">
        <LangToggle />
        <ThemeToggle />
        {session.demo && (
          <button
            className="ghost small"
            onClick={async () => {
              if (!confirm(t("Xoá toàn bộ dữ liệu demo và nạp lại dữ liệu mẫu?", "Erase all demo data and reload the sample data?"))) return;
              await fetch("/api/demo", { method: "POST" });
              location.reload();
            }}
          >
            <Icon name="refresh" size={15} /> {t("Đặt lại dữ liệu", "Reset data")}
          </button>
        )}
        {session.authenticated ? (
          <>
            <Link href="/tide" className="chip" title={t("Xem token và vai trò TideCloak", "View your TideCloak token and roles")}>
              <span className="avatar" aria-hidden="true">
                {(session.username ?? "?").charAt(0).toUpperCase()}
              </span>
              {session.username}
            </Link>
            <button className="ghost small" onClick={session.logout}>
              {session.demo ? t("Đổi tài khoản", "Switch account") : t("Đăng xuất", "Sign out")}
            </button>
          </>
        ) : (
          <button onClick={session.login}>{t("Đăng nhập với Tide", "Sign in with Tide")}</button>
        )}
      </div>
    </header>
  );
}

/** Wraps a page that needs a signed-in user. */
export function RequireLogin({ children }: { children: React.ReactNode }) {
  const t = useT();
  const session = useSession();
  if (!session.ready) return <p className="muted">{t("Đang tải…", "Loading…")}</p>;
  if (!session.authenticated) {
    return (
      <section className="card center signin">
        <span className="signin-icon">
          <Icon name="person" size={26} />
        </span>
        <h2>{t("Vui lòng đăng nhập", "Please sign in")}</h2>
        <p className="muted">{t("Đăng nhập để xem và quản lý quỹ của bạn.", "Sign in to view and manage your funds.")}</p>
        <button onClick={session.login}>{t("Đăng nhập với Tide", "Sign in with Tide")}</button>
      </section>
    );
  }
  return <>{children}</>;
}
