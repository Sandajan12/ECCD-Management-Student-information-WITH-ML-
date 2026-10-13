import type { Student } from "../types";

export const PROFILE_FIELDS = ["emergency_contact", "address", "handedness", "num_of_siblings", "birth_order", "father_name", "father_age", "father_occ", "father_educ", "mother_name", "mother_age", "mother_occ", "mother_educ"] as const;
export type ProfileField = typeof PROFILE_FIELDS[number];
export type ParentProfileValues = Record<ProfileField, string>;

export function profileValues(child?: Student): ParentProfileValues {
  return Object.fromEntries(PROFILE_FIELDS.map(field => [field, String(child?.[field] ?? "")])) as ParentProfileValues;
}

// Legacy formValidation rules and the current parent update contract's limits.
export function validateProfile(values: ParentProfileValues): string {
  for (const field of ["father_name", "mother_name"] as const) {
    const name = values[field].trim();
    if (name && (!/^[\p{L}\p{M} .'-]+$/u.test(name) || !/\p{L}/u.test(name)))
      return "Names may contain only letters, spaces, hyphens, apostrophes and periods.";
  }
  if (values.emergency_contact.trim() && !/^09\d{9}$/.test(values.emergency_contact.trim()))
    return "Contact number must begin with 09 and contain exactly 11 digits.";
  for (const field of ["num_of_siblings", "father_age", "mother_age"] as const) {
    const value = values[field].trim();
    if (value && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))))
      return "Ages and number of siblings must be non-negative whole numbers.";
  }
  const limits: Partial<Record<ProfileField, number>> = { address: 100, birth_order: 50, father_name: 100, mother_name: 100, father_occ: 50, mother_occ: 50, father_educ: 20, mother_educ: 20 };
  for (const field of PROFILE_FIELDS) {
    if (limits[field] && values[field].trim().length > limits[field]!)
      return `${field.replaceAll("_", " ")} must not exceed ${limits[field]} characters.`;
  }
  if (values.handedness && !["Left", "Right"].includes(values.handedness)) return "Handedness must be Left or Right.";
  return "";
}

export function profilePayload(values: ParentProfileValues): Record<ProfileField, string | number | null> {
  return Object.fromEntries(PROFILE_FIELDS.map(field => {
    const value = values[field].trim();
    return [field, value ? (["num_of_siblings", "father_age", "mother_age"].includes(field) ? Number(value) : value) : null];
  })) as Record<ProfileField, string | number | null>;
}
