import type { ReactNode } from "react";
import { isDemoEnvironment } from "../config/appEnvironment";
import { cx } from "./ui";

type EnvironmentChromeProps = {
  children: ReactNode;
};

export default function EnvironmentChrome({ children }: EnvironmentChromeProps) {
  return (
    <div className={cx("environment-chrome", isDemoEnvironment && "environment-chrome--demo")}>
      {isDemoEnvironment && (
        <header className="demo-environment-banner" role="banner" aria-label="Demo environment notice">
          DEMO PURPOSES ONLY
        </header>
      )}
      {children}
    </div>
  );
}
