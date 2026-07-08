// ── Template registry ──────────────────────────────────────────────────────────
// The catalog of reusable animated things a sprite scene can render. Each template
// draws itself from canvas primitives around a local origin; the renderer has
// already applied the sprite's position, scale, rotation and opacity before
// calling draw(), so templates only worry about *shape*, not placement.
//
// Anchor conventions (so keyframes read intuitively):
//   • characters/objects that sit on the ground (boy, ground) anchor at their FEET
//     — local origin (0,0) is the bottom-center, and they're drawn upward (-y).
//   • free-floating objects (ball, cloud, sun, star) anchor at their CENTER.
//
// To add a template: register one entry here and list it in the Groq prompt
// (SYSTEM_PROMPT in lib/llm.ts). No renderer changes needed.

import { clamp, lerp } from './utils';

export interface SpriteState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  props: Record<string, any>;
  /** Vertical velocity in px/s (+ = downward). Provided by the renderer so
   *  templates can pose themselves from motion. */
  vy?: number;
  /** Height in px above the sprite's rest position (feet off the floor). */
  lift?: number;
}

export interface Template {
  /** Human label (for a future palette / picker UI). */
  label: string;
  /** Anchor hint, documented above. */
  anchor: 'feet' | 'center';
  /** Draw an automatic contact shadow on the ground beneath this template. */
  castsShadow?: boolean;
  /** Shadow half-width in px at scale 1 (defaults to 56). */
  shadowRadius?: number;
  draw(ctx: CanvasRenderingContext2D, s: SpriteState, W: number, H: number, time: number): void;
}

// ── Small drawing helpers ────────────────────────────────────────────────────────
function capsule(
  ctx: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  r: number, color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// ── Templates ────────────────────────────────────────────────────────────────────
export const TEMPLATES: Record<string, Template> = {
  // A two-segment rigged character that poses itself from motion: legs tuck up at
  // the apex, extend on the way up/down, and arms swing overhead as it rises.
  // Feet-anchored (origin = ground contact point when standing).
  boy: {
    label: 'Boy',
    anchor: 'feet',
    castsShadow: true,
    shadowRadius: 58,
    draw(ctx, s) {
      const shirt = s.props.color || '#38bdf8';
      const skin = s.props.skin || '#f4c9a0';
      const pants = s.props.pants || '#33415c';
      const shoe = s.props.shoe || '#e8eaed';
      const hair = s.props.hair || '#2b2b2f';

      const vy = s.vy || 0;              // px/s, + = falling
      const lift = Math.max(0, s.lift || 0);
      const airborne = lift > 14;
      // tuck: knees pull up near the apex (airborne + slow); 0 while grounded/fast
      const tuck = airborne ? clamp(1 - Math.abs(vy) / 1000, 0, 1) : 0;
      // armUp: arms raise the higher he goes
      const armUp = clamp(lift / 110, 0, 1);

      const hipY = -150;
      const shoulderY = -232;
      const headY = -272;
      const headR = 33;

      // ── legs (hip → knee → foot), mirrored ──
      const footY = lerp(0, -92, tuck);
      const footX = lerp(20, 34, tuck);
      const kneeX = lerp(16, 44, tuck);
      const kneeY = lerp(-74, -104, tuck);
      for (const sd of [-1, 1]) {
        capsule(ctx, sd * 11, hipY, sd * kneeX, kneeY, 12, pants);
        capsule(ctx, sd * kneeX, kneeY, sd * footX, footY, 11, pants);
        capsule(ctx, sd * footX, footY, sd * (footX + 15), footY + 3, 7, shoe);
      }

      // ── torso ──
      capsule(ctx, 0, shoulderY, 0, hipY + 6, 24, shirt);

      // ── arms (shoulder → elbow → hand), mirrored ──
      const shX = 20;
      const elbX = lerp(40, 34, armUp);
      const elbY = lerp(-196, -266, armUp);
      const handX = lerp(48, 26, armUp);
      const handY = lerp(-150, -300, armUp);
      for (const sd of [-1, 1]) {
        capsule(ctx, sd * shX, shoulderY + 4, sd * elbX, elbY, 10, shirt);
        capsule(ctx, sd * elbX, elbY, sd * handX, handY, 9, skin);
        circle(ctx, sd * handX, handY, 8, skin);
      }

      // ── head ──
      circle(ctx, 0, headY, headR, skin);
      // hair cap
      ctx.fillStyle = hair;
      ctx.beginPath();
      ctx.arc(0, headY - 3, headR + 2, Math.PI * 1.02, Math.PI * 1.98);
      ctx.fill();
      // eyes (glance up a touch while rising)
      const ey = headY - armUp * 3;
      circle(ctx, -11, ey, 4.2, '#1f2937');
      circle(ctx, 11, ey, 4.2, '#1f2937');
      // smile
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, headY + 7, 11, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    },
  },

  ball: {
    label: 'Ball',
    anchor: 'center',
    castsShadow: true,
    shadowRadius: 46,
    draw(ctx, s) {
      const color = s.props.color || '#ff7b9c';
      const r = 44;
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, color);
      g.addColorStop(1, color);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      // shine
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(-r * 0.32, -r * 0.32, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    },
  },

  cloud: {
    label: 'Cloud',
    anchor: 'center',
    draw(ctx, s) {
      const color = s.props.color || 'rgba(255,255,255,0.9)';
      ctx.fillStyle = color;
      const puffs = [
        [-46, 8, 30], [-10, -6, 40], [30, 2, 34], [56, 12, 24], [0, 20, 46],
      ];
      for (const [x, y, r] of puffs) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },

  sun: {
    label: 'Sun',
    anchor: 'center',
    draw(ctx, s, _W, _H, time) {
      const color = s.props.color || '#fbbf24';
      // rays (slow rotation independent of scene rotation)
      ctx.save();
      ctx.rotate(time * 0.3);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 52, Math.sin(a) * 52);
        ctx.lineTo(Math.cos(a) * 74, Math.sin(a) * 74);
        ctx.stroke();
      }
      ctx.restore();
      circle(ctx, 0, 0, 44, color);
    },
  },

  star: {
    label: 'Star',
    anchor: 'center',
    draw(ctx, s) {
      const color = s.props.color || '#fde68a';
      const spikes = 5;
      const outer = 40;
      const inner = 17;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    },
  },

  // A ground/floor strip. Feet-anchored so its top edge sits at the sprite's y.
  ground: {
    label: 'Ground',
    anchor: 'feet',
    draw(ctx, s, W) {
      const top = s.props.color || '#233a28';
      const bottom = s.props.bottom || '#16241a';
      const halfW = W; // draw well past the frame; scale/position handle the rest
      const g = ctx.createLinearGradient(0, 0, 0, 600);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      ctx.fillStyle = g;
      ctx.fillRect(-halfW, 0, halfW * 2, 600);
      // grass edge highlight
      ctx.fillStyle = s.props.edge || '#4ade80';
      ctx.fillRect(-halfW, -5, halfW * 2, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(-halfW, 2, halfW * 2, 2);
    },
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES);
