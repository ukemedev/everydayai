import { useMemo } from "react";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import type { TranslationKeys } from "@zxcvbn-ts/core";

// ─── Minimal common-passwords dictionary (matches backend) ────────────────────
// Avoids @zxcvbn-ts/language-* packages — the frontend workspace has a
// dictionary-compression v3/v4 mismatch that can cause bundling issues.
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

const TRANSLATIONS: TranslationKeys = {
  warnings: {
    straightRow:           "Use of common patterns reduces password security",
    keyPattern:            "Short keyboard patterns are easily guessed",
    simpleRepeat:          "Repeated characters like 'aaaa' are very easy to guess",
    extendedRepeat:        "Repeated character patterns like 'abcabcabc' are easy to guess",
    sequences:             "Common character sequences like 'abc' are easy to guess",
    recentYears:           "Recent years are easy to guess",
    dates:                 "Dates are often easy to guess",
    topTen:                "This is a very common password",
    topHundred:            "This is a very common password",
    common:                "This is a very common password",
    similarToCommon:       "This is similar to a commonly used password",
    wordByItself:          "Single dictionary words are easy to guess",
    namesByThemselves:     "Single names or surnames by themselves are easy to guess",
    commonNames:           "Common names and surnames are easy to guess",
    userInputs:            "There should not be any personal or page related data here",
    pwned:                 "This password has appeared in a data breach",
  },
  suggestions: {
    l33t:                  "Avoid predictable letter substitutions like '@' for 'a'",
    reverseWords:          "Avoid reversed spellings of common words",
    allUppercase:          "Capitalize some, but not all letters",
    capitalization:        "Capitalize more than the first letter",
    dates:                 "Avoid dates and years that are associated with you",
    recentYears:           "Avoid recent years",
    associatedYears:       "Avoid years that are associated with you",
    sequences:             "Avoid common character sequences",
    repeated:              "Avoid repeated words and characters",
    longerKeyboardPattern: "Use a longer keyboard pattern with more turns",
    anotherWord:           "Add more words that are less common",
    useWords:              "Use a few words, avoid common phrases",
    noNeed:                "No need for symbols, digits, or uppercase letters with a long passphrase",
    pwned:                 "Use a password you haven't used anywhere else",
  },
  timeEstimation: {
    ltSecond:  "less than a second",
    second:    "{base} second",
    seconds:   "{base} seconds",
    minute:    "{base} minute",
    minutes:   "{base} minutes",
    hour:      "{base} hour",
    hours:     "{base} hours",
    day:       "{base} day",
    days:      "{base} days",
    month:     "{base} month",
    months:    "{base} months",
    year:      "{base} year",
    years:     "{base} years",
    centuries: "centuries",
  },
};

// Singleton — instantiated once, reused across all component renders
const _zxcvbn = new ZxcvbnFactory({
  dictionary:   { passwords: PASSWORD_LIST },
  translations: TRANSLATIONS,
});

// ── Score metadata ─────────────────────────────────────────────────────────
const SCORE_META = [
  { label: "Too weak",    color: "#ef4444" },
  { label: "Weak",        color: "#f97316" },
  { label: "Fair",        color: "#eab308" },
  { label: "Strong",      color: "#22c55e" },
  { label: "Very strong", color: "#16a34a" },
] as const;

interface Props {
  password: string;
}

export interface PasswordEval {
  score:        0 | 1 | 2 | 3 | 4;
  isAcceptable: boolean;
  suggestions:  string[];
  warning:      string;
}

/** Evaluate a password client-side and return structured results. */
export function evaluatePassword(password: string): PasswordEval {
  if (!password) {
    return { score: 0, isAcceptable: false, suggestions: [], warning: "" };
  }
  const result      = _zxcvbn.check(password);
  const score       = result.score as 0 | 1 | 2 | 3 | 4;
  const suggestions = [...(result.feedback.suggestions ?? [])] as string[];
  const warning     = (result.feedback.warning ?? "") as string;

  if (score < 3 && suggestions.length === 0) {
    suggestions.push("Try a mix of uppercase letters, numbers, and symbols.");
  }
  return { score, isAcceptable: score >= 3, suggestions, warning };
}

/**
 * PasswordStrengthMeter — real-time visual strength indicator.
 *
 * Shows:
 * • 4-segment colored bar that fills as strength increases
 * • Strength label ("Weak", "Fair", "Strong", "Very strong")
 * • Specific improvement suggestions (e.g. "Add a symbol")
 * • Warning text (e.g. "This is similar to a commonly used password")
 */
export default function PasswordStrengthMeter({ password }: Props) {
  const eval_ = useMemo(() => evaluatePassword(password), [password]);

  if (!password) return null;

  const { score, suggestions, warning } = eval_;
  const meta   = SCORE_META[score];
  const filled = score + 1;

  return (
    <div className="flex flex-col gap-2 mt-1">
      {/* ── Segmented bar ── */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i < filled ? meta.color : "rgba(255,255,255,0.1)",
            }}
          />
        ))}
      </div>

      {/* ── Label ── */}
      <p className="text-xs font-medium" style={{ color: meta.color }}>
        {meta.label}
      </p>

      {/* ── Warning ── */}
      {warning && (
        <p className="text-xs text-amber-400 leading-snug">{warning}</p>
      )}

      {/* ── Suggestions (only shown for weak passwords) ── */}
      {suggestions.length > 0 && score < 3 && (
        <ul className="flex flex-col gap-0.5">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="text-xs text-white/50 leading-snug flex items-start gap-1.5"
            >
              <span className="mt-0.5 shrink-0" style={{ color: meta.color }}>→</span>
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
