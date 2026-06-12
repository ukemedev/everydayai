// ─── AgentAvatar.test.tsx ────────────────────────────────────────
// TDD tests for the AgentAvatar component and emoji-free UI
//
// SEALED FOREVER:
// → AgentAvatar renders an <img> — not text emoji ✅
// → AgentAvatar renders an image or SVG element ✅
// → AgentAvatar size prop 32 produces 32px dimensions ✅
// → Inbox source has no robot emoji ✅
// → Chat source has no robot emoji ✅
// → Studio source has no robot emoji ✅
// → OnboardingChatModal source has no robot emoji ✅
// → Dashboard source has no robot emoji ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import fs from "fs";
import path from "path";

// Dynamic import of the component (works in node/vitest environment)
// We test the rendered HTML string via renderToStaticMarkup

const ROBOT_EMOJI = "🤖";
const SRC_DIR = path.resolve(import.meta.dirname, "..");

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(SRC_DIR, relPath), "utf-8");
}

// ── AgentAvatar component tests ───────────────────────────────────

describe("AgentAvatar component", () => {
  it("✅ renders an <img> element — not the robot emoji", async () => {
    const { AgentAvatar } = await import("../components/AgentAvatar.js");
    const html = renderToStaticMarkup(createElement(AgentAvatar, {}));
    expect(html).not.toContain(ROBOT_EMOJI);
    expect(html.toLowerCase()).toMatch(/^<img/);
  });

  it("✅ renders an image element (not text content)", async () => {
    const { AgentAvatar } = await import("../components/AgentAvatar.js");
    const html = renderToStaticMarkup(createElement(AgentAvatar, {}));
    expect(html).toContain("<img");
    expect(html).toContain('alt="AI agent"');
  });

  it("✅ default size is 24px", async () => {
    const { AgentAvatar } = await import("../components/AgentAvatar.js");
    const html = renderToStaticMarkup(createElement(AgentAvatar, {}));
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
  });

  it("✅ size prop 32 renders element with 32px dimensions", async () => {
    const { AgentAvatar } = await import("../components/AgentAvatar.js");
    const html = renderToStaticMarkup(createElement(AgentAvatar, { size: 32 }));
    expect(html).toContain('width="32"');
    expect(html).toContain('height="32"');
  });

  it("✅ size prop 16 renders element with 16px dimensions", async () => {
    const { AgentAvatar } = await import("../components/AgentAvatar.js");
    const html = renderToStaticMarkup(createElement(AgentAvatar, { size: 16 }));
    expect(html).toContain('width="16"');
    expect(html).toContain('height="16"');
  });

  it("✅ custom className is applied to the img", async () => {
    const { AgentAvatar } = await import("../components/AgentAvatar.js");
    const html = renderToStaticMarkup(createElement(AgentAvatar, { className: "my-custom-class" }));
    expect(html).toContain("my-custom-class");
  });
});

// ── Source file emoji-absence tests ───────────────────────────────

describe("Inbox.tsx — no robot emoji in source", () => {
  it("✅ Inbox.tsx does not contain the robot emoji", () => {
    const src = readSource("pages/Inbox.tsx");
    const occurrences = (src.match(/🤖/g) ?? []).length;
    expect(occurrences).toBe(0);
  });
});

describe("Chat.tsx — no robot emoji in source", () => {
  it("✅ Chat.tsx does not contain the robot emoji", () => {
    const src = readSource("pages/Chat.tsx");
    const occurrences = (src.match(/🤖/g) ?? []).length;
    expect(occurrences).toBe(0);
  });
});

describe("Studio.tsx — no robot emoji in source", () => {
  it("✅ Studio.tsx does not contain the robot emoji", () => {
    const src = readSource("pages/Studio.tsx");
    const occurrences = (src.match(/🤖/g) ?? []).length;
    expect(occurrences).toBe(0);
  });
});

describe("OnboardingChatModal.tsx — no robot emoji in source", () => {
  it("✅ OnboardingChatModal.tsx does not contain the robot emoji", () => {
    const src = readSource("components/OnboardingChatModal.tsx");
    const occurrences = (src.match(/🤖/g) ?? []).length;
    expect(occurrences).toBe(0);
  });
});

describe("Dashboard.tsx — no robot emoji in source", () => {
  it("✅ Dashboard.tsx does not contain the robot emoji", () => {
    const src = readSource("pages/Dashboard.tsx");
    const occurrences = (src.match(/🤖/g) ?? []).length;
    expect(occurrences).toBe(0);
  });
});
