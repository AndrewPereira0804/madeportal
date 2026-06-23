import { formatMoney, type BudgetSummary } from "../../lib/budget";

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
        <div key={item.label} className="budget-summary-card">
          <span className="budget-summary-label">{item.label}</span>
          <strong className="budget-summary-value">{formatMoney(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}
