[![Built with TideCloak](https://tide.org/badges/built-with-tidecloak.svg)](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked)

## Project overview

_Quỹ Chung ("shared fund") lets groups and charity campaigns pool money that no single person (treasurer, organiser, admin or the app's operator) can withdraw or re-rule alone, and every payout carries public, tamper-evident proof._

Built with [TideCloak](https://tide.org/tidecloak?utm_source=github&utm_medium=readme&utm_campaign=unlocked).

### 1. Vision & originality

One platform for two very Vietnamese kinds of shared money: group funds (class funds, *hụi*) and charity campaigns. Money moves only when a quorum approves, only to pre-registered recipients, and each charity payout must be proven with invoices and photos before the next unlocks. Proof becomes the organiser's reputation.

### 2. Trust constraint insight

Today one person holds the money. Treasurers vanish with *hụi* funds; charity organisers face disputes over undisclosed donations, and statements only reveal misuse afterwards. MoMo's group fund lets only its owner withdraw. Even an app with "3-of-5 approval" is one `if` statement its operator or a stolen admin login can bypass.

### 3. Value & impact

Strangers can fund a cause. Example: 200 donors fund a flood-damaged school in Nậm Cang; the organiser can pay the building supplier only after 3 of 5 council members approve, and cannot request the second payment until the invoice and delivery photos are approved.

### 4. Why TideCloak matters

Members sign in with Tide and every call carries a DPoP-bound token. Each approval is stored with the approver's token, signed by Tide's ORK network; we hold no signing key, so we cannot forge an approval, and a payout executes only on a quorum of valid Tide signatures shown on the public proof page. Next: move execution into a Forseti contract.

### 5. Prototype & storytelling

The treasurer withdrawing alone, the admin approving and the organiser paying her own account are all blocked and logged. Then a 3-of-5 payout executes and its evidence is hashed.

## Setup

Requirements: Node.js 18+. For Tide sign-in also Docker, curl and jq.

### Demo mode (no TideCloak needed)

```bash
npm install
npm run dev:demo
```

Open http://localhost:3000 and pick who you are acting as in the top-right menu. "Đặt lại dữ liệu" resets the sample data.

### With TideCloak

```bash
cp .env.example .env    # set KC_BOOTSTRAP_ADMIN_PASSWORD
TIDE_LICENSE_EMAIL=<your email> TIDE_TERMS_ACCEPTED=yes npm run init
npm run dev
```

`npm run init` starts a TideCloak dev container, creates the realm, licenses it to your email under Tide's [Terms & Conditions](https://tide.org/legal) and prints an enrolment link for the first admin. Tide usernames must match the users in `src/lib/fund/seed.ts`.

### Demo script

| Step | Act as | Action | Expected |
|---|---|---|---|
| 1 | An (treasurer) | Withdraw 10M from "Du lịch Đà Lạt" | Blocked |
| 2 | An | Create a 3M payout | Pending 0/3 |
| 3 | Admin | Approve it | Blocked |
| 4 | Bình, Chi, Dũng | Approve | Executed |
| 5 | Donors | Contribute to Nậm Cang | Balance rises |
| 6 | Lan (organiser) | Pay 50M to her own account | Blocked |
| 7 | Lan | Pay 80M to Minh Phát; Hoa, Khoa, Minh approve; Minh Phát confirms | Executed |
| 8 | Lan | Propose a second payout | Blocked until evidence approved |
| 9 | Lan, then council | Upload invoice; 3 approve | Next payout unlocked |

Data is synthetic and the bank is mocked.
