import type { BudgetTransactionStatus } from "../../lib/budget";

const statusLabels: Record<BudgetTransactionStatus, string> = {
  submitted: "Submitted",
  approved: "Approved",
  denied: "Denied",
  reimbursed: "Reimbursed",
};

export default function BudgetStatusBadge({ status }: { status: BudgetTransactionStatus }) {
  return <span className={`budget-status-badge budget-status-${status}`}>{statusLabels[status]}</span>;
}
