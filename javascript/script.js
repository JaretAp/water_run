/* ==========================================================
   Water Run — script.js (complete)
   - Race upward to a finish line
   - Time is the score (lower is better)
   - Jugs reduce time; hazards add time
   - Start / Game / Finish screens
   - Robust SVG preloading with safe fallbacks
   - Optional in-canvas UI (kept off by default)
   ========================================================== */

/* ---------- DOM ---------- */
const screenStart = document.getElementById('screen-start');
const screenGame  = document.getElementById('screen-game');
const screenOver  = document.getElementById('screen-over');

const btnStart     = document.getElementById('btnStart');
const btnReset     = document.getElementById('btnReset');
const btnPlayAgain = document.getElementById('btnPlayAgain');

const finalTimeEl = document.getElementById('finalTime');
const toast       = document.getElementById('toast');

// Optional overlay HUD inside .stage-wrap (if present in index.html)
const hudTimeEl = document.getElementById('hudTime');
const hudJugsEl = document.getElementById('hudJugs');

// Optional legacy DOM labels (kept harmless if not present)
const timeEl = document.getElementById('time');
const jugsEl = document.getElementById('jugs');

// Canvas
const canvas = document.getElementById('stage');
const ctx     = canvas.getContext('2d');

/* ---------- Config / State ---------- */
const BASE_W = 480, BASE_H = 720;
canvas.width  = BASE_W;
canvas.height = BASE_H;

// World distance to finish line (tune as desired)
const TRACK_LEN = 5200;

// Runner lanes (3 lanes)
const lanesX = [BASE_W * 0.22, BASE_W * 0.50, BASE_W * 0.78];

// Runner position in world coords (y increases upward)
let lane     = 1;
let runnerY  = 80;
const RUN_SPEED = 140; // units per second

// Camera (world → screen)
let camY   = 0;

// Time score (seconds, float; lower is better)
let elapsed    = 0;
let lastTs     = 0;
let playing    = false;

// Entities
const jugs    = []; // collectibles
const hazards = []; // obstacles (rect colliders)
let jugCount  = 0;

// Spawned world (we pre-place items along track)
let worldReady = false;

/* ---------- Utils ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const worldToScreenY = (y) => BASE_H - (y - camY);

function showScreen(el) {
  [screenStart, screenGame, screenOver].forEach(s => s && s.classList.remove('show'));
  el && el.classList.add('show');
}

function flash(text, color) {
  if (!toast) return;
  toast.textContent = text;
  toast.style.color = color || '#fff';
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 250);
}

function setHudTime(secondsFloat) {
  const s = (Math.round(secondsFloat * 100) / 100).toFixed(2) + 's';
  if (hudTimeEl) hudTimeEl.textContent = s;
  if (timeEl)    timeEl.textContent    = s; // harmless if present
}
function setHudJugs(count) {
  if (hudJugsEl) hudJugsEl.textContent = String(count);
  if (jugsEl)    jugsEl.textContent    = String(count); // harmless if present
}

/* ---------- Assets (robust preload with fallback) ---------- */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed: ' + src));
    img.src     = src; // relative to index.html
  });
}

let imgJugYellow = null;
let imgJugBlack  = null;
let assetsReady  = false;

(async function preloadAssets() {
  try {
    const [yellow, black] = await Promise.all([
      loadImage('assets/jerry_jug_yellow.svg'),
      loadImage('assets/jerry_jug_black.svg'),
    ]);
    imgJugYellow = yellow;
    imgJugBlack  = black;
    assetsReady  = true;
    // console.log('[assets] SVGs loaded');
  } catch (err) {
    console.error('[assets] load error:', err.message);
    assetsReady = false; // keep fallbacks active
  }
})();

/* ---------- World generation ---------- */
function genWorld() {
  jugs.length = 0;
  hazards.length = 0;
  jugCount = 0;

  // Place items every ~220–300 units up the track
  let y = 300;
  while (y < TRACK_LEN - 300) {
    // 60% chance for a jug, 45% for a hazard (can be both)
    if (Math.random() < 0.6) {
      jugs.push({
        x: lanesX[Math.floor(Math.random() * 3)],
        y
      });
    }
    if (Math.random() < 0.45) {
      hazards.push({
        x: lanesX[Math.floor(Math.random() * 3)],
        y,
        w: 46,
        h: 26
      });
    }
    y += 220 + Math.random() * 80;
  }

  worldReady = true;
}

