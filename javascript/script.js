/* ==========================================================
   Water Run — script.js (fresh)
   - Start -> Game (armed)
   - First Arrow key starts timer & movement
   - Hold Up/Down to move; Left/Right to change lanes
   - Jugs (yellow) reduce time; Hazards (black) add time
   - SVG sprites with safe fallbacks
   ========================================================== */

/* DOM */
const screenStart = document.getElementById('screen-start');
const screenGame  = document.getElementById('screen-game');
const screenOver  = document.getElementById('screen-over');

const btnStart     = document.getElementById('btnStart');
const btnReset     = document.getElementById('btnReset');
const btnPlayAgain = document.getElementById('btnPlayAgain');

const finalTimeEl  = document.getElementById('finalTime');
const toast        = document.getElementById('toast');

const hudTimeEl = document.getElementById('hudTime');
const hudJugsEl = document.getElementById('hudJugs');

const instructionsEl = document.getElementById('instructions');

const canvas = document.getElementById('stage');
const ctx    = canvas.getContext('2d');

/* Config / State */
const BASE_W = 480, BASE_H = 720;
canvas.width  = BASE_W;
canvas.height = BASE_H;

const TRACK_LEN  = 5200;
const lanesX     = [BASE_W*0.22, BASE_W*0.50, BASE_W*0.78];

let lane     = 1;
let runnerY  = 80;
const HOLD_SPEED = 140;

let camY     = 0;

let elapsed  = 0;
let lastTs   = 0;
let playing  = false;
let gameArmed = false;

const jugs    = [];
const hazards = [];
let jugCount  = 0;

/* Utils */
const worldToScreenY = (y) => BASE_H - (y - camY);

function showScreen(el){
  [screenStart, screenGame, screenOver].forEach(s => s && s.classList.remove('show'));
  el && el.classList.add('show');
}
function flash(text, color){
  if (!toast) return;
  toast.textContent = text;
  toast.style.color = color || '#fff';
  toast.style.opacity = 1;
  setTimeout(() => (toast.style.opacity = 0), 250);
}
function setHudTime(secondsFloat){
  const s = (Math.round(secondsFloat*100)/100).toFixed(2) + 's';
  if (hudTimeEl) hudTimeEl.textContent = s;
}
function setHudJugs(count){
  if (hudJugsEl) hudJugsEl.textContent = String(count);
}

/* Assets */
function loadImage(src){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Image failed: '+src));
    img.src = src;
  });
}
let imgJugYellow = null;
let imgJugBlack  = null;

(async function preloadAssets(){
  try{ imgJugYellow = await loadImage('assets/jerry_jug_yellow.svg'); } catch(e){ console.error('yellow failed'); }
  try{ imgJugBlack  = await loadImage('assets/jerry_jug-black.svg');  } catch(e){ console.error('black failed'); }
})();

/* World */
function genWorld(){
  jugs.length = 0;
  hazards.length = 0;
  jugCount = 0;

  let y = 300;
  while (y < TRACK_LEN - 300){
    if (Math.random() < 0.6){
      jugs.push({ x: lanesX[Math.floor(Math.random()*3)], y });
    }
    if (Math.random() < 0.45){
      hazards.push({ x: lanesX[Math.floor(Math.random()*3)], y, w: 46, h: 26 });
    }
    y += 220 + Math.random()*80;
  }
}

/* Drawing */
function drawBackground(ts){
  const t = ts * 0.00025;
  const g = ctx.createRadialGradient(
    BASE_W*0.5, BASE_H*0.1, 40 + 30*Math.sin(t),
    BASE_W*0.5, BASE_H*0.85, BASE_H*0.95
  );
  g.addColorStop(0, '#0b2140');
  g.addColorStop(1, '#081523');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,BASE_W,BASE_H);

  const finishScreenY = worldToScreenY(TRACK_LEN);
  if (finishScreenY < BASE_H + 60){
    ctx.fillStyle = '#FFD84D';
    ctx.fillRect(0, finishScreenY - 6, BASE_W, 12);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', BASE_W/2, finishScreenY - 12);
  }
}
function drawRunner(){
  const x = lanesX[lane];
  const yS = worldToScreenY(runnerY);
  ctx.fillStyle = '#60a5fa';
  ctx.fillRect(x - 18, yS - 32, 36, 52);
  ctx.beginPath();
  ctx.fillStyle = '#93c5fd';
  ctx.arc(x, yS - 40, 12, 0, Math.PI*2);
  ctx.fill();
}
const SPRITE_W = 40, SPRITE_H = 48;
function drawJug(it){
  const yS = worldToScreenY(it.y);
  if (!imgJugYellow){
    ctx.save();
    ctx.translate(it.x, yS);
    ctx.fillStyle = '#FFD84D';
    ctx.fillRect(-16, -22, 32, 44);
    ctx.fillStyle = '#bda10d';
    ctx.fillRect(-6, -26, 12, 6);
    ctx.restore();
    return;
  }
  ctx.drawImage(imgJugYellow, it.x - SPRITE_W/2, yS - SPRITE_H/2, SPRITE_W, SPRITE_H);
}
function drawHazard(it){
  const yS = worldToScreenY(it.y);
  if (!imgJugBlack){
    ctx.save();
    ctx.translate(it.x, yS);
    ctx.fillStyle = '#253331';
    ctx.fillRect(-it.w/2, -it.h/2, it.w, it.h);
    ctx.restore();
    return;
  }
  ctx.drawImage(imgJugBlack, it.x - SPRITE_W/2, yS - SPRITE_H/2, SPRITE_W, SPRITE_H);
}

