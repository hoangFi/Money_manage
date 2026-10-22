[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

_Quỹ Chung ("shared fund") holds group and charity money that no single person (treasurer, organiser, admin or our own server) can spend, redirect or re-rule alone, with public proof for every payout._

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality

One home for two very Vietnamese kinds of shared money: group funds (class funds, *hụi*) and charity campaigns. Money moves only when a quorum approves, only to registered recipients. Each charity payout must be proven before the next unlocks, and a failed campaign refunds donors automatically. Proof becomes the organiser's reputation.

### 2. Trust constraint insight

Today one person holds the money. Treasurers vanish with *hụi* funds; charity organisers face disputes over undisclosed donations. MoMo's group fund lets only its owner withdraw. Even "3-of-5 approval" in an app is one `if` statement its operator or a stolen admin login can bypass.

### 3. Value & impact

Strangers can fund causes. Example: donors fund a flood-damaged school in Nậm Cang. The organiser pays the building supplier only after 3 of 5 council members approve, cannot request more until the invoice is approved, and if the campaign stalls, the remainder returns to each donor's own account.

### 4. Why TideCloak matters

Members sign in with Tide; every API call carries a DPoP-bound token. Each approval or rejection stores the voter's token, signed by Tide's ORK network. We hold no signing key, so we cannot forge a vote; money moves only on a quorum of valid Tide signatures. Next: execute transfers through a Forseti contract.

### 5. Prototype & storytelling

Every shortcut fails and is logged: the treasurer withdrawing alone, the admin approving, the organiser paying or refunding herself. Then a 3-of-5 payout executes, its evidence is hashed, and closing a campaign refunds donors.

## Setup

Requirements: Node.js 18+. For Tide sign-in also Docker Desktop, curl and jq (on Windows run the init script from Git Bash).

### Demo with a simulated TideCloak (no TideCloak server needed)

```bash
npm install
npm run dev:demo
```

Open http://localhost:3000, click **Đăng nhập với Tide** and pick an account. The simulated realm (`/sim-tide`) issues the same kind of token TideCloak does: EdDSA-signed, bound to a DPoP key in your browser, carrying your realm and fund roles. The server verifies it with the same `verifyTideJWT` + `verifyDpop` code it uses for a real realm, and reads every role from the token, never from the database. "Đổi tài khoản" switches account; "Đặt lại dữ liệu" restores the sample data. The **VI | EN** switch in the header changes the whole interface, server messages included. The **TideCloak và quyền** page shows your token and lets you try a stolen-token replay and a token edited to add a role (both rejected).

Where TideCloak fits, planned with Tide's MCP server: [docs/TIDECLOAK.md](docs/TIDECLOAK.md).

### With TideCloak

```bash
npm install
cp .env.example .env    # set KC_BOOTSTRAP_ADMIN_PASSWORD
TIDE_LICENSE_EMAIL=<your email> TIDE_TERMS_ACCEPTED=yes npm run init
npm run dev
```

`npm run init` starts a TideCloak dev container, creates the realm, licenses it to your email under Tide's [Terms & Conditions](https://tide.org/legal), prints an enrolment link for the first admin and exports `data/tidecloak.json`. Tide usernames must match the users in `src/lib/fund/seed.ts`.

### Demo script

| Step | Act as | Action | Expected |
|---|---|---|---|
| 1 | Hoa (not in this fund) | "Tạo lệnh chi" on "Du lịch Đà Lạt" | Blocked: no `fund:f-dalat:*` role in her token |
| 2 | An (or any member) | "Tạo lệnh chi" opens a dialog; create a 3M payout | Pending 0/3 |
| 3 | Admin | Approve it | Blocked |
| 4 | Bình, Chi, Dũng | Approve | Executed |
| 5 | Chi, Dũng | Reject another payout, with a reason | Rejected once quorum is out of reach |
| 6 | Donors | Contribute to Nậm Cang | Balance rises |
| 7 | Lan (organiser) | "Đề xuất giải ngân" to "Tài khoản khác…" (her own account) | Blocked |
| 8 | Lan | Pay 80M to Minh Phát; Hoa, Khoa, Minh approve; Minh Phát confirms | Executed |
| 9 | Lan | Propose a second payout | Blocked until evidence is approved |
| 10 | Lan, then council | "Thêm minh chứng": drop the invoice photo; 3 approve | Next payout unlocked |
| 11 | Council | Propose closing the campaign; 3 approve | Remainder refunded pro rata, only to each donor's own account |
| 12 | Admin | On a pending payout, "Giả lập: chèn lượt duyệt mạo danh vào DB" | Vote shown with an invalid Tide signature; never counted |

Each fund page has a **Nhật ký** (audit log) tab listing every attempt, allowed or blocked, and each executed payout has a public proof page.

### How the rules work

- **Payouts**: proposed by any group member or by the charity organiser, executed once the quorum approves; the proposer cannot vote. Rejections need a reason. Executed payouts are reviewed under "Đã chi"; only the payout's creator uploads its invoices or photos as evidence (SHA-256 hashed, append-only), and the other approvers review them.
- **Charity**: money goes only to registered recipients; large payouts also need the recipient's confirmation; the next payout waits for approved evidence (stored with its SHA-256 hash, append-only).
- **Refunds**: after the deadline anyone can trigger them; earlier closing needs the council quorum. The remainder is split by each donor's share and sent only to the account they paid from.
- **Rule changes** (quorum, recipients) need the same quorum. The platform admin has no rights over money or rules.

### Status of Tide licensing

Tide sign-in, DPoP-verified APIs, token roles and Tide-signed approvals are implemented. During the hackathon, Tide's licensing and signing services returned `TIDE-IDPEXT-VENDOR-KEYGEN_FAILED` (`Midgard.FinalizeWallet` 500) and `Midgard.SignModel` 500 for several teams, which Tide support is investigating, so the demo runs on the simulated TideCloak. Switching to a real realm is configuration only: `npm run init`, then `npm run dev`. The simulation's one honest gap: its signing key sits on our server, whereas TideCloak's exists only as key shares across Tide's ORK network.

Data is synthetic and the bank is mocked.
