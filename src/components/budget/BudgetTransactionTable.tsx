import { formatMoney, type BudgetTransaction } from "../../lib/budget";
import BudgetStatusBadge from "./BudgetStatusBadge";

type BudgetTransactionTableProps = {
  transactions: BudgetTransaction[];
};

function formatTransactionDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BudgetTransactionTable({ transactions }: BudgetTransactionTableProps) {
  if (transactions.length === 0) {
    return <p className="budget-empty-state">No transactions are visible for this budget account.</p>;
  }

  return (
    <div className="accounts-table-wrap budget-table-wrap">
      <table className="accounts-table budget-table">
        <thead>
          <tr>
            <th className="accounts-th">Date</th>
            <th className="accounts-th">Vendor</th>
            <th className="accounts-th">Category</th>
            <th className="accounts-th">Description</th>
            <th className="accounts-th">Amount</th>
            <th className="accounts-th">Status</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td className="accounts-td">{formatTransactionDate(transaction.transaction_date)}</td>
              <td className="accounts-td">{transaction.vendor ?? "No vendor"}</td>
              <td className="accounts-td">{transaction.category ?? "Uncategorized"}</td>
              <td className="accounts-td budget-description-cell">
                {transaction.description ?? "No description provided."}
                {transaction.denial_reason && (
                  <div className="accounts-user-meta">Denial reason: {transaction.denial_reason}</div>
                )}
              </td>
              <td className="accounts-td">{formatMoney(transaction.amount)}</td>
              <td className="accounts-td">
                <BudgetStatusBadge status={transaction.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
