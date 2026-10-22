"use client";

import Link from "next/link";
import { AppState, fundText, Mark, nameOf, NoticeBar, RequireLogin, ROLE_LABEL, roleOf, useAppState, vnd, when } from "@/components/app";
import { useLang, useT } from "@/lib/i18n";

type T = ReturnType<typeof useT>;

/** What is waiting on the current user: approvals, evidence reviews, receipt confirmations. */
function todo(state: AppState, t: T, lang: "vi" | "en") {
  const me = state.me.id;
  const items: { fundId: string; label: string; detail: string }[] = [];
  const isApprover = (fundId: string) => {
    const fund = state.funds.find((f) => f.id === fundId)!;
    const role = roleOf(fund, me);
    return fund.kind === "group" ? role === "treasurer" || role === "member" : role === "council";
  };
  const voted = (lists: ({ userId: string }[] | undefined)[]) => lists.some((l) => l?.some((v) => v.userId === me));
  for (const p of state.payouts) {
    const fund = state.funds.find((f) => f.id === p.fundId)!;
    if (isApprover(p.fundId) && p.status === "pending" && p.proposerId !== me && !voted([p.approvals, p.rejections])) {
      items.push({ fundId: p.fundId, label: t(`Duyệt lệnh chi ${vnd(p.amount)}`, `Approve payout of ${vnd(p.amount)}`), detail: p.reason });
    }
    if (isApprover(p.fundId) && p.evidenceStatus === "submitted" && !voted([p.evidenceApprovals, p.evidenceRejections])) {
      items.push({ fundId: p.fundId, label: t("Duyệt minh chứng", "Review evidence"), detail: p.reason });
    }
    const recipient = fund.recipients.find((r) => r.id === p.recipientId);
    if (p.status === "awaiting_recipient" && recipient?.userId === me) {
      items.push({ fundId: p.fundId, label: t(`Xác nhận đã nhận ${vnd(p.amount)}`, `Confirm you received ${vnd(p.amount)}`), detail: p.reason });
    }
  }
  for (const c of state.ruleChanges) {
    if (isApprover(c.fundId) && c.status === "pending" && !voted([c.approvals, c.rejections])) {
      const label =
        c.spec.type === "close_refund"
          ? t("Duyệt đóng chiến dịch và hoàn tiền", "Approve closing and refunding the campaign")
          : t("Duyệt đề xuất sửa luật", "Approve a rule change");
      items.push({ fundId: c.fundId, label, detail: fundText(state.funds.find((f) => f.id === c.fundId)!, lang).name });
    }
  }
  return items;
}

