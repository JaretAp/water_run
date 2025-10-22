// ===== DOM =====
const screenStart = document.getElementById('screen-start');
const screenGame  = document.getElementById('screen-game');
const screenOver  = document.getElementById('screen-over');

const btnStart = document.getElementById('btnStart');
const btnReset = document.getElementById('btnReset');
const btnPlayAgain = document.getElementById('btnPlayAgain');

const timeEl  = document.getElementById('time');
const jugsEl  = document.getElementById('jugs');
const finalTimeEl = document.getElementById('finalTime');
const toast = document.getElementById('toast');

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

// ===== Config / State =====
const BASE_W = 480, BASE_H = 720;
canvas.width = BASE_W; canvas.height = BASE_H;

// Track & camera
const TRACK_LEN = 5200;     // distance to finish line in world units
let camY = 0;               // camera offset (world→screen)
let elapsed = 0;            // time score (seconds, float)
let playing = false;
let lastTs = 0;

// Runner
const lanesX = [BASE_W*0.22, BASE_W*0.5, BASE_W*0.78];
let lane = 1;
let runnerY = 80;           // world Y position increases upward
const RUN_SPEED = 140;      // upward speed (units/sec)
const STRAFE = 1;           // horizontal (lane) is discrete, but we can lerp if desired

// World items
const jugs = [];    // {x, y}
const hazards = []; // {x, y, w, h}
let jugCount = 0;

// Utility
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function showScreen(el){
  [screenStart, screenGame, screenOver].forEach(s => s.classList.remove('show'));
  el.classList.add('show');
}
function formatTime(t){
  return (Math.round(t*100)/100).toFixed(2);
}
function flash(text, color){
  toast.textContent = text;
  toast.style.color = color;
  toast.style.opacity = 1;
  setTimeout(()=> toast.style.opacity = 0, 250);
}
function confetti(){
  const wrap = document.querySelector('.stage-wrap');
  for(let i=0;i<90;i++){
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.left = Math.random()*100 + '%';
    p.style.background = ['#ffd84d','#60a5fa','#22c55e','#f97316','#a78bfa'][Math.floor(Math.random()*5)];
    p.style.animationDuration = (4 + Math.random()*2) + 's';
    wrap.appendChild(p);
    setTimeout(()=> p.remove(), 6500);
  }
}
function clearConfetti(){ document.querySelectorAll('.confetti').forEach(n => n.remove()); }

// ===== World generation (pre-place items up to finish) =====
function genWorld(){
  jugs.length = 0; hazards.length = 0;
  jugCount = 0;

  // Place items every ~220–300 units along the track
  let y = 300;
  while (y < TRACK_LEN - 300){
    // 60% chance of a jug, 45% chance of a hazard each segment (can be both)
    if (Math.random() < 0.6){
      jugs.push({ x: lanesX[Math.floor(Math.random()*3)], y });
    }
    if (Math.random() < 0.45){
      hazards.push({ x: lanesX[Math.floor(Math.random()*3)], y, w: 46, h: 26 });
    }
    y += 220 + Math.random()*80;
  }
}

// ===== Game flow =====
function resetGame(){
  playing = false;
  elapsed = 0;
  lane = 1;
  runnerY = 80;
  camY = 0;
  lastTs = 0;
  clearConfetti();
  genWorld();
  timeEl.textContent = '0.00';
  jugsEl.textContent = '0';
}
resetGame();

function startGame(){
  resetGame();
  showScreen(screenGame);
  playing = true;
  requestAnimationFrame(loop);
}

function finish(){
  playing = false;
  finalTimeEl.textContent = formatTime(elapsed);
  showScreen(screenOver);
  confetti();
}

// ===== Input =====
window.addEventListener('keydown', (e)=>{
  if (!playing) return;
  if (e.key === 'ArrowLeft')  lane = Math.max(0, lane-1);
  if (e.key === 'ArrowRight') lane = Math.min(2, lane+1);
  if (e.key === 'ArrowUp')    runnerY += 60; // manual boost upward
  if (e.key === 'ArrowDown')  runnerY = Math.max(80, runnerY - 60);
});

let touchSX=null, touchSY=null;
canvas.addEventListener('touchstart', e=>{
  touchSX = e.changedTouches[0].clientX;
  touchSY = e.changedTouches[0].clientY;
},{passive:true});
canvas.addEventListener('touchend', e=>{
  if (!playing || touchSX==null || touchSY==null) return;
  const dx = e.changedTouches[0].clientX - touchSX;
  const dy = e.changedTouches[0].clientY - touchSY;
  if (dx < -20) lane = Math.max(0, lane-1);
  if (dx >  20) lane = Math.min(2, lane+1);
  if (dy < -20) runnerY += 60;
  if (dy >  20) runnerY = Math.max(80, runnerY - 60);
  touchSX=touchSY=null;
});

