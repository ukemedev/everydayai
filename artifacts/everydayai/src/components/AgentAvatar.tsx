// ─── AgentAvatar.tsx ─────────────────────────────────────────────
// Reusable owl logo avatar for AI agent representation.
// Uses the owl logo image asset — never emoji.
//
// Props:
//   size      — pixel dimension (width + height). Default: 24
//   className — extra CSS classes for the <img> element
//
// WHY this exists:
// → Replaces the robot emoji across all UI surfaces
// → Single source of truth for the AI agent visual identity
// → Image with object-cover so it fills any rounded container
// ─────────────────────────────────────────────────────────────────

import owlLogo from "../assets/owl-logo.png";

interface AgentAvatarProps {
  size?: number;
  className?: string;
}

export function AgentAvatar({ size = 24, className = "" }: AgentAvatarProps) {
  return (
    <img
      src={owlLogo}
      alt="AI agent"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "cover", flexShrink: 0 }}
    />
  );
}
