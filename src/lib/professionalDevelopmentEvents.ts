export type ProfessionalDevelopmentEventDetails = {
  speaker: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createProfessionalDevelopmentEventDetails(
  speaker: string,
): ProfessionalDevelopmentEventDetails {
  return {
    speaker: speaker.trim(),
  };
}

export function normalizeProfessionalDevelopmentEventDetails(
  value: unknown,
): ProfessionalDevelopmentEventDetails {
  if (!isRecord(value)) {
    return createProfessionalDevelopmentEventDetails("");
  }

  return {
    speaker: typeof value.speaker === "string" ? value.speaker.trim() : "",
  };
}

export function mergeProfessionalDevelopmentSpeaker(
  value: unknown,
  speaker: string,
): Record<string, unknown> {
  const base = isRecord(value) ? value : {};
  return {
    ...base,
    speaker: speaker.trim(),
  };
}