/* Game Flow */
function resetGame(){
  playing = false;
  gameArmed = false;
  elapsed = 0;
  lane = 1;
  runnerY = 80;
  camY = 0;
  lastTs = 0;

  setHudTime(0);
  setHudJugs(0);
  genWorld();

  document.querySelectorAll('.confetti').forEach(n => n.remove());
}
function startGame(){
  resetGame();
  showScreen(screenGame);

  // Armed: wait for first arrow
  playing = false;
  gameArmed = true;
  if (instructionsEl) instructionsEl.classList.remove('hidden');

  // Initial frame for visibility
  ctx.clearRect(0,0,BASE_W,BASE_H);
  drawBackground(0);
  for (const j of jugs) drawJug(j);
  for (const h of hazards) drawHazard(h);
  drawRunner();
}
function finish(){
  playing = false;
  if (finalTimeEl) finalTimeEl.textContent = (Math.round(elapsed*100)/100).toFixed(2);
  showScreen(screenOver);
  celebrate();
}

/* Confetti */
function celebrate(){
  const wrap = document.querySelector('.stage-wrap');
  if (!wrap) return;
  for (let i=0;i<90;i++){
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = Math.random()*100 + '%';
    p.style.background = ['#ffd84d','#60a5fa','#22c55e','#f97316','#a78bfa'][Math.floor(Math.random()*5)];
    p.style.animationDuration = (4 + Math.random()*2) + 's';
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 6500);
  }
}

/* Loop */
let upHeld=false, downHeld=false;
function loop(ts){
  const dt = Math.min(48, ts - (lastTs || ts));
  const dtSec = dt/1000;
  lastTs = ts;

  if (upHeld)   runnerY += HOLD_SPEED * dtSec;
  if (downHeld) runnerY  = Math.max(80, runnerY - HOLD_SPEED * dtSec);

  camY = Math.max(camY, runnerY - 0.68 * BASE_H);

  elapsed += dtSec;
  setHudTime(elapsed);

  ctx.clearRect(0,0,BASE_W,BASE_H);
  drawBackground(ts);
  for (const j of jugs)    drawJug(j);
  for (const h of hazards) drawHazard(h);

  const laneX = lanesX[lane];
  const rY = runnerY;

  for (let i=jugs.length-1; i>=0; i--){
    const it = jugs[i];
    if (Math.abs(it.x - laneX) < 28 && Math.abs(it.y - rY) < 42){
      jugs.splice(i,1);
      jugCount++; setHudJugs(jugCount);
      elapsed = Math.max(0, elapsed - 2); setHudTime(elapsed);
      flash('−2.00s', '#22c55e');
    }
  }
  for (let i=hazards.length-1; i>=0; i--){
    const it = hazards[i];
    const top = it.y - it.h/2, bottom = it.y + it.h/2;
    const overlapLane = Math.abs(it.x - laneX) < (it.w * 0.6);
    const overlapY = !((rY - 40) > bottom || (rY + 20) < top);
    if (overlapLane && overlapY){
      hazards.splice(i,1);
      elapsed += 2; setHudTime(elapsed);
      flash('+2.00s', '#ef4444');
    }
  }

  drawRunner();

  if (runnerY >= TRACK_LEN){ finish(); return; }
  if (playing) requestAnimationFrame(loop);
}

/* Input */
window.addEventListener('keydown', (e) => {
  const isArrow = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key);

  if (gameArmed && isArrow){
    gameArmed = false;
    playing = true;
    lastTs = 0;
    if (e.key === 'ArrowUp')   upHeld = true;
    if (e.key === 'ArrowDown') downHeld = true;
    if (instructionsEl) instructionsEl.classList.add('hidden');
    requestAnimationFrame(loop);
  }

  if (!playing) return;

  if (e.key === 'ArrowLeft')  lane = Math.max(0, lane - 1);
  if (e.key === 'ArrowRight') lane = Math.min(2, lane + 1);
  if (e.key === 'ArrowUp')    upHeld = true;
  if (e.key === 'ArrowDown')  downHeld = true;
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowUp')    upHeld = false;
  if (e.key === 'ArrowDown')  downHeld = false;
});

/* Touch (swipe lanes only) */
let touchSX=null, touchSY=null;
canvas.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchSX = t.clientX; touchSY = t.clientY;
}, { passive:true });
canvas.addEventListener('touchend', (e) => {
  if (!playing || touchSX==null || touchSY==null) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchSX;
  if (dx < -20) lane = Math.max(0, lane - 1);
  if (dx >  20) lane = Math.min(2, lane + 1);
  touchSX = touchSY = null;
});

/* Buttons */
btnStart     && btnStart.addEventListener('click', startGame);
btnPlayAgain && btnPlayAgain.addEventListener('click', startGame);
btnReset     && btnReset.addEventListener('click', () => {
  resetGame();
  showScreen(screenStart);
});

btnResetInGame && btnResetInGame.addEventListener('click', () => {
  // stop play immediately
  playing = false;
  // return to Start screen (clean slate)
  resetGame();
  showScreen(screenStart);
});


/* Init */
(function init(){
  showScreen(screenStart);
  setHudTime(0); setHudJugs(0);
  genWorld();
})();
