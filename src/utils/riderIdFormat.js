/** PH plate: ABC 1234 (letters + space + digits), always caps. */
export function formatPlateNumber(raw) {
  const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letters = cleaned.replace(/[^A-Z]/g, '').slice(0, 3);
  const numbers = cleaned.replace(/[^0-9]/g, '').slice(0, 4);
  if (letters.length === 0) return '';
  if (letters.length < 3) return letters;
  if (numbers.length === 0) return letters;
  return `${letters} ${numbers}`;
}

/** PH license: N01-23-456789 (letter + digits with dashes), always caps. */
export function formatLicenseNumber(raw) {
  const cleaned = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const letter = cleaned.slice(0, 1).replace(/[^A-Z]/g, '');
  if (!letter) return '';
  const rest = cleaned.slice(1).replace(/[^0-9]/g, '');
  const p2 = rest.slice(0, 2);
  const p3 = rest.slice(2, 4);
  const p4 = rest.slice(4, 10);
  let result = letter;
  if (p2.length > 0) result += p2;
  if (p2.length === 2) {
    result = `${letter}${p2}`;
    if (p3.length > 0) result += `-${p3}`;
    if (p3.length === 2 && p4.length > 0) result += `-${p4}`;
  }
  return result;
}

export const PLATE_REGEX = /^[A-Z]{3} \d{4}$/;
export const LICENSE_REGEX = /^[A-Z]\d{2}-\d{2}-\d{6}$/;
