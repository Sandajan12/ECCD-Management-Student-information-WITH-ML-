import type {ChildProfile} from './contracts';
export const PROFILE_FIELDS = ['emergency_contact', 'address', 'handedness', 'num_of_siblings', 'birth_order',
  'father_name', 'father_age', 'father_occ', 'father_educ', 'mother_name', 'mother_age', 'mother_occ', 'mother_educ',
  'legal_guardian_name', 'legal_guardian_age', 'legal_guardian_occ', 'legal_guardian_educ'] as const;
export type ProfileField = typeof PROFILE_FIELDS[number];
export type ProfileValues = Record<ProfileField, string>;
export type ProfilePayload = Partial<Record<ProfileField, string | number | null>>;
const numeric = new Set<ProfileField>(['num_of_siblings', 'father_age', 'mother_age', 'legal_guardian_age']);
export function profileValues(child?: ChildProfile): ProfileValues {
  return Object.fromEntries(PROFILE_FIELDS.map(field => [field, String(child?.[field] ?? '')])) as ProfileValues;
}
export function validateProfile(values: ProfileValues, baseline: ProfileValues): string {
  for (const prefix of ['father', 'mother', 'legal_guardian'] as const) {
    const name = values[`${prefix}_name`].trim();
    if (!name && (baseline[`${prefix}_name`].trim() || ['age', 'occ', 'educ'].some(suffix => values[`${prefix}_${suffix}` as ProfileField].trim())))
      return `${prefix.replaceAll('_', ' ')} name is required when updating guardian information.`;
    if (name && (!/^[\p{L}\p{M} .'-]+$/u.test(name) || !/\p{L}/u.test(name)))
      return 'Names may contain only letters, spaces, hyphens, apostrophes and periods.';
  }
  if (values.emergency_contact.trim() && !/^09[0-9]{9}$/.test(values.emergency_contact.trim())) return 'Contact number must begin with 09 and contain exactly 11 digits.';
  for (const field of PROFILE_FIELDS) {
    const value = values[field].trim();
    if (numeric.has(field) && value && (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(Number(value)))) return 'Ages and number of siblings must be non-negative whole numbers.';
    const limit = field.endsWith('_name') || field === 'address' ? 100 : field.endsWith('_occ') || field === 'birth_order' ? 50 : field.endsWith('_educ') ? 20 : 0;
    if (limit && [...value].length > limit) return `${field.replaceAll('_', ' ')} must not exceed ${limit} characters.`;
  }
  if (values.handedness && !['Left', 'Right'].includes(values.handedness)) return 'Handedness must be Left or Right.';
  return '';
}
export function profilePayload(values: ProfileValues, baseline: ProfileValues): ProfilePayload {
  const normalize = (key: ProfileField, input: string) => input.trim() ? numeric.has(key) ? Number(input.trim()) : input.trim() : null;
  return Object.fromEntries(PROFILE_FIELDS.filter(key => normalize(key, values[key]) !== normalize(key, baseline[key]))
    .map(key => [key, normalize(key, values[key])])) as ProfilePayload;
}
export function linkError(lrn: string): string { return /^[0-9]{12}$/.test(lrn.trim()) ? '' : 'Enter exactly 12 ASCII digits for the LRN.'; }
export function linkPayload(values: {lrn_number: string}): {lrn_number: string} {
  return {lrn_number: values.lrn_number.trim()};
}
