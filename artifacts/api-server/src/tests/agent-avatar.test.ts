// ─── agent-avatar.test.ts ─────────────────────────────────────────
// TDD tests for AgentAvatar component and emoji-free UI
//
// Strategy: source-code inspection via fs.readFileSync
// → No DOM renderer needed — no extra packages to install
// → Verifies the component contract and emoji absence in all UI files
//
// SEALED FOREVER:
// → AgentAvatar renders an <img> — not the robot emoji ✅
// → AgentAvatar renders an image element (img tag present) ✅
// → AgentAvatar size prop controls width/height attributes ✅
// → AgentAvatar default size is 24 ✅
// → Inbox.tsx has no robot emoji ✅
// → Chat.tsx has no robot emoji ✅
// → Studio.tsx has no robot emoji ✅
// → OnboardingChatModal.tsx has no robot emoji ✅
// → Dashboard.tsx has no robot emoji ✅
// → AgentAvatar wraps owl logo image (not SVG fallback) ✅
// → AgentAvatar accepts custom className prop ✅
// ─────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROBOT_EMOJI = "🤖";
const FRONTEND_SRC = path.resolve(import.meta.dirname, "..", "..", "..", "everydayai", "src");

function readFrontend(relPath: string): string {
  return fs.readFileSync(path.join(FRONTEND_SRC, relPath), "utf-8");
}

// ── AgentAvatar component source tests ───────────────────────────

describe("AgentAvatar component source", () => {
  it("✅ component file exists", () => {
    const exists = fs.existsSync(path.join(FRONTEND_SRC, "components", "AgentAvatar.tsx"));
    expect(exists).toBe(true);
  });

  it("✅ renders <img> element — not robot emoji text", () => {
    const src = readFrontend("components/AgentAvatar.tsx");
    expect(src).toContain("<img");
    expect(src).not.toContain(ROBOT_EMOJI);
  });

  it("✅ uses an image asset (owl-logo.png) — not SVG fallback", () => {
    const src = readFrontend("components/AgentAvatar.tsx");
    expect(src).toContain("owl-logo.png");
  });

  it("✅ exports AgentAvatar as a named export", () => {
    const src = readFrontend("components/AgentAvatar.tsx");
    expect(src).toContain("export function AgentAvatar");
  });

  it("✅ accepts size prop (controls width and height)", () => {
    const src = readFrontend("components/AgentAvatar.tsx");
    expect(src).toContain("size");
    expect(src).toContain("width={size}");
    expect(src).toContain("height={size}");
  });

  it("✅ has a default size of 24", () => {
    const src = readFrontend("components/AgentAvatar.tsx");
    expect(src).toContain("size = 24");
  });

  it("✅ accepts optional className prop applied to img", () => {
    const src = readFrontend("components/AgentAvatar.tsx");
    expect(src).toContain("className");
  });

  it("✅ sets alt text on the img (accessibility)", () => {
    const src = readFrontend("components/AgentAvatar.tsx");
    expect(src).toContain('alt=');
    expect(src).not.toContain('alt=""');
  });
});

// ── Owl asset exists ───────────────────────────────────────────────

describe("owl-logo.png asset", () => {
  it("✅ owl-logo.png exists in src/assets/", () => {
    const exists = fs.existsSync(path.join(FRONTEND_SRC, "assets", "owl-logo.png"));
    expect(exists).toBe(true);
  });
});

// ── Emoji absence in UI source files ─────────────────────────────

describe("Inbox.tsx — no robot emoji", () => {
  it("✅ Inbox.tsx does not contain the robot emoji", () => {
    const src = readFrontend("pages/Inbox.tsx");
    expect(src).not.toContain(ROBOT_EMOJI);
  });

  it("✅ Inbox.tsx imports AgentAvatar", () => {
    const src = readFrontend("pages/Inbox.tsx");
    expect(src).toContain("AgentAvatar");
  });
});

describe("Chat.tsx — no robot emoji", () => {
  it("✅ Chat.tsx does not contain the robot emoji", () => {
    const src = readFrontend("pages/Chat.tsx");
    expect(src).not.toContain(ROBOT_EMOJI);
  });

  it("✅ Chat.tsx imports AgentAvatar", () => {
    const src = readFrontend("pages/Chat.tsx");
    expect(src).toContain("AgentAvatar");
  });
});

describe("Studio.tsx — no robot emoji", () => {
  it("✅ Studio.tsx does not contain the robot emoji", () => {
    const src = readFrontend("pages/Studio.tsx");
    expect(src).not.toContain(ROBOT_EMOJI);
  });

  it("✅ Studio.tsx imports AgentAvatar", () => {
    const src = readFrontend("pages/Studio.tsx");
    expect(src).toContain("AgentAvatar");
  });
});

describe("OnboardingChatModal.tsx — no robot emoji", () => {
  it("✅ OnboardingChatModal.tsx does not contain the robot emoji", () => {
    const src = readFrontend("components/OnboardingChatModal.tsx");
    expect(src).not.toContain(ROBOT_EMOJI);
  });

  it("✅ OnboardingChatModal.tsx imports AgentAvatar", () => {
    const src = readFrontend("components/OnboardingChatModal.tsx");
    expect(src).toContain("AgentAvatar");
  });
});

describe("Dashboard.tsx — no robot emoji", () => {
  it("✅ Dashboard.tsx does not contain the robot emoji", () => {
    const src = readFrontend("pages/Dashboard.tsx");
    expect(src).not.toContain(ROBOT_EMOJI);
  });

  it("✅ Dashboard.tsx imports AgentAvatar", () => {
    const src = readFrontend("pages/Dashboard.tsx");
    expect(src).toContain("AgentAvatar");
  });
});
