// Generates game/resources/player_sheet.png
// node game/gen_sprite.cjs

const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const FW = 80;
const FH = 96;
const canvas = createCanvas(FW * 6, FH * 2);
const ctx = canvas.getContext('2d');

ctx.clearRect(0, 0, canvas.width, canvas.height);

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  skin:    '#F4B98B',
  skinDk:  '#C8834A',
  hair:    '#1E0D00',
  jersey:  '#1245CC',
  jerseyH: '#4470F0',
  shorts:  '#E2E2E2',
  socks:   '#1245CC',
  boots:   '#18100A',
  bootsH:  '#3E2810',
  outline: '#0D0D0D',
};

// ─── Primitives ──────────────────────────────────────────────────────────────
function circle(cx, cy, r, fill, stroke, lw) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
}

// Capsule from (x1,y1) to (x2,y2) with radius r.
function pill(x1, y1, x2, y2, r, fill, stroke) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  // Right-hand perpendicular: rotate direction 90° CW → (sin θ, −cos θ)
  const px = Math.sin(angle) * r;
  const py = -Math.cos(angle) * r;

  ctx.beginPath();
  ctx.moveTo(x1 + px, y1 + py);
  ctx.lineTo(x2 + px, y2 + py);
  ctx.arc(x2, y2, r, angle - Math.PI / 2, angle + Math.PI / 2, false);
  ctx.lineTo(x1 - px, y1 - py);
  ctx.arc(x1, y1, r, angle + Math.PI / 2, angle - Math.PI / 2, false);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function roundedRect(x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, -Math.PI / 2);
  ctx.closePath();
}

// Rotated filled rectangle around its centre
function rotRect(cx, cy, w, h, angle, fill, stroke, lw) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  roundedRect(-w / 2, -h / 2, w, h, 3);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
  ctx.restore();
}

// Boot at ankle (ax, ay). shinAngle controls a slight upward/downward tilt.
function boot(ax, ay, shinAngle, fill) {
  const L = 15, H = 6;
  const tilt = Math.max(-0.5, Math.min(0.7, shinAngle * 0.28));
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(tilt);
  ctx.beginPath();
  roundedRect(-3, -H / 2, L, H, 3);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = C.outline; ctx.lineWidth = 1.5; ctx.stroke();
  // highlight
  ctx.fillStyle = C.bootsH;
  ctx.beginPath();
  roundedRect(-1, -H / 2 + 1.5, 5, 2, 1);
  ctx.fill();
  ctx.restore();
}

// Joint: go `len` pixels from (x,y) in angle-from-vertical direction
function jt(x, y, a, len) {
  return { x: x + Math.sin(a) * len, y: y + Math.cos(a) * len };
}