/* ---------- Drawing ---------- */
function drawBackground(ts) {
  // Subtle moving radial gradient
  const t = ts * 0.00025;
  const g = ctx.createRadialGradient(
    BASE_W * 0.5, BASE_H * 0.1, 40 + 30 * Math.sin(t),
    BASE_W * 0.5, BASE_H * 0.85, BASE_H * 0.95
  );
  g.addColorStop(0, '#0b2140'); // deep blue (stage top)
  g.addColorStop(1, '#081523'); // deep blue (stage bottom)
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, BASE_W, BASE_H);

  // Finish line banner
  const finishScreenY = worldToScreenY(TRACK_LEN);
  if (finishScreenY < BASE_H + 60) {
    ctx.fillStyle = '#FFD84D';
    ctx.fillRect(0, finishScreenY - 6, BASE_W, 12);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', BASE_W / 2, finishScreenY - 12);
  }
}

function drawRunner() {
  // Simple figure (body + head) at current lane and world Y
  const x  = lanesX[lane];
  const yS = worldToScreenY(runnerY);

  // Body
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 18, yS - 32, 36, 52);
  // Head
  ctx.beginPath();
  ctx.fillStyle = '#93c5fd';
  ctx.arc(x, yS - 40, 12, 0, Math.PI * 2);
  ctx.fill();
}

const SPRITE_W = 40, SPRITE_H = 48;

function drawJug(it) {
  const yS = worldToScreenY(it.y);

  if (!assetsReady || !imgJugYellow) {
    // Fallback rectangle jug
    ctx.save();
    ctx.translate(it.x, yS);
    ctx.fillStyle = '#FFD84D';
    ctx.fillRect(-16, -22, 32, 44);
    ctx.fillStyle = '#bda10d';
    ctx.fillRect(-6, -26, 12, 6);
    ctx.restore();
    return;
  }

  ctx.drawImage(imgJugYellow, it.x - SPRITE_W / 2, yS - SPRITE_H / 2, SPRITE_W, SPRITE_H);
}

function drawHazard(it) {
  const yS = worldToScreenY(it.y);

  if (!assetsReady || !imgJugBlack) {
    // Fallback rectangular obstacle
    ctx.save();
    ctx.translate(it.x, yS);
    ctx.fillStyle = '#253331';
    ctx.fillRect(-it.w / 2, -it.h / 2, it.w, it.h);
    ctx.restore();
    return;
  }

  ctx.drawImage(imgJugBlack, it.x - SPRITE_W / 2, yS - SPRITE_H / 2, SPRITE_W, SPRITE_H);
}

// OPTIONAL: Draw UI in-canvas instead of DOM overlay (kept off by default)
const DRAW_CANVAS_UI = false;
function drawCanvasUI() {
  if (!DRAW_CANVAS_UI) return;

  ctx.save();
  ctx.font = '700 16px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textBaseline = 'middle';

  const pillBg = 'rgba(12,14,15,0.55)';
  const white  = '#FFFFFF';
  const yellow = '#FFD84D';

  function pill(x, y, label, value, valueColor) {
    const padX = 10, padY = 6, gap = 6, h = 28, r = 12;
    const w = padX * 2 + ctx.measureText(label).width + gap + ctx.measureText(value).width;

    ctx.fillStyle = pillBg;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = white;
    ctx.fillText(label, x + padX, y + h / 2);
    ctx.fillStyle = valueColor;
    ctx.fillText(value, x + padX + ctx.measureText(label).width + gap, y + h / 2);
  }

  const tStr = (Math.round(elapsed * 100) / 100).toFixed(2) + 's';
  const jStr = String(jugCount);

  pill(10, 10, 'Time:', tStr, yellow);

  const sample = 'Jugs: ' + jStr;
  const sampleW = 20 + ctx.measureText(sample).width; // rough
  pill(canvas.width - 10 - sampleW, 10, 'Jugs:', jStr, yellow);

  ctx.restore();
}

/* ---------- Game Flow ---------- */
function resetGame() {
  playing  = false;
  elapsed  = 0;
  lane     = 1;
  runnerY  = 80;
  camY     = 0;
  lastTs   = 0;

  setHudTime(0);
  setHudJugs(0);

  genWorld();

  // remove any confetti still in DOM
  document.querySelectorAll('.confetti').forEach(n => n.remove());
}

function startGame() {
  resetGame();
  showScreen(screenGame);
  playing = true;
  requestAnimationFrame(loop);
}

