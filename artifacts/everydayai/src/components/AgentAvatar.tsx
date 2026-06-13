// ─── AgentAvatar.tsx ─────────────────────────────────────────────
// Reusable owl logo avatar for AI agent representation.
// Uses the owl logo image asset (owl-logo.png / owl-logo.webp) — never emoji.
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

interface AgentAvatarProps {
  size?: number;
  className?: string;
}

export function AgentAvatar({ size = 24, className = "" }: AgentAvatarProps) {
  return (
    <img
      src="/owl-logo.webp"
      alt="AI agent"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "cover", flexShrink: 0 }}
    />
  );
}