// ─── Draw one character frame ────────────────────────────────────────────────
function drawChar(fx, fy, pose) {
  const {
    bodyLean = 0.07, bodyBob = 0,
    lThigh = 0, lShin = 0,
    rThigh = 0, rShin = 0,
    lArm = 0.42, rArm = -0.42,
  } = pose;

  const ground = fy + FH - 6;
  const CX     = fx + FW / 2;
  const hipX   = CX;
  const hipY   = ground - 36 + bodyBob;

  const TORSO = 24;
  const THIGH = 19;
  const SHIN  = 17;
  const ARM   = 13;

  const shlX = hipX + Math.sin(bodyLean) * TORSO;
  const shlY = hipY - Math.cos(bodyLean) * TORSO;
  const headCX = shlX;
  const headCY = shlY - 13;
  const HR = 12;

  const lKnee  = jt(hipX, hipY, lThigh, THIGH);
  const lAnkle = jt(lKnee.x, lKnee.y, lShin, SHIN);
  const rKnee  = jt(hipX, hipY, rThigh, THIGH);
  const rAnkle = jt(rKnee.x, rKnee.y, rShin, SHIN);

  const lElbow = jt(shlX - 5, shlY + 5, lArm, ARM);
  const rElbow = jt(shlX + 5, shlY + 5, rArm, ARM);
  const lHand  = jt(lElbow.x, lElbow.y, lArm, 10);
  const rHand  = jt(rElbow.x, rElbow.y, rArm, 10);

  // ── BACK ARM ──
  pill(shlX - 5, shlY + 5, lElbow.x, lElbow.y, 3,   C.jersey, C.outline);
  pill(lElbow.x, lElbow.y, lHand.x,  lHand.y,  2.5, C.skin,   C.outline);

  // ── BACK LEG (left) ──
  pill(hipX, hipY, lKnee.x,  lKnee.y,  4.5, C.shorts, C.outline);
  pill(lKnee.x, lKnee.y, lAnkle.x, lAnkle.y, 4, C.socks, C.outline);
  boot(lAnkle.x, lAnkle.y, lShin, C.boots);

  // ── TORSO ──
  const midX = (hipX + shlX) / 2;
  const midY = (hipY + shlY) / 2;
  rotRect(midX, midY, 20, TORSO, bodyLean, C.jersey, C.outline);

  // Jersey highlight stripe
  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(bodyLean);
  ctx.beginPath();
  roundedRect(4, -TORSO / 2 + 2, 6, TORSO - 4, 2);
  ctx.fillStyle = C.jerseyH;
  ctx.fill();
  ctx.restore();

  // Shorts waistband
  const wbX = hipX + Math.sin(bodyLean) * 3;
  const wbY = hipY - Math.cos(bodyLean) * 3;
  rotRect(wbX, wbY, 22, 9, bodyLean, C.shorts, C.outline, 1);

  // ── FRONT LEG (right) ──
  pill(hipX, hipY, rKnee.x,  rKnee.y,  4.5, C.shorts, C.outline);
  pill(rKnee.x, rKnee.y, rAnkle.x, rAnkle.y, 4, C.socks, C.outline);
  boot(rAnkle.x, rAnkle.y, rShin, C.boots);

  // ── FRONT ARM ──
  pill(shlX + 5, shlY + 5, rElbow.x, rElbow.y, 3,   C.skin, C.outline);
  pill(rElbow.x, rElbow.y, rHand.x,  rHand.y,  2.5, C.skin, C.outline);

  // ── NECK ──
  pill(shlX, shlY, headCX, headCY + 7, 3.5, C.skin, 'none');

  // ── HEAD: skin base ──
  circle(headCX, headCY, HR, C.skin, C.outline, 1.5);

  // Hair cap: covers top + back of head, leaving face (right side) showing.
  // Canvas angles: 0=right (face), −PI/2=up (top), PI=left (back).
  // Arc goes counterclockwise (anticlockwise=true) from −40° (upper-face edge)
  // through −90° (top) through 180° (back) to +130° (lower-back).
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(headCX, headCY);
  ctx.arc(headCX, headCY, HR, -Math.PI * 0.22, Math.PI * 0.72, true);
  ctx.closePath();
  ctx.fillStyle = C.hair;
  ctx.fill();
  ctx.restore();

  // Ear (visible side = left/back of head in side view)
  ctx.beginPath();
  ctx.ellipse(headCX - HR + 2, headCY + 1, 3, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.skinDk;
  ctx.fill();
  ctx.strokeStyle = C.outline; ctx.lineWidth = 0.8; ctx.stroke();

  // Eye (right side = face)
  circle(headCX + 6, headCY - 1, 3,   '#fff',     C.outline, 1);
  circle(headCX + 7, headCY - 1, 1.5, '#1A1A2E',  'none');
  circle(headCX + 7.5, headCY - 2, 0.6, '#fff',   'none');

  // Eyebrow
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(headCX + 3,   headCY - 5.5);
  ctx.lineTo(headCX + 9.5, headCY - 6.5);
  ctx.strokeStyle = C.hair;
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// ─── Animation poses ─────────────────────────────────────────────────────────
const walkPoses = [
  { lThigh: -0.48, lShin: -0.10, rThigh:  0.42, rShin:  0.08, lArm:  0.52, rArm: -0.52 },
  { lThigh: -0.10, lShin:  0.30, rThigh:  0.10, rShin:  0.04, lArm:  0.16, rArm: -0.16, bodyBob: 4 },
  { lThigh:  0.42, lShin:  0.08, rThigh: -0.48, rShin: -0.10, lArm: -0.52, rArm:  0.52 },
  { lThigh:  0.10, lShin:  0.04, rThigh: -0.10, rShin:  0.30, lArm: -0.16, rArm:  0.16, bodyBob: 4 },
  { lThigh: -0.48, lShin: -0.10, rThigh:  0.42, rShin:  0.08, lArm:  0.52, rArm: -0.52 },
  { lThigh: -0.10, lShin:  0.30, rThigh:  0.10, rShin:  0.04, lArm:  0.16, rArm: -0.16, bodyBob: 4 },
];

const kickPoses = [
  { lThigh:  0.10, lShin:  0.00, rThigh: -0.22, rShin: -0.10, lArm: -0.30, rArm:  0.60 },
  { lThigh:  0.18, lShin:  0.08, rThigh: -0.92, rShin: -1.20, lArm:  0.72, rArm: -0.62, bodyLean: 0.18 },
  { lThigh:  0.12, lShin:  0.00, rThigh:  0.88, rShin:  0.62, lArm: -0.58, rArm:  0.42, bodyLean: 0.24 },
  { lThigh:  0.18, lShin:  0.08, rThigh:  1.08, rShin:  0.38, lArm: -0.32, rArm:  0.30, bodyLean: 0.14 },
];

// ─── Render ───────────────────────────────────────────────────────────────────
for (let i = 0; i < 6; i++) drawChar(i * FW, 0,  walkPoses[i]);
for (let i = 0; i < 4; i++) drawChar(i * FW, FH, kickPoses[i]);

// ─── Save ─────────────────────────────────────────────────────────────────────
const out = path.join(__dirname, 'resources', 'player_sheet.png');
fs.writeFileSync(out, canvas.toBuffer('image/png'));
console.log(`Saved ${out}  (${canvas.width}x${canvas.height})`);
