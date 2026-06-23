import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../auth/authProvider";
import { submitBudgetTransaction } from "../../lib/budgetQueries";

const categories = [
  "Food",
  "Decorations",
  "Supplies",
  "Travel",
  "Venue",
  "DJ/Music",
  "Printing",
  "Other",
];

type SubmitExpenseFormProps = {
  budgetAccountId: string;
  onSubmitted: () => Promise<void>;
};

type ExpenseDraft = {
  amount: string;
  vendor: string;
  category: string;
  description: string;
  transactionDate: string;
};

const emptyDraft: ExpenseDraft = {
  amount: "",
  vendor: "",
  category: "",
  description: "",
  transactionDate: "",
};

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function validateDraft(draft: ExpenseDraft) {
  const amount = Number(draft.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "Amount must be greater than 0.";
  }

  if (!draft.category) {
    return "Category is required.";
  }

  if (!draft.description.trim()) {
    return "Description is required.";
  }

  if (!draft.transactionDate) {
    return "Transaction date is required.";
  }

  return null;
}

export default function SubmitExpenseForm({ budgetAccountId, onSubmitted }: SubmitExpenseFormProps) {
  const { session } = useAuth();
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const userId = session?.user?.id;
    if (!userId) {
      setErrorMessage("You must be signed in to submit an expense.");
      setSuccessMessage(null);
      return;
    }

    const validationError = validateDraft(draft);
    if (validationError) {
      setErrorMessage(validationError);
      setSuccessMessage(null);
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await submitBudgetTransaction({
        budget_account_id: budgetAccountId,
        submitted_by: userId,
        amount: Number(draft.amount),
        vendor: toNullableText(draft.vendor),
        category: draft.category,
        description: draft.description.trim(),
        transaction_date: draft.transactionDate,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setErrorMessage(`Could not submit expense: ${message}`);
      setSaving(false);
      return;
    }

    setDraft(emptyDraft);
    setSuccessMessage("Expense submitted for review.");

    try {
      await onSubmitted();
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      setErrorMessage(`Expense was submitted, but transactions could not be refreshed: ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="budget-submit-form" onSubmit={handleSubmit}>
      <div>
        <h2 className="h4 mb-1">Submit expense</h2>
        <p className="text-body-secondary mb-0">Expenses are submitted for review before they count as approved.</p>
      </div>

      {errorMessage && <div className="alert alert-danger mb-0">{errorMessage}</div>}
      {successMessage && <div className="alert alert-success mb-0">{successMessage}</div>}

      <div className="budget-form-grid">
        <div>
          <label className="form-label" htmlFor="expenseAmount">
            Amount
          </label>
          <input
            id="expenseAmount"
            className="form-control"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={draft.amount}
            onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
            disabled={saving}
          />
        </div>

        <div>
          <label className="form-label" htmlFor="expenseDate">
            Transaction date
          </label>
          <input
            id="expenseDate"
            className="form-control"
            type="date"
            value={draft.transactionDate}
            onChange={(event) => setDraft((current) => ({ ...current, transactionDate: event.target.value }))}
            disabled={saving}
          />
        </div>

        <div>
          <label className="form-label" htmlFor="expenseVendor">
            Vendor
          </label>
          <input
            id="expenseVendor"
            className="form-control"
            value={draft.vendor}
            onChange={(event) => setDraft((current) => ({ ...current, vendor: event.target.value }))}
            disabled={saving}
          />
        </div>

        <div>
          <label className="form-label" htmlFor="expenseCategory">
            Category
          </label>
          <select
            id="expenseCategory"
            className="form-select"
            value={draft.category}
            onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
            disabled={saving}
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className="budget-form-full">
          <label className="form-label" htmlFor="expenseDescription">
            Description
          </label>
          <textarea
            id="expenseDescription"
            className="form-control"
            rows={3}
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            disabled={saving}
          />
        </div>
      </div>

      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Submitting..." : "Submit expense"}
        </button>
      </div>
    </form>
  );
}
