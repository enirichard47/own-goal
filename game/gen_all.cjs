// Generates: ball.png, player4.png, player_Opponent.png, player3.png, player_User.png
// node game/gen_all.cjs

const { createCanvas } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'resources');

// ─── Canvas drawing context (module-level, reassigned per canvas) ─────────────
let ctx;

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

function circle(cx, cy, r, fill, stroke, lw) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
}

// Capsule between two points
function pill(x1, y1, x2, y2, r, fill, stroke) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
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

function boot(ax, ay, shinAngle, fill) {
  const L = 15, H = 6;
  const tilt = Math.max(-0.5, Math.min(0.7, shinAngle * 0.28));
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(tilt);
  ctx.beginPath();
  roundedRect(-3, -H / 2, L, H, 3);
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = '#0D0D0D'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function jt(x, y, a, len) {
  return { x: x + Math.sin(a) * len, y: y + Math.cos(a) * len };
}

// ─── Draw character frame on current `ctx` ────────────────────────────────────
function drawChar(fx, fy, fw, fh, pose, C) {
  const {
    bodyLean = 0.07, bodyBob = 0,
    lThigh = 0, lShin = 0,
    rThigh = 0, rShin = 0,
    lArm = 0.42, rArm = -0.42,
  } = pose;

  const ground = fy + fh - 6;
  const CX   = fx + fw / 2;
  const hipY = ground - 36 + bodyBob;
  const hipX = CX;

  const TORSO = 24, THIGH = 19, SHIN = 17, ARM = 13;

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

  const OL = '#0D0D0D';

  // Back arm
  pill(shlX - 5, shlY + 5, lElbow.x, lElbow.y, 3,   C.jersey, OL);
  pill(lElbow.x, lElbow.y, lHand.x,  lHand.y,  2.5, C.skin,   OL);
  // Glove on keeper back arm
  if (C.glove) circle(lHand.x, lHand.y, 4, C.glove, OL, 1);

  // Back leg
  pill(hipX, hipY, lKnee.x,  lKnee.y,  4.5, C.shorts, OL);
  pill(lKnee.x, lKnee.y, lAnkle.x, lAnkle.y, 4, C.socks,  OL);
  boot(lAnkle.x, lAnkle.y, lShin, C.boots);

  // Torso
  const midX = (hipX + shlX) / 2;
  const midY = (hipY + shlY) / 2;
  rotRect(midX, midY, 20, TORSO, bodyLean, C.jersey, OL);

  // Jersey stripe or pattern
  ctx.save();
  ctx.translate(midX, midY);
  ctx.rotate(bodyLean);
  if (C.stripes) {
    // Referee stripes (vertical)
    for (let s = -7; s < 10; s += 6) {
      ctx.beginPath();
      roundedRect(s, -TORSO / 2 + 1, 3, TORSO - 2, 1);
      ctx.fillStyle = C.stripes;
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    roundedRect(4, -TORSO / 2 + 2, 6, TORSO - 4, 2);
    ctx.fillStyle = C.jerseyH;
    ctx.fill();
  }
  ctx.restore();

  // Shorts waistband
  const wbX = hipX + Math.sin(bodyLean) * 3;
  const wbY = hipY - Math.cos(bodyLean) * 3;
  rotRect(wbX, wbY, 22, 9, bodyLean, C.shorts, OL, 1);

  // Front leg
  pill(hipX, hipY, rKnee.x,  rKnee.y,  4.5, C.shorts, OL);
  pill(rKnee.x, rKnee.y, rAnkle.x, rAnkle.y, 4, C.socks,  OL);
  boot(rAnkle.x, rAnkle.y, rShin, C.boots);

  // Front arm
  pill(shlX + 5, shlY + 5, rElbow.x, rElbow.y, 3,   C.skin, OL);
  pill(rElbow.x, rElbow.y, rHand.x,  rHand.y,  2.5, C.skin, OL);
  if (C.glove) circle(rHand.x, rHand.y, 4, C.glove, OL, 1);

  // Neck
  pill(shlX, shlY, headCX, headCY + 7, 3.5, C.skin, 'none');

  // Head
  circle(headCX, headCY, HR, C.skin, OL, 1.5);

  // Hair cap (counterclockwise from upper-face to lower-back)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(headCX, headCY);
  ctx.arc(headCX, headCY, HR, -Math.PI * 0.22, Math.PI * 0.72, true);
  ctx.closePath();
  ctx.fillStyle = C.hair;
  ctx.fill();
  ctx.restore();

  // Ear
  ctx.beginPath();
  ctx.ellipse(headCX - HR + 2, headCY + 1, 3, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.skinDk; ctx.fill();
  ctx.strokeStyle = OL; ctx.lineWidth = 0.8; ctx.stroke();

  // Eye
  circle(headCX + 6, headCY - 1, 3,   '#fff',    OL, 1);
  circle(headCX + 7, headCY - 1, 1.5, '#1A1A2E', 'none');
  circle(headCX + 7.5, headCY - 2, 0.6, '#fff',  'none');

  // Eyebrow
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(headCX + 3,   headCY - 5.5);
  ctx.lineTo(headCX + 9.5, headCY - 6.5);
  ctx.strokeStyle = C.hair; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();

  // Keeper gloves on wrists
  if (C.glove) {
    circle(lHand.x, lHand.y, 4.5, C.glove, OL, 1);
    circle(rHand.x, rHand.y, 4.5, C.glove, OL, 1);
  }
}

// ─── Colour palettes ──────────────────────────────────────────────────────────
const BLUE_PLAYER = {
  skin: '#F4B98B', skinDk: '#C8834A', hair: '#1E0D00',
  jersey: '#1245CC', jerseyH: '#4470F0',
  shorts: '#E2E2E2', socks: '#1245CC', boots: '#18100A',
};
const REFEREE = {
  skin: '#EEB480', skinDk: '#C07840', hair: '#1A1A1A',
  jersey: '#222222', jerseyH: '#555555', stripes: '#ffffff',
  shorts: '#111111', socks: '#111111', boots: '#111111',
};
const YELLOW_GK = {
  skin: '#F4B98B', skinDk: '#C8834A', hair: '#1E0D00',
  jersey: '#DDAA00', jerseyH: '#FFDD44',
  shorts: '#005522', socks: '#DDAA00', boots: '#111111',
  glove: '#FF6600',
};
const RED_GK = {
  skin: '#F4B98B', skinDk: '#C8834A', hair: '#2E1200',
  jersey: '#CC2200', jerseyH: '#FF4422',
  shorts: '#111111', socks: '#CC2200', boots: '#111111',
  glove: '#FFCC00',
};

// ─── Goalkeeper stance (arms wide, legs apart) ────────────────────────────────
const GK_POSE = {
  bodyLean: 0.03, bodyBob: 9,
  lThigh: -0.22, lShin: -0.08,
  rThigh:  0.22, rShin:  0.08,
  lArm: -1.32,   // back arm spreads LEFT
  rArm:  1.32,   // front arm spreads RIGHT
};

// Idle standing pose (for player_User.png avatar)
const IDLE_POSE = {
  bodyLean: 0.07, bodyBob: 0,
  lThigh: 0.08, lShin: 0.02, rThigh: -0.08, rShin: -0.02,
  lArm: 0.18, rArm: -0.18,
};

// ─── Generator: ball.png ──────────────────────────────────────────────────────
function generateBall() {
  const SIZE = 128;
  const can = createCanvas(SIZE, SIZE);
  ctx = can.getContext('2d');
  ctx.clearRect(0, 0, SIZE, SIZE);

  const cx = SIZE / 2, cy = SIZE / 2, R = SIZE / 2 - 4;

  // Clip all drawing to ball circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();

  // White base
  ctx.fillStyle = '#F8F8F8';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Pentagon helper
  function pent(px, py, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rot - Math.PI / 2;
      const x = px + Math.cos(a) * r;
      const y = py + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#1A1A1A';
    ctx.fill();
  }

  // Center pentagon
  pent(cx, cy, R * 0.28, 0);

  // 5 outer pentagons at positions connected to center
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    pent(
      cx + Math.cos(a) * R * 0.56,
      cy + Math.sin(a) * R * 0.56,
      R * 0.26,
      a + Math.PI
    );
  }

  // White seam lines between patches
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.28, cy + Math.sin(a) * R * 0.28);
    ctx.lineTo(cx + Math.cos(a) * R * 0.44, cy + Math.sin(a) * R * 0.44);
    ctx.stroke();
  }

  // Sphere shading gradient
  const grd = ctx.createRadialGradient(cx - R * 0.28, cy - R * 0.28, R * 0.05, cx, cy, R);
  grd.addColorStop(0,   'rgba(255,255,255,0.35)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0)');
  grd.addColorStop(1,   'rgba(0,0,0,0.28)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.restore(); // remove clip

  // Outline
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Shine
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx - R * 0.30, cy - R * 0.32, R * 0.14, R * 0.09, -Math.PI / 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  ctx.restore();

  fs.writeFileSync(path.join(OUT, 'ball.png'), can.toBuffer('image/png'));
  console.log('Generated ball.png');
}

// ─── Generator: single character sprite ───────────────────────────────────────
function generateChar(filename, palette, pose, w, h) {
  const can = createCanvas(w, h);
  ctx = can.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  drawChar(0, 0, w, h, pose, palette);
  fs.writeFileSync(path.join(OUT, filename), can.toBuffer('image/png'));
  console.log(`Generated ${filename}`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
generateBall();

// player4.png – "Degen Referee" (alternative player, w=80 h=120)
generateChar('player4.png', REFEREE, {
  bodyLean: 0.1, bodyBob: 2,
  lThigh: -0.35, lShin: -0.1, rThigh: 0.30, rShin: 0.06,
  lArm: 0.45, rArm: -1.2,   // right arm raised high (blowing whistle)
}, 80, 120);

// player_Opponent.png – "Butterfly Goalie" main opponent (w=80 h=120)
generateChar('player_Opponent.png', YELLOW_GK, GK_POSE, 80, 120);

// player3.png – "Crying Goalie" alternate opponent (w=80 h=120)
generateChar('player3.png', RED_GK, {
  ...GK_POSE,
  bodyLean: 0.05, bodyBob: 12,  // slightly more crouched
  lArm: -1.5, rArm: 1.1,        // asymmetric arms
}, 80, 120);

// player_User.png – "Own Goal Striker" thumbnail avatar (w=120 h=160)
generateChar('player_User.png', BLUE_PLAYER, IDLE_POSE, 120, 160);

console.log('All done.');
