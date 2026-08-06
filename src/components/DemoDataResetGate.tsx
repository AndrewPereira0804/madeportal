import { useEffect, useState, type ReactNode } from "react";
import { isDemoEnvironment } from "../config/appEnvironment";
import { Button } from "./ui";

type DemoResetStatus = "ready" | "resetting" | "failed";

type DemoDataResetGateProps = {
  children: ReactNode;
};

const DEMO_RESET_SESSION_KEY = "portal.demoDataReset.v1";
const DEMO_RESET_HEADER = "portal-demo-reset";

let demoResetPromise: Promise<void> | null = null;

function hasCompletedDemoReset(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.sessionStorage.getItem(DEMO_RESET_SESSION_KEY) === "complete";
  } catch {
    return false;
  }
}

function markDemoResetComplete(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(DEMO_RESET_SESSION_KEY, "complete");
  } catch {
    // Session storage can be unavailable in restrictive browser modes.
  }
}

function getInitialStatus(): DemoResetStatus {
  if (!isDemoEnvironment || hasCompletedDemoReset()) {
    return "ready";
  }

  return "resetting";
}

async function requestDemoReset(): Promise<void> {
  const response = await fetch("/api/demo/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Reset": DEMO_RESET_HEADER,
    },
    body: JSON.stringify({ reason: "browser_session_start" }),
  });

  if (response.ok) {
    markDemoResetComplete();
    return;
  }

  let errorMessage = "Demo reset failed";

  try {
    const responseBody: unknown = await response.json();

    if (isErrorResponse(responseBody)) {
      errorMessage = responseBody.error;
    }
  } catch {
    errorMessage = response.statusText || errorMessage;
  }

  throw new Error(errorMessage);
}

function isErrorResponse(value: unknown): value is { error: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    value.error.length > 0
  );
}

function runDemoReset(): Promise<void> {
  if (!demoResetPromise) {
    demoResetPromise = requestDemoReset();
  }

  return demoResetPromise;
}

export default function DemoDataResetGate({ children }: DemoDataResetGateProps) {
  const [status, setStatus] = useState<DemoResetStatus>(getInitialStatus);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isDemoEnvironment || status !== "resetting") {
      return;
    }

    let isMounted = true;

    runDemoReset()
      .then(() => {
        if (isMounted) {
          setErrorMessage(null);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        demoResetPromise = null;
        const message = error instanceof Error ? error.message : "Demo reset failed";
        console.error(message);

        if (isMounted) {
          setErrorMessage(message);
          setStatus("failed");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [status]);

  if (status === "ready") {
    return <>{children}</>;
  }

  return (
    <div className="theme-shell d-flex justify-content-center">
      <section className="theme-card auth-wrap p-4 p-md-5 w-100" aria-live="polite">
        <p className="eyebrow mb-2">Demo environment</p>
        <h1 className="page-title mb-3">Preparing demo data</h1>
        {status === "failed" ? (
          <>
            <div className="alert alert-danger" role="alert">
              {errorMessage ?? "Demo reset failed."}
            </div>
            <Button type="button" onClick={() => setStatus("resetting")}>
              Retry
            </Button>
          </>
        ) : (
          <p className="text-muted mb-0">Resetting the demo workspace for this browser session.</p>
        )}
      </section>
    </div>
  );
}
