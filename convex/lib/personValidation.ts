/** Server-side mirror of src/utils/personFieldValidation.js */

const VOWELS = /[aeiouáéíóúü]/i;
const NAME_ALLOWED = /^[a-zA-ZÀ-ÿñÑ\s.'’-]+$/;
const ADDRESS_ALLOWED = /^[a-zA-ZÀ-ÿñÑ0-9\s.,#'’/\-()]+$/;

const countLetters = (s: string) => (s.match(/[a-zA-ZÀ-ÿñÑ]/g) || []).length;
const letterOnly = (s: string) => s.replace(/[^a-zA-ZÀ-ÿñÑ]/g, "");

export const looksLikeGibberish = (raw: string): boolean => {
  const text = String(raw || "").trim();
  if (!text) return true;

  const letters = letterOnly(text);
  if (letters.length < 3) return true;

  const digits = (text.match(/\d/g) || []).length;
  if (digits >= 3 && digits >= letters.length * 0.35) return true;

  if (letters.length >= 5 && !VOWELS.test(letters)) return true;
  if (/[bcdfghjklmnpqrstvwxyzñ]{5,}/i.test(letters)) return true;
  if (/(.)\1{2,}/i.test(letters)) return true;

  const vowelCount = (letters.match(/[aeiouáéíóúü]/gi) || []).length;
  if (letters.length >= 8 && vowelCount / letters.length < 0.18) return true;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 1 && letters.length >= 10 && vowelCount / letters.length < 0.25) {
    return true;
  }

  return false;
};

export const validatePersonName = (raw: string, required = true): string | null => {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  if (!name) return required ? "Full name is required." : null;
  if (name.length < 5) return "Enter a real full name (at least 5 characters).";
  if (name.length > 60) return "Name is too long.";
  if (!NAME_ALLOWED.test(name)) {
    return "Name can only contain letters, spaces, hyphens, and apostrophes.";
  }
  if (/\d/.test(name)) return "Name cannot contain numbers.";

  const parts = name.split(" ").filter(Boolean);
  if (parts.length < 2) return "Enter first and last name.";
  if (parts.some((p) => p.length < 2)) return "Each name part must be at least 2 letters.";
  if (looksLikeGibberish(name)) return "Please enter a real name — random letters are not allowed.";

  return null;
};

export const validateAddress = (
  raw: string | undefined,
  required = false
): string | null => {
  const address = String(raw || "").replace(/\s+/g, " ").trim();
  if (!address) return required ? "Address / location is required." : null;
  if (address.length < 12) return "Enter a complete address (street, barangay, city).";
  if (address.length > 160) return "Address is too long.";
  if (!ADDRESS_ALLOWED.test(address)) return "Address contains invalid characters.";
  if (countLetters(address) < 8) return "Address needs more letters — enter a real location.";
  if (looksLikeGibberish(address)) {
    return "Please enter a real address — random text is not allowed.";
  }

  const words = address.split(/[\s,]+/).filter((w) => /[a-zA-ZÀ-ÿñÑ]{2,}/.test(w));
  if (words.length < 2) {
    return "Include at least street/barangay and city.";
  }

  return null;
};
