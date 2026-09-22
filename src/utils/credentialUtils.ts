import crypto from "crypto";

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const NUMBERS = "0123456789";
const SPECIAL = "!@#$%^&*()-_=+";
const ALL_CHARS = UPPERCASE + LOWERCASE + NUMBERS + SPECIAL;

/**
 * Generates a cryptographically secure random temporary password.
 * Uses crypto.randomInt (Node.js CSPRNG) to ensure unpredictability and entropy.
 * Enforces inclusion of uppercase, lowercase, numeric, and special characters.
 */
export function generateTemporaryPassword(length: number = 16): string {
  const targetLength = Math.max(12, length);

  // Guarantee at least one character from each class
  const chars: string[] = [
    UPPERCASE[crypto.randomInt(0, UPPERCASE.length)],
    LOWERCASE[crypto.randomInt(0, LOWERCASE.length)],
    NUMBERS[crypto.randomInt(0, NUMBERS.length)],
    SPECIAL[crypto.randomInt(0, SPECIAL.length)],
  ];

  // Fill remaining characters from complete pool
  for (let i = chars.length; i < targetLength; i++) {
    chars.push(ALL_CHARS[crypto.randomInt(0, ALL_CHARS.length)]);
  }

  // Fisher-Yates shuffle using crypto.randomInt
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = chars[i];
    chars[i] = chars[j];
    chars[j] = temp;
  }

  return chars.join("");
}

/**
 * Checks if a candidate temporary password matches known predictable or default patterns.
 */
export function isPredictablePassword(password?: string, fullName?: string): boolean {
  if (!password || typeof password !== "string" || password.trim().length === 0) {
    return true;
  }

  const trimmed = password.trim();

  // Known predictable default passwords
  if (trimmed === "TempAuth123!" || trimmed === "password123" || trimmed === "admin123") {
    return true;
  }

  // Pattern: firstName + "123" (e.g. john123, alice123)
  if (fullName && typeof fullName === "string") {
    const firstName = fullName.trim().toLowerCase().split(/\s+/)[0];
    if (firstName && (trimmed.toLowerCase() === `${firstName}123` || trimmed.toLowerCase() === `${firstName}123!`)) {
      return true;
    }
  }

  // Passwords shorter than minimum policy
  if (trimmed.length < 8) {
    return true;
  }

  return false;
}

