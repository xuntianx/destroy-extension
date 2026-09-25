import { motionMarkers } from "./motions";
type Point = { x: number; y: number };
/** The hot plume stays in front of the muzzle. Remote impacts still use actual page coordinates. */
export function breathAim(mouth: Point, target: Point, mirror = false) {
  const direction = mirror ? -1 : 1;
  const dx = (target.x - mouth.x) * direction,
    dy = target.y - mouth.y;
  const angle = Math.max(
    (-55 * Math.PI) / 180,
    Math.min((25 * Math.PI) / 180, Math.atan2(dy, dx)),
  );
  const distance = Math.max(1, Math.hypot(dx, dy));
  return {
    x: mouth.x + Math.cos(angle) * distance * direction,
    y: mouth.y + Math.sin(angle) * distance,
  };
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};

/** Hand-drawn flame silhouettes shared by runtime and visual review. No SVG filters or random frames. */
export function breathMarkup(
  mouth: Point,
  target: Point,
  progress: number,
  small = false,
  reduced = false,
  mirror = false,
) {
  const { fire, hit, end } = motionMarkers.breath;
  const p = clamp(progress);
  const aimed = breathAim(mouth, target, mirror);
  const angle =
    (Math.atan2(aimed.y - mouth.y, aimed.x - mouth.x) * 180) / Math.PI;
  const distance = Math.max(
    1,
    Math.hypot(target.x - mouth.x, target.y - mouth.y),
  );
  const wave = (i: number) => (reduced ? 0 : Math.sin(p * 51 - i * 1.4) * 0.24);
  const wrap = (body: string) =>
    `<g transform="translate(${mouth.x} ${mouth.y}) rotate(${angle})">${body}</g>`;
  if (p < fire) {
    const charge = ease((p - 0.07) / (fire - 0.07));
    if (!charge) return "";
    const sparks = [0, 1, 2]
      .map((i) => {
        const a = -0.8 + i * 0.8,
          radius = 34 * (1 - charge) + 12;
        return `<path d="M ${Math.cos(a) * radius} ${Math.sin(a) * radius} q -5 -3 -9 0 q 4 4 9 0" fill="#efac55" opacity="${charge}"/>`;
      })
      .join("");
    return wrap(
      `<ellipse cx="6" cy="0" rx="${5 + charge * 7}" ry="${3 + charge * 4}" fill="#ffd779" opacity="${charge * 0.85}"/>${sparks}`,
    );
  }
  if (p >= end) return "";
  const growth = ease((p - fire) / (hit - fire));
  const fade = ease((end - p) / 0.045);
  const length = Math.max(12, distance * growth) * (0.2 + 0.8 * fade);
  // Preserve the flame's proportions at real page distances; never collapse into a laser line.
  const width = Math.min(small ? 65 : 120, length * 0.19);
  const root = Math.max(6, Math.min(18, width * 0.22));
  const x = (v: number) => length * v;
  const y = (v: number) => width * v;
  const outer = `M 0 ${-root} C ${x(0.1)} ${y(-0.12)} ${x(0.12)} ${y(-0.7 + wave(0))} ${x(0.28)} ${y(-0.75 + wave(0))} Q ${x(0.23)} ${y(-0.38)} ${x(0.36)} ${y(-0.4)} C ${x(0.38)} ${y(-0.78 + wave(1))} ${x(0.42)} ${y(-1.25 + wave(1))} ${x(0.59)} ${y(-1.13 + wave(1))} Q ${x(0.5)} ${y(-0.53)} ${x(0.62)} ${y(-0.51)} C ${x(0.65)} ${y(-0.98 + wave(2))} ${x(0.73)} ${y(-1.02 + wave(2))} ${x(0.82)} ${y(-0.88 + wave(2))} Q ${x(0.76)} ${y(-0.37)} ${x(0.85)} ${y(-0.3)} Q ${x(0.93)} ${y(-0.29)} ${length} ${y(-0.13)} Q ${x(0.91)} ${y(0.1)} ${x(0.82)} ${y(0.18)} Q ${x(0.87)} ${y(0.55 + wave(3))} ${x(0.78)} ${y(0.82 + wave(3))} Q ${x(0.73)} ${y(0.4)} ${x(0.64)} ${y(0.47)} C ${x(0.62)} ${y(1.0 + wave(4))} ${x(0.48)} ${y(1.2 + wave(4))} ${x(0.38)} ${y(0.86 + wave(4))} Q ${x(0.47)} ${y(0.65)} ${x(0.37)} ${y(0.43)} C ${x(0.31)} ${y(0.81 + wave(5))} ${x(0.19)} ${y(0.76 + wave(5))} ${x(0.16)} ${y(0.38)} Q ${x(0.12)} ${y(0.12)} 0 ${root} Z`;
  const shift = wave(7) * 0.08;
  const inner = `M 0 ${-root * 0.8} Q ${x(0.12)} ${y(-0.2)} ${x(0.27 + shift)} ${y(-0.48 + wave(7) * 0.4)} Q ${x(0.22)} ${y(-0.15)} ${x(0.36)} ${y(-0.19)} Q ${x(0.4)} ${y(-0.61)} ${x(0.55 + shift)} ${y(-0.58 + wave(8) * 0.5)} Q ${x(0.47)} ${y(-0.13)} ${x(0.77)} ${y(-0.07)} Q ${x(0.6)} ${y(0.07)} ${x(0.53)} ${y(0.45 + wave(9) * 0.4)} Q ${x(0.45)} ${y(0.21)} ${x(0.36)} ${y(0.25)} Q ${x(0.21)} ${y(0.38)} 0 ${root * 0.8} Z`;
  // A short, broad flame heart, never a distance-scaled white blade.
  const coreLength = Math.min(length * 0.33, root * 6),
    coreHeight = root * 0.85;
  const core = `M 0 ${-coreHeight} C ${coreLength * 0.3} ${-coreHeight * 0.8} ${coreLength * 0.65} ${-coreHeight * 0.35} ${coreLength} 0 C ${coreLength * 0.65} ${coreHeight * 0.35} ${coreLength * 0.3} ${coreHeight * 0.8} 0 ${coreHeight} Z`;
  const embers = Array.from({ length: small ? 3 : 6 }, (_, i) => {
    const t = (p * 2.7 + i * 0.173) % 1;
    const side = i % 2 ? 1 : -1;
    const ex = length * (0.3 + 0.67 * t),
      ey = side * width * (0.6 + t * 0.85);
    const size = (small ? 3 : 4.5) * (1 - t * 0.5);
    return `<path d="M ${ex - size * 2} ${ey} q ${size * 1.6} ${-size} ${size * 3} 0 q ${-size * 1.2} ${size} ${-size * 3} 0" fill="${i % 2 ? "#f6bb62" : "#e98c45"}" opacity="${(1 - t) * growth * fade}"/>`;
  }).join("");
  const color = `rgb(${Math.round(226 + 12 * fade)},${Math.round(121 + 33 * fade)},${Math.round(47 + 28 * fade)})`;
  return wrap(
    `<g opacity="${Math.min(1, growth * 3) * Math.min(1, fade * 4)}"><path d="${outer}" fill="${color}" stroke="#8c4a20" stroke-width="2.2" stroke-linejoin="round"/><path d="${inner}" fill="#ffda80" opacity="${fade ** 1.6}"/><path d="${core}" fill="#fff8d8" opacity="${fade ** 2.2}"/>${embers}</g>`,
  );
}
