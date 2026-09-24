export type WcagVersion = "2.0" | "2.1" | "2.2";
export type WcagLevel = "A" | "AA" | "AAA";
export interface Profile { version: WcagVersion; level: WcagLevel }
export const DEFAULT_PROFILE: Profile = { version: "2.2", level: "AA" };

export interface ContrastCriterion {
  id: "1.4.3" | "1.4.6";
  level: "AA" | "AAA";
  normal: number;
  large: number;
}

const MINIMUM: ContrastCriterion = { id: "1.4.3", level: "AA", normal: 4.5, large: 3 };
const ENHANCED: ContrastCriterion = { id: "1.4.6", level: "AAA", normal: 7, large: 4.5 };

export function criteriaFor(profile: Profile): ContrastCriterion[] {
  if (profile.level === "A") return [];
  return profile.level === "AAA" ? [MINIMUM, ENHANCED] : [MINIMUM];
}

export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  return (object.version === "2.0" || object.version === "2.1" || object.version === "2.2") &&
    (object.level === "A" || object.level === "AA" || object.level === "AAA");
}