function finish() {
  playing = false;

  if (finalTimeEl) {
    finalTimeEl.textContent = (Math.round(elapsed * 100) / 100).toFixed(2);
  }

  showScreen(screenOver);
  celebrate();
}

/* ---------- Confetti ---------- */
function celebrate() {
  const wrap = document.querySelector('.stage-wrap');
  if (!wrap) return;

  for (let i = 0; i < 90; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = Math.random() * 100 + '%';
    p.style.background = ['#ffd84d', '#60a5fa', '#22c55e', '#f97316', '#a78bfa'][Math.floor(Math.random() * 5)];
    p.style.animationDuration = (4 + Math.random() * 2) + 's';
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 6500);
  }
}

/* ---------- Main Loop ---------- */
function loop(ts) {
  const dt   = Math.min(48, ts - (lastTs || ts));
  const dtSec = dt / 1000;
  lastTs = ts;

  // Advance runner upward (auto-run)
  runnerY += RUN_SPEED * dtSec;

  // Camera follows runner (once high enough)
  camY = Math.max(camY, runnerY - 0.68 * BASE_H);

  // Timer increases continuously (time is the score)
  elapsed += dtSec;
  setHudTime(elapsed);

  // Clear + background
  ctx.clearRect(0, 0, BASE_W, BASE_H);
  drawBackground(ts);

  // Draw entities
  for (const j of jugs)    drawJug(j);
  for (const h of hazards) drawHazard(h);

  // Collisions
  const laneX = lanesX[lane];
  const rY    = runnerY;

  // Jugs: collect (–2s)
  for (let i = jugs.length - 1; i >= 0; i--) {
    const it = jugs[i];
    if (Math.abs(it.x - laneX) < 28 && Math.abs(it.y - rY) < 42) {
      jugs.splice(i, 1);
      jugCount++;
      setHudJugs(jugCount);
      elapsed = Math.max(0, elapsed - 2);
      setHudTime(elapsed);
      flash('−2.00s', '#22c55e');
    }
  }

  // Hazards: hit (+2s)
  for (let i = hazards.length - 1; i >= 0; i--) {
    const it = hazards[i];
    const top    = it.y - it.h / 2;
    const bottom = it.y + it.h / 2;

    const overlapLane = Math.abs(it.x - laneX) < (it.w * 0.6);
    const overlapY    = !( (rY - 40) > bottom || (rY + 20) < top );

    if (overlapLane && overlapY) {
      hazards.splice(i, 1);
      elapsed += 2;
      setHudTime(elapsed);
      flash('+2.00s', '#ef4444');
    }
  }

  // Draw runner last
  drawRunner();

  // Optional canvas UI (off by default)
  drawCanvasUI();

  // Finish check
  if (runnerY >= TRACK_LEN) {
    finish();
    return;
  }

  if (playing) requestAnimationFrame(loop);
}

/* ---------- Input (Keyboard + Touch) ---------- */
window.addEventListener('keydown', (e) => {
  if (!playing) return;
  if (e.key === 'ArrowLeft')  lane = Math.max(0, lane - 1);
  if (e.key === 'ArrowRight') lane = Math.min(2, lane + 1);
  if (e.key === 'ArrowUp')    runnerY += 60; // manual burst upward
  if (e.key === 'ArrowDown')  runnerY = Math.max(80, runnerY - 60);
});

let touchSX = null, touchSY = null;
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchSX = t.clientX;
  touchSY = t.clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  if (!playing || touchSX == null || touchSY == null) return;
  const t  = e.changedTouches[0];
  const dx = t.clientX - touchSX;
  const dy = t.clientY - touchSY;

  if (dx < -20) lane = Math.max(0, lane - 1);
  if (dx >  20) lane = Math.min(2, lane + 1);
  if (dy < -20) runnerY += 60;
  if (dy >  20) runnerY = Math.max(80, runnerY - 60);

  touchSX = touchSY = null;
});

/* ---------- Buttons ---------- */
btnStart && btnStart.addEventListener('click', startGame);
btnPlayAgain && btnPlayAgain.addEventListener('click', startGame);
btnReset && btnReset.addEventListener('click', () => {
  resetGame();
  showScreen(screenStart);
});

/* ---------- Init ---------- */
(function init() {
  showScreen(screenStart);
  setHudTime(0);
  setHudJugs(0);
  genWorld(); // prepare world so Start is immediate
})();
