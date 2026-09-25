export type FragmentPose = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
};
/** Reassemble at the piece's own position, then hand visibility back to the original. */
export function recoveryFrame(
  from: FragmentPose,
  target: { left: number; top: number },
  offset: { left: number; top: number },
  progress: number,
) {
  const p = Math.max(0, Math.min(1, progress));
  const travel = Math.min(1, p / 0.88);
  const t = travel * travel * (3 - 2 * travel);
  return {
    x: from.x + (target.left + offset.left - from.x) * t,
    y: from.y + (target.top + offset.top - from.y) * t,
    rotation: from.rotation * (1 - t),
    scale: from.scale + (1 - from.scale) * t,
    opacity: 1 - Math.max(0, (p - 0.88) / 0.12),
    arrived: p >= 0.9,
  };
}