// ===== Rendering helpers (world→screen) =====
function worldToScreenY(y){ return BASE_H - (y - camY); }

// ===== Draw =====
function drawBackground(ts){
  const t = ts*0.00025;
  const g = ctx.createRadialGradient(
    BASE_W*0.5, BASE_H*0.1, 40 + 30*Math.sin(t),
    BASE_W*0.5, BASE_H*0.85, BASE_H*0.95
  );
  g.addColorStop(0, '#0b2140'); g.addColorStop(1, '#081523');
  ctx.fillStyle = g; ctx.fillRect(0,0,BASE_W,BASE_H);

  // Finish line banner
  const finishScreenY = worldToScreenY(TRACK_LEN);
  if (finishScreenY < BASE_H + 60){
    ctx.fillStyle = '#ffd84d';
    ctx.fillRect(0, finishScreenY-6, BASE_W, 12);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 18px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('FINISH', BASE_W/2, finishScreenY - 12);
  }
}

function drawRunner(){
  const x = lanesX[lane], yS = worldToScreenY(runnerY);
  ctx.fillStyle = '#60a5fa'; // body
  ctx.fillRect(x-18, yS-32, 36, 52);
  ctx.beginPath(); ctx.fillStyle = '#93c5fd'; // head
  ctx.arc(x, yS-40, 12, 0, Math.PI*2); ctx.fill();
}

function drawJug(it){
  const yS = worldToScreenY(it.y);
  ctx.save(); ctx.translate(it.x, yS);
  ctx.fillStyle = '#ffd84d'; ctx.fillRect(-16, -22, 32, 44);
  ctx.fillStyle = '#bda10d'; ctx.fillRect(-6, -26, 12, 6);
  ctx.restore();
}
function drawHazard(it){
  const yS = worldToScreenY(it.y);
  ctx.save(); ctx.translate(it.x, yS);
  ctx.fillStyle = '#64748b'; ctx.fillRect(-it.w/2, -it.h/2, it.w, it.h);
  ctx.restore();
}

// ===== Main loop =====
function loop(ts){
  const dt = Math.min(48, ts - (lastTs || ts)); lastTs = ts;
  const dtSec = dt / 1000;

  // Advance runner & camera (auto upward movement)
  runnerY += RUN_SPEED * dtSec;
  camY = Math.max(camY, runnerY - 0.68*BASE_H); // follow runner once high enough

  // Timer goes up continuously
  elapsed += dtSec;

  // Clear + background
  ctx.clearRect(0,0,BASE_W,BASE_H);
  drawBackground(ts);

  // Draw world items
  for (const j of jugs)  drawJug(j);
  for (const h of hazards) drawHazard(h);

  // Collisions (lane + vertical proximity)
  const laneX = lanesX[lane];
  const rY = runnerY, rTop = rY - 40, rBottom = rY + 20;

  // Jugs: if close in lane and overlapping vertically → collect, time -2s
  for (let i=jugs.length-1;i>=0;i--){
    const it = jugs[i];
    if (Math.abs(it.x - laneX) < 28 && Math.abs(it.y - rY) < 42){
      jugs.splice(i,1);
      jugCount++; jugsEl.textContent = String(jugCount);
      elapsed = Math.max(0, elapsed - 2);
      flash('−2.00s', '#22c55e');
    } else if (worldToScreenY(it.y) > BASE_H + 60) {
      // below screen — no action
    }
  }

  // Hazards: if close in lane and overlapping → time +2s
  for (let i=hazards.length-1;i>=0;i--){
    const it = hazards[i];
    if (Math.abs(it.x - laneX) < (it.w*0.6) && !(rTop > it.y + it.h/2 || rBottom < it.y - it.h/2)){
      hazards.splice(i,1);
      elapsed += 2;
      flash('+2.00s', '#ef4444');
    }
  }

  // Draw runner last (on top)
  drawRunner();

  // UI update
  timeEl.textContent = formatTime(elapsed);

  // Finish?
  if (runnerY >= TRACK_LEN){
    finish();
    return;
  }

  if (playing) requestAnimationFrame(loop);
}

// ===== Buttons =====
btnStart.addEventListener('click', startGame);
btnPlayAgain.addEventListener('click', startGame);
btnReset.addEventListener('click', ()=>{
  resetGame(); showScreen(screenStart);
});

// ===== Init =====
showScreen(screenStart);
