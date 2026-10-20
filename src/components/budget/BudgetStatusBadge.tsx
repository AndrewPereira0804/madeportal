import type { BudgetTransactionStatus } from "../../lib/budget";
import Badge from "../ui/Badge";

const statusLabels: Record<BudgetTransactionStatus, string> = {
  submitted: "Submitted",
  approved: "Approved",
  denied: "Denied",
  reimbursed: "Reimbursed",
  voided: "Voided",
};

const statusVariants: Record<
  BudgetTransactionStatus,
  "warning" | "info" | "danger" | "success"
> = {
  submitted: "warning",
  approved: "info",
  denied: "danger",
  reimbursed: "success",
  voided: "danger",
};

export default function BudgetStatusBadge({ status }: { status: BudgetTransactionStatus }) {
  return <Badge variant={statusVariants[status]}>{statusLabels[status]}</Badge>;
}
