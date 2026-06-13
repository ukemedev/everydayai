import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import type { TranslationKeys } from "@zxcvbn-ts/core";

// ─── Minimal common-passwords dictionary ──────────────────────────────────────
// Rank = array index + 1.  Lower rank → fewer guesses → lower score.
// Avoids @zxcvbn-ts/language-* packages whose CJS bundles have an incompatible
// `decompress` export in Node v24 ({ default: fn } instead of fn directly).
const PASSWORD_LIST: string[] = [
  "password", "123456", "123456789", "12345678", "12345", "1234567",
  "password1", "iloveyou", "admin", "letmein", "welcome", "monkey",
  "login", "abc123", "starwars", "dragon", "passw0rd", "master",
  "hello", "freedom", "whatever", "qazwsx", "trustno1", "654321",
  "jordan23", "harley", "password2", "1234", "batman", "qwerty",
  "sunshine", "princess", "football", "charlie", "donald", "shadow",
  "superman", "michael", "baseball", "qwerty123", "1q2w3e4r", "aaaaaa",
  "111111", "1q2w3e", "password3", "zaq1zaq1", "aa123456", "abc123456",
];

// ─── English translations (plain strings — matches TranslationKeys exactly) ───
const TRANSLATIONS: TranslationKeys = {
  warnings: {
    straightRow:         "Use of common patterns reduces password security",
    keyPattern:          "Short keyboard patterns are easily guessed",
    simpleRepeat:        "Repeated characters like 'aaaa' are very easy to guess",
    extendedRepeat:      "Repeated character patterns like 'abcabcabc' are easy to guess",
    sequences:           "Common character sequences like 'abc' are easy to guess",
    recentYears:         "Recent years are easy to guess",
    dates:               "Dates are often easy to guess",
    topTen:              "This is a very common password",
    topHundred:          "This is a very common password",
    common:              "This is a very common password",
    similarToCommon:     "This is similar to a commonly used password",
    wordByItself:        "Single dictionary words are easy to guess",
    namesByThemselves:   "Single names or surnames by themselves are easy to guess",
    commonNames:         "Common names and surnames are easy to guess",
    userInputs:          "There should not be any personal or page related data here",
    pwned:               "This password has appeared in a data breach",
  },
  suggestions: {
    l33t:                "Avoid predictable letter substitutions like '@' for 'a'",
    reverseWords:        "Avoid reversed spellings of common words",
    allUppercase:        "Capitalize some, but not all letters",
    capitalization:      "Capitalize more than the first letter",
    dates:               "Avoid dates and years that are associated with you",
    recentYears:         "Avoid recent years",
    associatedYears:     "Avoid years that are associated with you",
    sequences:           "Avoid common character sequences",
    repeated:            "Avoid repeated words and characters",
    longerKeyboardPattern: "Use a longer keyboard pattern with more turns",
    anotherWord:         "Add more words that are less common",
    useWords:            "Use a few words, avoid common phrases",
    noNeed:              "No need for symbols, digits, or uppercase letters with a long passphrase",
    pwned:               "Use a password you haven't used anywhere else",
  },
  timeEstimation: {
    ltSecond:   "less than a second",
    second:     "{base} second",
    seconds:    "{base} seconds",
    minute:     "{base} minute",
    minutes:    "{base} minutes",
    hour:       "{base} hour",
    hours:      "{base} hours",
    day:        "{base} day",
    days:       "{base} days",
    month:      "{base} month",
    months:     "{base} months",
    year:       "{base} year",
    years:      "{base} years",
    centuries:  "centuries",
  },
};

// ─── Singleton factory (instantiated once at module load) ─────────────────────
const zxcvbn = new ZxcvbnFactory({
  dictionary:   { passwords: PASSWORD_LIST },
  translations: TRANSLATIONS,
});

export const MIN_SCORE = 3; // 0–4 scale; 3 = "safely unguessable"

export interface PasswordStrengthResult {
  score:        0 | 1 | 2 | 3 | 4;
  suggestions:  string[];
  warning:      string;
  isAcceptable: boolean;
}

/**
 * checkPasswordStrength — pure wrapper around zxcvbn-ts v4.
 *
 * Returns a score (0–4), specific improvement suggestions,
 * an optional warning, and a convenience `isAcceptable` flag.
 */
export function checkPasswordStrength(password: string): PasswordStrengthResult {
  const result = zxcvbn.check(password);

  const suggestions: string[] = [...(result.feedback.suggestions ?? [])];
  const warning: string        = result.feedback.warning ?? "";
  const score                  = result.score as 0 | 1 | 2 | 3 | 4;

  // Always give at least one actionable suggestion for weak passwords
  if (score < MIN_SCORE && suggestions.length === 0) {
    suggestions.push("Try a mix of uppercase letters, numbers, and symbols.");
  }

  return { score, suggestions, warning, isAcceptable: score >= MIN_SCORE };
}
