// Forced landscape (pure maths, unit-tested). When the browser is portrait the game root is rotated
// 90 degrees clockwise, so the phone is held turned to the left (always the same way, as agreed in D-81).
export function layout(vw, vh) {
  const rot = vh > vw;
  return { rot, w: rot ? vh : vw, h: rot ? vw : vh };
}
// screen (client) point -> game point inside the root element
export function toGame(cx, cy, vw, vh) {
  return vh > vw ? { x: cy, y: vw - cx } : { x: cx, y: cy };
}
// CSS safe-area insets (top, right, bottom, left of the screen) -> insets of the rotated game root
export function safeArea(t, r, b, l, rot) {
  return rot ? { top: r, right: b, bottom: l, left: t } : { top: t, right: r, bottom: b, left: l };
}
