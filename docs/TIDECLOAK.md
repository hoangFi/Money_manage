# Where TideCloak fits in Quỹ Chung

Planned with Tide's MCP server (Tide Agent Pack, `tide_choose_scenario`, `tide_scenario_roles`,
`tide_playbook add-rbac-nextjs`). It matched Quỹ Chung to the **`iga-admin-governance`** scenario:
roles are granted only through IGA change requests that an admin quorum must sign, and every
protected API verifies the JWT, the roles and the DPoP proof on the server.

Until Tide's licensing service works for our realm (see the README), the app runs against a
**simulated TideCloak** (`npm run dev:demo`). The simulation keeps the real shape of every check, so
switching to a real realm changes configuration, not application code.

## The trust boundary

| Concern | Who decides | Why it matters here |
|---|---|---|
| Who you are | TideCloak sign-in (Tide enclave, threshold keys) | We never hold passwords or keys |
| Which role you hold in which fund | TideCloak client roles, granted via IGA change requests signed by an admin quorum | Our server, our database or one admin cannot promote anyone to treasurer or council |
| Whether a request is really yours | Access token bound to your device key (DPoP), verified on every API call | A stolen token is useless |
| Whether an approval counts | The approver's Tide-signed token, stored with the vote and re-verified | We cannot forge a vote; a forged one is visibly rejected |
| Fund rules (quorum, recipients, evidence, refunds) | App engine, using only the verified identity and roles above | Next step: move payout execution into a Forseti contract (policy-governed signing) |

## Roles

| Role | Type | Example | Meaning |
|---|---|---|---|
| `_tide_enabled` | Realm (default) | everyone | Tide account linked |
| `platform-admin` | Realm | `admin` | Runs the platform; **no** power over money or rules |
| `tide-realm-admin` | Client `realm-management` | `admin` | TideCloak governance; role grants still need the IGA quorum |
| `fund:<fundId>:<role>` | Client `quy-chung-client` | `fund:f-dalat:treasurer`, `fund:f-namcang:council` | Per-fund role (prefixed per-resource pattern from the pack) |

Fund roles: `treasurer`, `member` (group funds); `organiser`, `council`, `recipient` (charity).
Donating needs no role: anyone signed in may contribute, and becomes a donor of that fund.

## Access checks

| Action | Server check |
|---|---|
| Any API call | Tide JWT signature, issuer, `azp`, expiry, then DPoP proof (`cnf.jkt`, `ath`, `htm`, `htu`, `jti`) |
| Create a payout | `fund:<id>:treasurer` (group) or `fund:<id>:organiser` (charity) |
| Approve or reject a payout, evidence or proposal | `fund:<id>:member`/`treasurer` (group) or `fund:<id>:council` (charity); not the proposer |
| Count an approval towards the quorum | The stored token verifies against the realm key, belongs to that voter and carries the approver role |
| Confirm receipt | The registered recipient of that payout |
| Anything with money or rules | Blocked for `platform-admin` |

## Real vs simulated

| Piece | Real TideCloak | Simulation (`/sim-tide`) |
|---|---|---|
| Sign-in | Tide enclave login | Account picker page, no password |
| Token signing key | Realm key held by Tide's ORK network | Ed25519 key in `data/sim-tide/` |
| Role grants | IGA change requests, admin quorum | Fixed grants from the seed data |
| DPoP | `@tidecloak/nextjs` `secureFetch` | Browser ES256 key + RFC 9449 proofs |
| Server verification | `verifyTideJWT` + `verifyDpop` | **The same code**, pointed at the simulated realm's public key |

The simulation is honest about one thing it cannot reproduce: its signing key sits on our server.
In the real deployment that key exists only as shares across Tide's ORK network, which is what makes
a forged approval impossible rather than just detectable.
