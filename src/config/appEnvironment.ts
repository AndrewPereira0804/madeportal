export type AppEnvironment = "production" | "demo";

function normalizeAppEnvironment(value: unknown): AppEnvironment {
  return typeof value === "string" && value.trim().toLowerCase() === "demo" ? "demo" : "production";
}

export const appEnvironment = normalizeAppEnvironment(import.meta.env.VITE_APP_ENV);
export const isDemoEnvironment = appEnvironment === "demo";
