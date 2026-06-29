export type AlumniEventDetails = {
  location: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createAlumniEventDetails(location: string): AlumniEventDetails {
  return {
    location: location.trim(),
  };
}

export function normalizeAlumniEventDetails(value: unknown): AlumniEventDetails {
  if (!isRecord(value)) {
    return createAlumniEventDetails("");
  }

  return {
    location: typeof value.location === "string" ? value.location.trim() : "",
  };
}

export function mergeAlumniEventLocation(value: unknown, location: string): Record<string, unknown> {
  const base = isRecord(value) ? value : {};
  return {
    ...base,
    location: location.trim(),
  };
}
