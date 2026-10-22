"use client";

import Link from "next/link";
import { AppState, nameOf, NoticeBar, RequireLogin, ROLE_LABEL, roleOf, useAppState, vnd, when } from "@/components/app";
import type { Payout } from "@/lib/fund/types";

/** What is waiting on the current user: approvals, evidence reviews, receipt confirmations. */
function todo(state: AppState) {
  const me = state.me.id;
  const items: { payout: Payout; label: string }[] = [];
  for (const p of state.payouts) {
    const fund = state.funds.find((f) => f.id === p.fundId)!;
    const role = roleOf(fund, me);
    const approver = fund.kind === "group" ? role === "treasurer" || role === "member" : role === "council";
    if (approver && p.status === "pending" && p.proposerId !== me && !p.approvals.some((a) => a.userId === me)) {
      items.push({ payout: p, label: `Duyệt lệnh chi ${vnd(p.amount)}` });
    }
    if (approver && p.evidenceStatus === "submitted" && !p.evidenceApprovals.some((a) => a.userId === me)) {
      items.push({ payout: p, label: "Duyệt minh chứng" });
    }
    const recipient = fund.recipients.find((r) => r.id === p.recipientId);
    if (p.status === "awaiting_recipient" && recipient?.userId === me) {
      items.push({ payout: p, label: `Xác nhận đã nhận ${vnd(p.amount)}` });
    }
  }
  return items;
}

function Home() {
  const { state, error, notice, setNotice, refresh } = useAppState();
  if (error) return <p className="error">{error}</p>;
  if (!state) return <p className="muted">Đang tải…</p>;
  const groups = state.funds.filter((f) => f.kind === "group");
  const charities = state.funds.filter((f) => f.kind === "charity");
  const total = state.funds.reduce((s, f) => s + f.balance, 0);
  const pending = state.payouts.filter((p) => p.status !== "executed").length;
  const blocked = state.log.filter((l) => l.outcome === "blocked");
  const tasks = todo(state);

  return (
    <>
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="page-head">
        <div>
          <h1>Tổng quan</h1>
          <p className="muted">
            Xin chào {state.me.name} · {tasks.length} việc cần bạn · {pending} lệnh chi đang chờ · {state.funds.length} quỹ
          </p>
        </div>
        <button className="ghost" onClick={refresh}>
          Tải lại
        </button>
      </div>

      <div className="dash">
        <section className="card tint">
          <p className="eyebrow">Tổng quan chung</p>
          <div className="kpi">
            <b>{vnd(total)}</b>
            <span>đang nằm trong các quỹ, không ai rút được một mình</span>
          </div>
          <div className="mini-stats">
            <div>
              <b>{state.funds.length}</b>
              <span>Quỹ</span>
            </div>
            <div>
              <b>{state.payouts.filter((p) => p.status === "executed").length}</b>
              <span>Khoản đã chi</span>
            </div>
            <div>
              <b>{state.users.length}</b>
              <span>Thành viên</span>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">Cần bạn xử lý</p>
          <div className="kpi">
            <b>{tasks.length}</b>
            <span>việc</span>
          </div>
          {tasks.length === 0 && <p className="muted">Không có việc nào chờ bạn.</p>}
          <div className="stack">
            {tasks.slice(0, 4).map((t, i) => (
              <Link key={i} href={`/funds/${t.payout.fundId}`} className="task">
                <span className="dot" />
                <span>
                  <b>{t.label}</b>
                  <small className="muted">{t.payout.reason}</small>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="row between">
            <p className="eyebrow">Nhật ký</p>
            <Link href="/log" className="btn small">
              Mở nhật ký →
            </Link>
          </div>
          <div className="kpi">
            <b className="bad">{blocked.length}</b>
            <span>lần thử vượt quyền bị chặn</span>
          </div>
          <div className="stack">
            {blocked.slice(0, 3).map((l) => (
              <p key={l.id} className="log-line">
                ⛔ <b>{nameOf(state, l.actorId)}</b> <small className="muted">{when(l.at)}</small>
              </p>
            ))}
          </div>
        </section>
      </div>

      <h2>Quỹ nhóm</h2>
      <div className="grid">
        {groups.map((f) => (
          <Link key={f.id} href={`/funds/${f.id}`} className="card fund">
            <span className="tag">Quỹ nhóm · cần {f.rules.quorum}/{f.members.length} duyệt</span>
            <h3>{f.name}</h3>
            <p className="muted">{f.description}</p>
            <p className="big">{vnd(f.balance)}</p>
            {roleOf(f, state.me.id) && <span className="pill">{ROLE_LABEL[roleOf(f, state.me.id)!]}</span>}
          </Link>
        ))}
      </div>

      <h2>Chiến dịch từ thiện</h2>
      <div className="grid">
        {charities.map((f) => {
          const raised = state.contributions.filter((c) => c.fundId === f.id).reduce((s, c) => s + c.amount, 0);
          const pct = f.goal ? Math.min(100, Math.round((raised / f.goal) * 100)) : 0;
          const council = f.members.filter((m) => m.role === "council").length;
          return (
            <Link key={f.id} href={`/funds/${f.id}`} className="card fund">
              <span className="tag">Từ thiện · hội đồng {f.rules.quorum}/{council} duyệt</span>
              <h3>{f.name}</h3>
              <p className="muted">{f.description}</p>
              <div className="bar" aria-label={`Đã góp ${pct}%`}>
                <div style={{ width: `${pct}%` }} />
              </div>
              <p>
                Đã góp <b>{vnd(raised)}</b> / {vnd(f.goal ?? 0)} · Số dư {vnd(f.balance)}
              </p>
              {roleOf(f, state.me.id) && <span className="pill">{ROLE_LABEL[roleOf(f, state.me.id)!]}</span>}
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