function Home() {
  const t = useT();
  const { lang } = useLang();
  const { state, error, notice, setNotice, refresh } = useAppState();
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">{t("Đang tải…", "Loading…")}</p>;
  const groups = state.funds.filter((f) => f.kind === "group");
  const charities = state.funds.filter((f) => f.kind === "charity");
  const total = state.funds.reduce((s, f) => s + f.balance, 0);
  const pending = state.payouts.filter((p) => p.status === "pending" || p.status === "awaiting_recipient").length;
  const blocked = state.log.filter((l) => l.outcome === "blocked");
  const tasks = todo(state, t, lang);
  const myRole = (f: (typeof state.funds)[number]) => roleOf(f, state.me.id);

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="page-head">
        <div>
          <h1>{t("Tổng quan", "Overview")}</h1>
          <p className="muted">
            {t(
              `Xin chào ${state.me.name} · ${tasks.length} việc cần bạn · ${pending} lệnh chi đang chờ · ${state.funds.length} quỹ`,
              `Hello ${state.me.name} · ${tasks.length} tasks for you · ${pending} payouts pending · ${state.funds.length} funds`
            )}
          </p>
        </div>
        <button className="ghost" onClick={refresh}>
          {t("Tải lại", "Refresh")}
        </button>
      </div>

      <div className="dash">
        <section className="card tint">
          <p className="eyebrow">{t("Tổng quan chung", "At a glance")}</p>
          <div className="kpi">
            <b>{vnd(total)}</b>
            <span>{t("đang nằm trong các quỹ, không ai rút được một mình", "held in the funds; no one can withdraw it alone")}</span>
          </div>
          <div className="mini-stats">
            <div>
              <b>{state.funds.length}</b>
              <span>{t("Quỹ", "Funds")}</span>
            </div>
            <div>
              <b>{state.payouts.filter((p) => p.status === "executed").length}</b>
              <span>{t("Khoản đã chi", "Payouts made")}</span>
            </div>
            <div>
              <b>{state.users.length}</b>
              <span>{t("Thành viên", "Members")}</span>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">{t("Cần bạn xử lý", "Waiting on you")}</p>
          <div className="kpi">
            <b>{tasks.length}</b>
            <span>{t("việc", "tasks")}</span>
          </div>
          {tasks.length === 0 && <p className="muted">{t("Không có việc nào chờ bạn.", "Nothing is waiting on you.")}</p>}
          <div className="stack">
            {tasks.slice(0, 4).map((task, i) => (
              <Link key={i} href={`/funds/${task.fundId}`} className="task">
                <span className="dot" />
                <span>
                  <b>{task.label}</b>
                  <small className="muted">{task.detail}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="row between">
            <p className="eyebrow">{t("Nhật ký", "Audit log")}</p>
            <Link href="/log" className="btn small">
              {t("Mở nhật ký →", "Open log →")}
            </Link>
          </div>
          <div className="kpi">
            <b className="bad">{blocked.length}</b>
            <span>{t("lần thử vượt quyền bị chặn", "unauthorised attempts blocked")}</span>
          </div>
          <div className="stack">
            {blocked.slice(0, 3).map((l) => {
              const fund = state.funds.find((f) => f.id === l.fundId);
              return (
                <Link key={l.id} href={fund ? `/funds/${fund.id}#log` : "/log"} className="log-line">
                  <Mark kind="bad" /> <b>{nameOf(state, l.actorId)}</b> · {fund ? fundText(fund, lang).name : ""}{" "}
                  <small className="muted">{when(l.at)}</small>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <h2>{t("Quỹ nhóm", "Group funds")}</h2>
      <div className="grid">
        {groups.map((f) => (
          <Link key={f.id} href={`/funds/${f.id}`} className="card fund">
            <span className="tag">
              {t(`Quỹ nhóm · cần ${f.rules.quorum}/${f.members.length} duyệt`, `Group fund · ${f.rules.quorum} of ${f.members.length} approve`)}
            </span>
            <h3>{fundText(f, lang).name}</h3>
            <p className="muted">{fundText(f, lang).description}</p>
            <p className="big">{vnd(f.balance)}</p>
            {myRole(f) && <span className="pill">{t(...ROLE_LABEL[myRole(f)!])}</span>}
          </Link>
        ))}
      </div>

      <h2>{t("Chiến dịch từ thiện", "Charity campaigns")}</h2>
      <div className="grid">
        {charities.map((f) => {
          const raised = state.contributions.filter((c) => c.fundId === f.id).reduce((s, c) => s + c.amount, 0);
          const pct = f.goal ? Math.min(100, Math.round((raised / f.goal) * 100)) : 0;
          const council = f.members.filter((m) => m.role === "council").length;
          return (
            <Link key={f.id} href={`/funds/${f.id}`} className="card fund">
              <span className="tag">
                {t(`Từ thiện · hội đồng ${f.rules.quorum}/${council} duyệt`, `Charity · ${f.rules.quorum} of ${council} council approve`)}
              </span>
              <h3>{fundText(f, lang).name}</h3>
              <p className="muted">{fundText(f, lang).description}</p>
              <div className="bar" aria-label={t(`Đã góp ${pct}%`, `${pct}% raised`)}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <p>
                {t("Đã góp", "Raised")} <b>{vnd(raised)}</b> / {vnd(f.goal ?? 0)} · {t("Số dư", "Balance")} {vnd(f.balance)}
              </p>
              {myRole(f) && <span className="pill">{t(...ROLE_LABEL[myRole(f)!])}</span>}
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <RequireLogin>
      <Home />
    </RequireLogin>
  );
}
