import { formatMoney, type BudgetSummary } from "../../lib/budget";
import { StatCard } from "../ui";

type BudgetSummaryCardsProps = {
  summary: BudgetSummary;
};

export default function BudgetSummaryCards({ summary }: BudgetSummaryCardsProps) {
  const items = [
    { label: "Total allocated", value: summary.allocated },
    { label: "Approved / reimbursed", value: summary.spent },
    { label: "Pending", value: summary.pending },
    { label: "Remaining", value: summary.remaining },
  ];

  return (
    <div className="budget-summary-grid" aria-label="Budget summary">
      {items.map((item) => (
        <StatCard key={item.label} label={item.label} value={formatMoney(item.value)} />
      ))}
    </div>
  );
}
