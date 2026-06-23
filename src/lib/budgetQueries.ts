import supabase from "../config/supabaseClient";
import type { BudgetAccount, BudgetCycle, BudgetTransaction, BudgetTransactionStatus } from "./budget";

type RawRow = Record<string, unknown>;

export type SubmittedBudgetTransactionInput = {
  budget_account_id: string;
  submitted_by: string;
  amount: number;
  vendor: string | null;
  category: string;
  description: string;
  transaction_date: string;
};

export type BudgetSubmitterProfile = {
  user_id: string;
  name: string | null;
  email: string | null;
};

const validTransactionStatuses = new Set<BudgetTransactionStatus>([
  "submitted",
  "approved",
  "denied",
  "reimbursed",
]);

function toStringOrNull(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function toRequiredString(value: unknown) {
  const cleaned = toStringOrNull(value);
  if (!cleaned) {
    throw new Error("Budget data is missing a required identifier.");
  }

  return cleaned;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toBooleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function normalizeBudgetCycle(row: RawRow): BudgetCycle {
  return {
    id: toRequiredString(row.id),
    name: toStringOrNull(row.name) ?? toStringOrNull(row.title) ?? toStringOrNull(row.label),
    status: toStringOrNull(row.status) ?? toStringOrNull(row.state),
    is_active: toBooleanOrNull(row.is_active),
    active: toBooleanOrNull(row.active),
    start_date: toStringOrNull(row.start_date) ?? toStringOrNull(row.start),
    end_date: toStringOrNull(row.end_date) ?? toStringOrNull(row.end),
    created_at: toStringOrNull(row.created_at),
  };
}

function isCurrentDateInCycle(cycle: BudgetCycle) {
  if (!cycle.start_date || !cycle.end_date) {
    return false;
  }

  const now = new Date();
  const startsAt = new Date(cycle.start_date);
  const endsAt = new Date(cycle.end_date);

  return Number.isFinite(startsAt.getTime()) && Number.isFinite(endsAt.getTime()) && startsAt <= now && now <= endsAt;
}

function chooseActiveBudgetCycle(cycles: BudgetCycle[]) {
  return (
    cycles.find((cycle) => cycle.is_active === true) ??
    cycles.find((cycle) => cycle.active === true) ??
    cycles.find((cycle) => cycle.status?.toLowerCase() === "active") ??
    cycles.find(isCurrentDateInCycle) ??
    (cycles.length === 1 ? cycles[0] : null)
  );
}

function normalizeBudgetAccount(row: RawRow): BudgetAccount {
  return {
    id: toRequiredString(row.id),
    cycle_id: toRequiredString(row.cycle_id),
    role_slug: toRequiredString(row.role_slug),
    allocated_amount: toNumber(row.allocated_amount),
    notes: toStringOrNull(row.notes),
    created_at: toStringOrNull(row.created_at),
    created_by: toStringOrNull(row.created_by),
  };
}

function normalizeTransactionStatus(value: unknown): BudgetTransactionStatus {
  const status = toStringOrNull(value);
  if (status && validTransactionStatuses.has(status as BudgetTransactionStatus)) {
    return status as BudgetTransactionStatus;
  }

  throw new Error(`Unknown budget transaction status: ${status ?? "missing"}.`);
}

function normalizeBudgetTransaction(row: RawRow): BudgetTransaction {
  return {
    id: toRequiredString(row.id),
    budget_account_id: toRequiredString(row.budget_account_id),
    submitted_by: toStringOrNull(row.submitted_by),
    amount: toNumber(row.amount),
    vendor: toStringOrNull(row.vendor),
    category: toStringOrNull(row.category),
    description: toStringOrNull(row.description),
    transaction_date: toStringOrNull(row.transaction_date),
    status: normalizeTransactionStatus(row.status),
    receipt_url: toStringOrNull(row.receipt_url),
    approved_by: toStringOrNull(row.approved_by),
    approved_at: toStringOrNull(row.approved_at),
    denial_reason: toStringOrNull(row.denial_reason),
    created_at: toStringOrNull(row.created_at),
  };
}

function normalizeSubmitterProfile(row: RawRow): BudgetSubmitterProfile {
  return {
    user_id: toRequiredString(row.user_id),
    name: toStringOrNull(row.name),
    email: toStringOrNull(row.email),
  };
}

export async function getActiveBudgetCycle() {
  const { data, error } = await supabase.from("budget_cycles").select("*");

  if (error) {
    throw error;
  }

  return chooseActiveBudgetCycle(((data ?? []) as RawRow[]).map(normalizeBudgetCycle));
}

export async function getBudgetAccountsForCycle(cycleId: string) {
  const { data, error } = await supabase
    .from("budget_accounts")
    .select("id, cycle_id, role_slug, allocated_amount, notes, created_at, created_by")
    .eq("cycle_id", cycleId)
    .order("role_slug", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RawRow[]).map(normalizeBudgetAccount);
}

export async function getTransactionsForAccounts(accountIds: string[]) {
  if (accountIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("budget_transactions")
    .select(
      "id, budget_account_id, submitted_by, amount, vendor, category, description, transaction_date, status, receipt_url, approved_by, approved_at, denial_reason, created_at"
    )
    .in("budget_account_id", accountIds)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RawRow[]).map(normalizeBudgetTransaction);
}

export async function getBudgetAccount(accountId: string) {
  const { data, error } = await supabase
    .from("budget_accounts")
    .select("id, cycle_id, role_slug, allocated_amount, notes, created_at, created_by")
    .eq("id", accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? normalizeBudgetAccount(data as RawRow) : null;
}

export async function getTransactionsForAccount(accountId: string) {
  return getTransactionsForAccounts([accountId]);
}

export async function getBudgetTransactionsByStatus(statuses: BudgetTransactionStatus[]) {
  if (statuses.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("budget_transactions")
    .select(
      "id, budget_account_id, submitted_by, amount, vendor, category, description, transaction_date, status, receipt_url, approved_by, approved_at, denial_reason, created_at"
    )
    .in("status", statuses)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RawRow[]).map(normalizeBudgetTransaction);
}

export async function getBudgetAccountsByIds(accountIds: string[]) {
  if (accountIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("budget_accounts")
    .select("id, cycle_id, role_slug, allocated_amount, notes, created_at, created_by")
    .in("id", accountIds)
    .order("role_slug", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as RawRow[]).map(normalizeBudgetAccount);
}

export async function getSubmitterProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id,name,email")
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return ((data ?? []) as RawRow[]).map(normalizeSubmitterProfile);
}

export async function submitBudgetTransaction(input: SubmittedBudgetTransactionInput) {
  const { error } = await supabase.from("budget_transactions").insert({
    budget_account_id: input.budget_account_id,
    submitted_by: input.submitted_by,
    amount: input.amount,
    vendor: input.vendor,
    category: input.category,
    description: input.description,
    transaction_date: input.transaction_date,
    status: "submitted",
  });

  if (error) {
    throw error;
  }
}

async function updateBudgetTransactionStatus(
  transactionId: string,
  payload: Partial<Pick<BudgetTransaction, "status" | "approved_by" | "approved_at" | "denial_reason">>,
  currentStatus: BudgetTransactionStatus
) {
  const { count, error } = await supabase
    .from("budget_transactions")
    .update(payload, { count: "exact" })
    .eq("id", transactionId)
    .eq("status", currentStatus);

  if (error) {
    throw error;
  }

  if (count === 0) {
    throw new Error("This request was already changed or is no longer available.");
  }
}

export async function approveBudgetTransaction(transactionId: string, approverId: string) {
  await updateBudgetTransactionStatus(
    transactionId,
    {
      status: "approved",
      approved_by: approverId,
      approved_at: new Date().toISOString(),
      denial_reason: null,
    },
    "submitted"
  );
}

export async function denyBudgetTransaction(transactionId: string, approverId: string, denialReason: string) {
  await updateBudgetTransactionStatus(
    transactionId,
    {
      status: "denied",
      denial_reason: denialReason,
      approved_by: approverId,
      approved_at: new Date().toISOString(),
    },
    "submitted"
  );
}

export async function markBudgetTransactionReimbursed(transactionId: string) {
  await updateBudgetTransactionStatus(transactionId, { status: "reimbursed" }, "approved");
}
