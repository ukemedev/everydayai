---
name: zxcvbn-ts v4 CJS decompress bug
description: @zxcvbn-ts/language-* packages crash in Node v24 CJS environments with "decompress is not a function". Fix and correct v4 API usage.
---

# zxcvbn-ts v4 CJS decompress bug

## The rule
Never import `@zxcvbn-ts/language-common` or `@zxcvbn-ts/language-en` in backend (Node/Vitest) code.
Use `ZxcvbnFactory` from `@zxcvbn-ts/core` only, with an inline `PASSWORD_LIST` and a hand-written `TranslationKeys` object.

**Why:** In Node v24, the CJS bundles of language-* packages do:
```javascript
var decompress = require('@zxcvbn-ts/dictionary-compression/decompress');
decompress(data); // TypeError: decompress is not a function
```
The `decompress.cjs` file exports `{ default: fn }` (named-export object), not `fn` directly.
`server.deps.inline` in Vitest does NOT fix this — the inner `require()` still uses Node's CJS loader.

**How to apply:**
1. `passwordStrength.ts` (backend) — `ZxcvbnFactory` + inline `PASSWORD_LIST` + `TRANSLATIONS` object
2. `PasswordStrengthMeter.tsx` (frontend) — same pattern; avoids the dictionary-compression v3/v4 mismatch in the frontend workspace
3. `TranslationKeys` requires three sections: `warnings`, `suggestions`, `timeEstimation` — all keys must be present or ZxcvbnFactory throws "Invalid translations object"
4. Correct key names (v4): `straightRow`, `keyPattern`, `simpleRepeat`, `extendedRepeat` (NOT `straightRowsOfKeys`, `shortKeyboardPatterns`, etc.)

## v4 API change (v3 → v4)
- v3: `import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core"` → `zxcvbnOptions.setOptions(…); zxcvbn("pw")`
- v4: `import { ZxcvbnFactory } from "@zxcvbn-ts/core"` → `const z = new ZxcvbnFactory(options); z.check("pw")`

Frontend Vite (ESM) does NOT have the decompress bug — but the frontend workspace also has `@zxcvbn-ts/dictionary-compression@^3.0.1` (v3) while language packs are v4, causing a different mismatch. Use the inline approach everywhere for consistency.
