import type { BudgetTransactionStatus } from "../../lib/budget";
import Badge from "../ui/Badge";

const statusLabels: Record<BudgetTransactionStatus, string> = {
  submitted: "Submitted",
  approved: "Approved",
  denied: "Denied",
  reimbursed: "Reimbursed",
};

const statusVariants: Record<
  BudgetTransactionStatus,
  "warning" | "active" | "danger" | "success"
> = {
  submitted: "warning",
  approved: "active",
  denied: "danger",
  reimbursed: "success",
};

export default function BudgetStatusBadge({ status }: { status: BudgetTransactionStatus }) {
  return <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>;
}
