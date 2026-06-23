export type BudgetTransactionStatus = "submitted" | "approved" | "denied" | "reimbursed";

export type BudgetCycle = {
  id: string;
  name: string | null;
  status: string | null;
  is_active: boolean | null;
  active: boolean | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
  created_by: string | null;
};

export type BudgetAccount = {
  id: string;
  cycle_id: string;
  role_slug: string;
  allocated_amount: number;
  notes: string | null;
  created_at: string | null;
  created_by: string | null;
};

export type BudgetTransaction = {
  id: string;
  budget_account_id: string;
  submitted_by: string | null;
  amount: number;
  vendor: string | null;
  category: string | null;
  description: string | null;
  transaction_date: string | null;
  status: BudgetTransactionStatus;
  receipt_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  denial_reason: string | null;
  created_at: string | null;
};

export type BudgetSummary = {
  allocated: number;
  spent: number;
  pending: number;
  remaining: number;
};

export type BudgetRole = {
  slug: string;
  name: string;
};

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number.isFinite(value ?? NaN) ? value ?? 0 : 0);
}

export function calculateBudgetSummary(
  accounts: BudgetAccount[],
  transactions: BudgetTransaction[]
): BudgetSummary {
  const allocated = accounts.reduce((total, account) => total + account.allocated_amount, 0);

  const spent = transactions
    .filter((transaction) => transaction.status === "approved" || transaction.status === "reimbursed")
    .reduce((total, transaction) => total + transaction.amount, 0);

  const pending = transactions
    .filter((transaction) => transaction.status === "submitted")
    .reduce((total, transaction) => total + transaction.amount, 0);

  return {
    allocated,
    spent,
    pending,
    remaining: allocated - spent - pending,
  };
}
