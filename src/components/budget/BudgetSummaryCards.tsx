import { formatMoney, type BudgetSummary } from "../../lib/budget";
import { MetricCard } from "../ui";

type BudgetSummaryCardsProps = {
  summary: BudgetSummary;
};

export default function BudgetSummaryCards({ summary }: BudgetSummaryCardsProps) {
  const items = [
    { label: "Total allocated", value: summary.allocated, tone: "default" as const },
    { label: "Approved / reimbursed", value: summary.spent, tone: "success" as const },
    { label: "Pending", value: summary.pending, tone: "warning" as const },
    { label: "Remaining", value: summary.remaining, tone: summary.remaining < 0 ? "danger" as const : "gold" as const },
  ];

  return (
    <div className="budget-summary-grid" aria-label="Budget summary">
      {items.map((item) => (
        <MetricCard
          key={item.label}
          label={item.label}
          value={formatMoney(item.value)}
          tone={item.tone}
          detail={item.label === "Remaining" ? "after approved and pending spend" : undefined}
        />
      ))}
    </div>
  );
}
