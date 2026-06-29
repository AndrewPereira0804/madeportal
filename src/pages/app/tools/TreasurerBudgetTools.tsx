import { Navigate } from "react-router-dom";
import { canManageBudgets } from "../../../auth/roleAccess";
import useRoles from "../../../auth/useRoles";
import { ActionCard, Button, Card, EmptyState, PageHeader, SectionHeader } from "../../../components/ui";
import BudgetAdminPage, { type BudgetAdminMode } from "../../BudgetAdminPage";
import BudgetAccountPage from "../../budget/BudgetAccountPage";
import BudgetPage from "../../budget/BudgetPage";

type TreasurerBudgetToolsProps = {
  toolPath: string;
};

const treasurerToolBasePath = "/app/tools/treasurer";

const budgetTools = [
  {
    path: "overview",
    title: "Budget overview",
    description: "Review the active cycle, account balances, and visible transaction totals.",
    meta: "Overview",
  },
  {
    path: "requests",
    title: "Expense requests",
    description: "Approve or deny submitted budget requests.",
    meta: "Review",
  },
  {
    path: "reimbursements",
    title: "Reimbursements",
    description: "Mark approved expenses as reimbursed after payout.",
    meta: "Payouts",
  },
  {
    path: "cycles",
    title: "Budget cycles",
    description: "Create budget cycles and set the active budget period.",
    meta: "Cycles",
  },
  {
    path: "allocations",
    title: "Budget allocations",
    description: "Create, edit, and review chair budget accounts for the active cycle.",
    meta: "Accounts",
  },
];

function normalizeToolPath(toolPath: string) {
  return toolPath.replace(/^\/+|\/+$/g, "");
}

function getAdminMode(toolPath: string): BudgetAdminMode | null {
  switch (toolPath) {
    case "requests":
    case "reimbursements":
    case "cycles":
      return toolPath;
    case "allocations":
      return "allocations";
    default:
      return null;
  }
}

export default function TreasurerBudgetTools({ toolPath }: TreasurerBudgetToolsProps) {
  const { roles, loading: rolesLoading } = useRoles();
  const normalizedToolPath = normalizeToolPath(toolPath);
  const accountDetailMatch = normalizedToolPath.match(/^accounts\/([^/]+)$/);

  if (accountDetailMatch) {
    return (
      <BudgetAccountPage
        accountIdOverride={accountDetailMatch[1]}
        eyebrow="Treasurer tools"
        returnPath={canManageBudgets(roles) ? `${treasurerToolBasePath}/overview` : "/app/tools"}
      />
    );
  }

  if (rolesLoading) {
    return (
      <Card className="tools-page">
        <div className="budget-loading">
          <div className="spinner-border spinner-border-sm text-primary" role="status" />
          <span>Loading treasurer tools...</span>
        </div>
      </Card>
    );
  }

  if (!canManageBudgets(roles)) {
    return <Navigate to="/app/tools" replace />;
  }

  if (!normalizedToolPath) {
    return (
      <Card className="tools-page">
        <PageHeader
          eyebrow="Treasurer tools"
          title="Treasurer"
          subtitle="Budget workflows split by use case."
          bordered
          actions={<Button to="/app/tools" variant="outline-secondary">All Tools</Button>}
        />

        <SectionHeader
          title="Budget tools"
          description={`${budgetTools.length} budget workflow${budgetTools.length === 1 ? "" : "s"} available.`}
        />

        <div className="action-card-grid tools-grid">
          {budgetTools.map((tool) => (
            <ActionCard
              key={tool.path}
              to={`${treasurerToolBasePath}/${tool.path}`}
              eyebrow="Budget"
              title={tool.title}
              description={tool.description}
              meta={tool.meta}
            />
          ))}
        </div>
      </Card>
    );
  }

  if (normalizedToolPath === "overview") {
    return (
      <BudgetPage
        eyebrow="Treasurer tools"
        title="Budget Overview"
        adminPath={treasurerToolBasePath}
      />
    );
  }

  const adminMode = getAdminMode(normalizedToolPath);
  if (adminMode) {
    return <BudgetAdminPage mode={adminMode} returnPath={treasurerToolBasePath} />;
  }

  return (
    <Card className="tools-page">
      <PageHeader
        eyebrow="Treasurer tools"
        title="Tool unavailable"
        subtitle="This Treasurer budget tool is not available."
        bordered
        actions={<Button to={treasurerToolBasePath} variant="outline-secondary">Treasurer Tools</Button>}
      />
      <EmptyState title="Tool unavailable" description="Choose an available Treasurer budget tool." />
    </Card>
  );
}
