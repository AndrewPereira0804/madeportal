import { Link } from "react-router-dom";
import { calculateBudgetSummary, formatMoney, type BudgetAccount, type BudgetTransaction } from "../../lib/budget";

type BudgetAccountTableProps = {
  accounts: BudgetAccount[];
  transactions: BudgetTransaction[];
};

export default function BudgetAccountTable({ accounts, transactions }: BudgetAccountTableProps) {
  return (
    <div className="accounts-table-wrap budget-table-wrap">
      <table className="accounts-table budget-table">
        <thead>
          <tr>
            <th className="accounts-th">Account</th>
            <th className="accounts-th">Allocated</th>
            <th className="accounts-th">Approved / reimbursed</th>
            <th className="accounts-th">Pending</th>
            <th className="accounts-th">Remaining</th>
            <th className="accounts-th">Activity</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const accountTransactions = transactions.filter(
              (transaction) => transaction.budget_account_id === account.id
            );
            const summary = calculateBudgetSummary([account], accountTransactions);

            return (
              <tr key={account.id}>
                <td className="accounts-td">
                  <div className="accounts-user-name">{account.role_slug}</div>
                  {account.notes && <div className="accounts-user-meta">{account.notes}</div>}
                </td>
                <td className="accounts-td">{formatMoney(summary.allocated)}</td>
                <td className="accounts-td">{formatMoney(summary.spent)}</td>
                <td className="accounts-td">{formatMoney(summary.pending)}</td>
                <td className="accounts-td">{formatMoney(summary.remaining)}</td>
                <td className="accounts-td">
                  <Link to={`/budget/${account.id}`} className="btn btn-outline-secondary btn-sm">
                    View transactions
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
