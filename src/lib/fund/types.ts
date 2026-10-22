// Domain model for Quỹ Chung. Amounts are integer VND.

export type FundRole = "treasurer" | "member" | "organiser" | "council" | "recipient" | "donor";

export interface User {
  id: string;
  username: string; // matches the Tide `preferred_username`
  name: string;
  platformAdmin?: boolean;
  account?: string; // mock bank account money is contributed from (and refunded to)
}

export interface Recipient {
  id: string;
  name: string;
  account: string; // mock bank account
  userId?: string; // user who can confirm receipt
}

export interface Fund {
  id: string;
  kind: "group" | "charity";
  name: string;
  description: string;
  balance: number;
  goal?: number;
  members: { userId: string; role: FundRole }[];
  rules: {
    quorum: number; // approvals needed among approvers
    largeAmount?: number; // charity: above this, recipient must confirm
    evidenceBeforeNext?: boolean; // charity: previous payout needs approved evidence
  };
  recipients: Recipient[]; // charity: only these can receive money
  deadline?: string; // charity: after this date anyone can trigger the refund of what is left
  closed?: {
    at: string;
    reason: string;
    how: "council" | "expired";
    refunds: { userId: string; account: string; contributed: number; amount: number }[];
  };
}

export interface Approval {
  userId: string;
  at: string;
  // The Tide-signed access token the approver presented. Tide's ORK network signs it, so this
  // server cannot mint one for a council member and fake their approval. Absent in demo mode.
  tideToken?: string;
}

export interface Rejection extends Approval {
  reason: string;
}

export interface Evidence {
  id: string;
  kind: "invoice" | "photo" | "receipt" | "other";
  note: string;
  fileName: string;
  storedAs: string;
  sha256: string;
  submittedAt: string;
  submittedBy: string;
}

export interface Payout {
  id: string;
  fundId: string;
  amount: number;
  reason: string;
  recipientId?: string; // charity
  payee?: string; // group: free-text payee
  proposerId: string;
  createdAt: string;
  approvals: Approval[];
  rejections: Rejection[];
  status: "pending" | "awaiting_recipient" | "executed" | "rejected";
  recipientConfirmedAt?: string;
  executedAt?: string;
  evidence: Evidence[]; // append-only
  evidenceStatus: "none" | "submitted" | "approved" | "rejected";
  evidenceApprovals: Approval[];
  evidenceRejections: Rejection[];
}

export type RuleChangeSpec =
  | { type: "set_quorum"; quorum: number }
  | { type: "add_recipient"; name: string; account: string }
  | { type: "close_refund"; reason: string };

export interface RuleChange {
  id: string;
  fundId: string;
  spec: RuleChangeSpec;
  proposerId: string;
  createdAt: string;
  approvals: Approval[];
  rejections: Rejection[];
  status: "pending" | "applied" | "rejected";
}

export interface Contribution {
  id: string;
  fundId: string;
  userId: string;
  amount: number;
  fromAccount: string; // refunds can only ever go back here
  at: string;
}

export interface LogEvent {
  id: string;
  at: string;
  actorId: string;
  fundId?: string;
  action: string;
  outcome: "ok" | "blocked";
  detail: string;
}

export interface BankTransfer {
  id: string;
  at: string;
  fromFund: string;
  toName: string;
  toAccount: string;
  amount: number;
  payoutId?: string;
  refund?: boolean;
}

export interface DB {
  users: User[];
  funds: Fund[];
  payouts: Payout[];
  ruleChanges: RuleChange[];
  contributions: Contribution[];
  log: LogEvent[];
  bank: BankTransfer[];
}
