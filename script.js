/* =========================================================================
 * 自动驾驶目标识别 · 信号检测论 (SDT) 交互式实验
 * -------------------------------------------------------------------------
 * 场景：玩家扮演自动驾驶汽车的「感知系统」，观看前方车载摄像头画面。
 *       - 信号 S：画面中道路上确实出现行人 / 障碍物（应刹车）
 *       - 噪音 N：前方道路空旷，仅有路侧杂物与夜雾（应继续行驶）
 * 流程：开始页设参 → 逐试次（注视点 → 限时刺激 → 画面消失 → 作答 → 反馈）
 *       → 结果页（混淆矩阵 + d′/c/β + 分布可视化 + ROC + 历史排行）
 * 纯原生 HTML/CSS/JS，无任何外部依赖，双击 index.html 即可运行。
 * ========================================================================= */

'use strict';

/* ============================== 小工具函数 ============================== */

const $ = (id) => document.getElementById(id);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** 可取消的等待（通过 state.alive 在循环中判定是否中止） */
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/** 标准正态分布随机数（Box-Muller），用于制造试次间的能见度随机波动 */
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 确定性伪随机数发生器（保证每个试次的星点 / 路景布局可复现） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 标准正态分布数学工具（Phi 与其反函数 z） ---------- */

/** erf 近似（Abramowitz & Stegun 7.1.26，精度 ~1.5e-7） */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}

/** 标准正态累积分布函数 Φ(x) = P(Z ≤ x) */
function Phi(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** 标准正态分位数函数 Φ⁻¹(p)（Peter Acklam 算法，精度 ~1.15e-9） */
function invNorm(p) {
  p = clamp(p, 1e-10, 1 - 1e-10);
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
             1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
             6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
             -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
             3.754408661907416e+00];
  const pLow = 0.02425, pHigh = 1 - pLow;
  let q, r;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
          ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/* ============================== 全局状态 ============================== */

const state = {
  alive: false,          // 一局游戏是否仍在进行（返回首页时置 false 以中止异步流程）
  phase: 'idle',         // idle | fix | stim | respond | feedback
  cfg: null,             // 本局参数 { dPrime, prior, nTrials, stimMs }
  trials: [],            // 预生成的全部试次
  idx: 0,                // 当前试次序号
  counts: { H: 0, M: 0, FA: 0, CR: 0 },
  records: [],           // 每个试次的详细记录
  resolveResp: null,     // 等待作答的 Promise resolve
  respTimer: null,       // 作答超时计时器
  maskStart: 0,
  metrics: null          // 本局最终 SDT 指标（供 ROC 画实测点）
};

/* 道路场景画布逻辑分辨率（CSS 会自适应缩放） */
const RW = 960, RH = 520, VX = 480, VY = 226;

const roadCanvas = $('road-canvas');
const rctx = roadCanvas.getContext('2d');
roadCanvas.width = RW;
roadCanvas.height = RH;

/* 预生成 3 张噪点胶片，用于夜雾颗粒感与画面消失后的掩蔽 */
const noiseTiles = [];
for (let k = 0; k < 3; k++) {
  const tile = document.createElement('canvas');
  tile.width = 240; tile.height = 130;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(tile.width, tile.height);
  const rng = mulberry32(20260929 + k * 7919);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 150 + rng() * 105;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    img.data[i + 3] = 60 + rng() * 195;
  }
  tctx.putImageData(img, 0, 0);
  noiseTiles.push(tile);
}

/* ============================== 开始页交互 ============================== */

/** 绑定滑块与实时数值显示 */
function bindSlider(inputId, valId, fmt) {
  const input = $(inputId), label = $(valId);
  const sync = () => { label.textContent = fmt(parseFloat(input.value)); };
  input.addEventListener('input', sync);
  sync();
}

function initStartScreen() {
  bindSlider('dprime-input', 'dprime-val', (v) => v.toFixed(1));
  bindSlider('prior-input', 'prior-val', (v) => v.toFixed(2));
  bindSlider('trials-input', 'trials-val', (v) => String(v));
  bindSlider('stimtime-input', 'stimtime-val', (v) => `${v} ms`);

  $('btn-start').addEventListener('click', startGame);
  $('btn-again').addEventListener('click', startGame);
  $('btn-home').addEventListener('click', () => { stopGame(); showScreen('start'); });
  $('btn-clear-history').addEventListener('click', () => {
    if (confirm('确定清空本机全部历史对局记录吗？')) {
      try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* 忽略 */ }
      renderHistory();
    }
  });

  /* 可视化滑块：c 与 d′ 任意一个变化都重画两张图 */
  $('c-slider').addEventListener('input', drawAllViz);
  $('dp-slider').addEventListener('input', drawAllViz);

  /* 作答按钮 + 键盘（J / ← 继续；K / → 刹车），监听器全局只挂一次 */
  $('btn-no').addEventListener('click', () => handleResponse('no'));
  $('btn-yes').addEventListener('click', () => handleResponse('yes'));
  window.addEventListener('keydown', (e) => {
    if (state.phase !== 'respond') return;
    const k = e.key.toLowerCase();
    if (k === 'j' || e.key === 'ArrowLeft') { e.preventDefault(); handleResponse('no'); }
    else if (k === 'k' || e.key === 'ArrowRight') { e.preventDefault(); handleResponse('yes'); }
  });
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  $(`screen-${name}`).classList.remove('hidden');
}

/* ============================== 试次生成 ============================== */

/**
 * 按先验概率 P(S) 生成整局试次序列（信号 / 噪音数量精确，顺序随机洗牌）
 * 每个试次附带随机的场景参数（位置、深度、能见度波动、随机种子）。
 */
function generateTrials(n, prior) {
  const nSignal = Math.round(n * prior);
  const flags = [];
  for (let i = 0; i < n; i++) flags.push(i < nSignal); // 前 nSignal 个为信号
  // Fisher-Yates 洗牌
  for (let i = flags.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flags[i], flags[j]] = [flags[j], flags[i]];
  }
  return flags.map((isSignal, i) => ({
    index: i,
    signal: isSignal,
    seed: Math.floor(Math.random() * 1e9),
    visJ: randn(),     // 能见度（对比度）随机波动
    fogJ: randn(),     // 雾气浓度随机波动
    kind: Math.random() < 0.72 ? 'person' : 'barrier' // 行人 or 路障
  }));
}

/* ============================== 游戏流程 ============================== */

function startGame() {
  state.cfg = {
    dPrime: parseFloat($('dprime-input').value),
    prior: parseFloat($('prior-input').value),
    nTrials: parseInt($('trials-input').value, 10),
    stimMs: parseInt($('stimtime-input').value, 10)
  };
  state.trials = generateTrials(state.cfg.nTrials, state.cfg.prior);
  state.idx = 0;
  state.counts = { H: 0, M: 0, FA: 0, CR: 0 };
  state.records = [];
  state.metrics = null;
  state.alive = true;

  $('hud-dprime').textContent = state.cfg.dPrime.toFixed(1);
  $('hud-prior').textContent = state.cfg.prior.toFixed(2);
  setButtonsEnabled(false);
  hideOverlay();
  updateHUD();
  showScreen('game');
  gameLoop();
}

/** 中止游戏（返回首页时调用）：清掉超时计时器并让异步循环自然退出 */
function stopGame() {
  state.alive = false;
  state.phase = 'idle';
  if (state.respTimer) { clearTimeout(state.respTimer); state.respTimer = null; }
  if (state.resolveResp) { state.resolveResp = null; }
  hideOverlay();
}

/** 主循环：顺序执行各试次，全部结束后进入结果页 */
async function gameLoop() {
  for (state.idx = 0; state.idx < state.trials.length; state.idx++) {
    if (!state.alive) return;
    await runTrial(state.trials[state.idx]);
  }
  if (state.alive) endGame();
}

/**
 * 单个试次的状态流转：
 * fix 注视提示 → stim 限时刺激 → respond 画面消失等待作答 → feedback 反馈
 */
async function runTrial(trial) {
  updateHUD();
  setButtonsEnabled(false);
  hideOverlay();

  /* 1) 注视提示 */
  state.phase = 'fix';
  drawFixation();
  await wait(600);
  if (!state.alive) return;

  /* 2) 刺激限时呈现（时间条同步收缩） */
  state.phase = 'stim';
  drawScene(trial);
  runTimerBar(state.cfg.stimMs);
  await wait(state.cfg.stimMs);
  if (!state.alive) return;

  /* 3) 画面消失（掩蔽），开放 3 秒作答窗口；超时默认「继续行驶」 */
  state.phase = 'respond';
  drawMask();
  setButtonsEnabled(true);
  state.maskStart = performance.now();
  const answer = await new Promise((resolve) => {
    state.resolveResp = resolve;
    state.respTimer = setTimeout(
      () => resolve({ resp: 'no', timeout: true }), 3000
    );
  });
  if (!state.alive) return;

  /* 4) 判定四类结果并记录 */
  const outcome = trial.signal
    ? (answer.resp === 'yes' ? 'H' : 'M')
    : (answer.resp === 'yes' ? 'FA' : 'CR');
  state.counts[outcome]++;
  state.records.push({
    trial,
    resp: answer.resp,
    timeout: answer.timeout,
    outcome,
    rt: Math.round(performance.now() - state.maskStart)
  });
  updateHUD();

  /* 5) 反馈：重新揭开刚才的画面 + 结果横幅 */
  state.phase = 'feedback';
  setButtonsEnabled(false);
  drawScene(trial);
  showFeedback(outcome, answer.timeout);
  await wait(850);
  if (!state.alive) return;
  hideOverlay();
  await wait(160);
}

/** 作答入口（按钮 / 键盘共用），仅在 respond 阶段生效 */
function handleResponse(resp) {
  if (state.phase !== 'respond' || !state.resolveResp) return;
  clearTimeout(state.respTimer);
  state.respTimer = null;
  const resolve = state.resolveResp;
  state.resolveResp = null;
  state.phase = 'locking';
  resolve({ resp, timeout: false });
}

function setButtonsEnabled(on) {
  ['btn-no', 'btn-yes'].forEach((id) => {
    $(id).disabled = !on;
    $(id).classList.toggle('armed', on);
  });
}

function updateHUD() {
  $('hud-trial').textContent = `试次 ${Math.min(state.idx + 1, state.cfg.nTrials)} / ${state.cfg.nTrials}`;
  $('hud-score').textContent = `正确 ${state.counts.H + state.counts.CR}`;
}

/** 刺激呈现倒计时条：先复位，再用 CSS transition 线性收缩 */
function runTimerBar(ms) {
  const fill = $('stim-timer-fill');
  fill.style.transition = 'none';
  fill.style.width = '100%';
  void fill.offsetWidth; // 强制回流，保证复位生效
  fill.style.transition = `width ${ms}ms linear`;
  fill.style.width = '0%';
}

/* ============================== 场景 Canvas 绘制 ============================== */

/** 圆角矩形路径（兼容不支持 ctx.roundRect 的浏览器） */
function rrPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 画一帧「车载摄像头」夜驾画面；trial.signal 决定道路上是否有目标 */
function drawScene(trial) {
  const ctx = rctx;
  const rng = mulberry32(trial.seed);
  ctx.clearRect(0, 0, RW, RH);

  /* ---- 夜空 ---- */
  const sky = ctx.createLinearGradient(0, 0, 0, VY + 40);
  sky.addColorStop(0, '#0b1728');
  sky.addColorStop(1, '#050a14');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, RW, VY + 40);

  /* 星星（随试次种子变化） */
  for (let i = 0; i < 80; i++) {
    const x = rng() * RW, y = rng() * VY * 0.82, a = 0.15 + rng() * 0.6;
    ctx.fillStyle = `rgba(210,225,255,${a})`;
    ctx.fillRect(x, y, rng() < 0.1 ? 2 : 1, rng() < 0.1 ? 2 : 1);
  }
  /* 月亮 */
  ctx.fillStyle = 'rgba(232,240,255,.85)';
  ctx.beginPath(); ctx.arc(770, 74, 24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(232,240,255,.10)';
  ctx.beginPath(); ctx.arc(770, 74, 40, 0, Math.PI * 2); ctx.fill();

  /* 远处城市剪影 */
  ctx.fillStyle = '#080e18';
  let bx = 0;
  while (bx < RW) {
    const bw = 26 + rng() * 60, bh = 12 + rng() * 46;
    ctx.fillRect(bx, VY - bh + 8, bw, bh);
    bx += bw + 4;
  }

  /* ---- 地面 ---- */
  const ground = ctx.createLinearGradient(0, VY, 0, RH);
  ground.addColorStop(0, '#0a1018');
  ground.addColorStop(1, '#05080d');
  ctx.fillStyle = ground;
  ctx.fillRect(0, VY, RW, RH - VY);

  /* ---- 道路（梯形透视） ---- */
  const roadFar = 36, roadNear = RW * 0.43;
  ctx.fillStyle = '#171c23';
  ctx.beginPath();
  ctx.moveTo(VX - roadNear, RH); ctx.lineTo(VX + roadNear, RH);
  ctx.lineTo(VX + roadFar, VY); ctx.lineTo(VX - roadFar, VY);
  ctx.closePath(); ctx.fill();

  /* 车灯光锥 */
  const cone = ctx.createLinearGradient(0, VY, 0, RH);
  cone.addColorStop(0, 'rgba(255,244,205,0.02)');
  cone.addColorStop(1, 'rgba(255,244,205,0.13)');
  ctx.fillStyle = cone;
  ctx.beginPath();
  ctx.moveTo(VX - roadNear * 0.72, RH); ctx.lineTo(VX + roadNear * 0.72, RH);
  ctx.lineTo(VX + roadFar * 0.55, VY); ctx.lineTo(VX - roadFar * 0.55, VY);
  ctx.closePath(); ctx.fill();

  /* 道路边缘线 + 中央虚线（按透视深度排布） */
  ctx.strokeStyle = 'rgba(220,225,235,.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(VX - roadNear, RH); ctx.lineTo(VX - roadFar, VY);
  ctx.moveTo(VX + roadNear, RH); ctx.lineTo(VX + roadFar, VY);
  ctx.stroke();
  for (let k = 0; k < 13; k++) {
    const d = Math.pow(k / 12, 1.8);               // 0 远 → 1 近
    const y = lerp(VY + 4, RH - 6, d);
    const len = 5 + 34 * d, w = 1.5 + 4.5 * d;
    ctx.fillStyle = `rgba(225,230,240,${0.12 + 0.45 * d})`;
    ctx.fillRect(VX - w / 2, y, w, len);
  }

  /* 路侧杂物（护栏柱 / 灌木，两种试次都出现，是诱发虚警的「噪音线索」） */
  ctx.fillStyle = '#0c121b';
  for (let i = 0; i < 10; i++) {
    const d = Math.pow(i / 9, 1.7);
    const y = lerp(VY + 6, RH - 14, d);
    const hw = lerp(roadFar, roadNear, d);
    const s = 3 + 26 * d;
    [-1, 1].forEach((side) => {
      const x = VX + side * (hw + 12 + rng() * 26);
      if (rng() < 0.5) { ctx.fillRect(x - 1.5, y - s, 3, s); }      // 护栏柱
      else { ctx.beginPath(); ctx.arc(x, y - s * 0.4, s * 0.55, 0, Math.PI * 2); ctx.fill(); } // 灌木
    });
  }

  /* ---- 信号目标：行人 / 路障；清晰度由 d′ 与随机波动共同决定 ---- */
  if (trial.signal) {
    const depth = 0.34 + rng() * 0.5;                 // 纵向深度（越接近 1 越近、越大）
    const y = lerp(VY + 8, RH - 10, depth);
    const hw = lerp(roadFar, roadNear, depth);
    const x = VX + (rng() * 2 - 1) * hw * 0.68;       // 横向位置
    /* d′ 越大 → 目标对比度越高；叠加试次级高斯波动 */
    const alpha = clamp(0.30 + 0.20 * state.cfg.dPrime + trial.visJ * 0.12, 0.12, 0.97);

    if (trial.kind === 'person') drawPedestrian(ctx, x, y, RH * (0.05 + 0.30 * depth), alpha);
    else drawBarrier(ctx, x, y, RH * (0.05 + 0.30 * depth), alpha);
  }

  /* ---- 夜雾（d′ 越小雾越浓）+ 胶片颗粒 ---- */
  const fogA = clamp(0.52 - 0.14 * state.cfg.dPrime + trial.fogJ * 0.06, 0.18, 0.66);
  ctx.fillStyle = `rgba(7,11,19,${fogA})`;
  ctx.fillRect(0, 0, RW, RH);

  const grainA = clamp(0.34 - 0.08 * state.cfg.dPrime + trial.fogJ * 0.04, 0.12, 0.42);
  ctx.globalAlpha = grainA;
  ctx.drawImage(noiseTiles[trial.seed % 3], 0, 0, RW, RH);
  ctx.globalAlpha = 1;

  /* ---- 暗角 + 摄像头 HUD 文案（场景代入感） ---- */
  const vig = ctx.createRadialGradient(VX, RH * 0.55, RH * 0.35, VX, RH * 0.55, RH * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, RW, RH);

  ctx.font = '13px Consolas,monospace';
  ctx.fillStyle = 'rgba(120,200,230,.75)';
  ctx.fillText('● REC   CAM-FRONT   23:48', 18, 26);
  ctx.textAlign = 'right';
  ctx.fillText('AUTOPILOT / SENSOR FUSION', RW - 18, 26);
  ctx.textAlign = 'left';
}

/** 画一个行人剪影（头 + 躯干 + 双腿），alpha 控制可辨认程度 */
function drawPedestrian(ctx, x, y, h, alpha) {
  const w = h * 0.34;
  ctx.fillStyle = `rgba(196,203,216,${alpha})`;
  /* 头 */
  ctx.beginPath();
  ctx.arc(x, y - h * 0.9, w * 0.42, 0, Math.PI * 2);
  ctx.fill();
  /* 躯干 */
  rrPath(ctx, x - w / 2, y - h * 0.78, w, h * 0.42, w * 0.22);
  ctx.fill();
  /* 双腿 */
  ctx.fillRect(x - w * 0.42, y - h * 0.38, w * 0.3, h * 0.38);
  ctx.fillRect(x + w * 0.12, y - h * 0.38, w * 0.3, h * 0.38);
  /* 手臂 */
  ctx.fillRect(x - w * 0.66, y - h * 0.74, w * 0.2, h * 0.34);
  ctx.fillRect(x + w * 0.46, y - h * 0.74, w * 0.2, h * 0.34);
}

/** 画一个施工路障（横栏 + 斜纹），alpha 控制可辨认程度 */
function drawBarrier(ctx, x, y, h, alpha) {
  const bw = h * 0.95, bh = h * 0.2;
  ctx.fillStyle = `rgba(205,132,54,${alpha})`;
  rrPath(ctx, x - bw / 2, y - bh * 1.7, bw, bh, 3);
  ctx.fill();
  ctx.strokeStyle = `rgba(20,20,24,${alpha})`;
  ctx.lineWidth = Math.max(2, bh * 0.18);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * bw * 0.22, y - bh * 0.7);
    ctx.lineTo(x + i * bw * 0.22 + bw * 0.14, y - bh * 1.7);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(120,125,135,${alpha * 0.9})`;
  ctx.fillRect(x - bw * 0.3, y - bh * 0.7, bw * 0.08, bh * 0.7);
  ctx.fillRect(x + bw * 0.22, y - bh * 0.7, bw * 0.08, bh * 0.7);
}

/** 注视点画面 */
function drawFixation() {
  const ctx = rctx;
  ctx.fillStyle = '#05080e';
  ctx.fillRect(0, 0, RW, RH);
  ctx.strokeStyle = 'rgba(34,211,238,.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(VX - 14, VY); ctx.lineTo(VX + 14, VY);
  ctx.moveTo(VX, VY - 14); ctx.lineTo(VX, VY + 14);
  ctx.stroke();
  ctx.fillStyle = 'rgba(147,164,189,.9)';
  ctx.font = '20px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('注意前方路况…', VX, VY + 52);
  ctx.textAlign = 'left';
}

/** 刺激消失后的视觉掩蔽（强噪点 + 作答提示） */
function drawMask() {
  const ctx = rctx;
  ctx.fillStyle = '#04070c';
  ctx.fillRect(0, 0, RW, RH);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(noiseTiles[Math.floor(Math.random() * 3)], 0, 0, RW, RH);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e6edf6';
  ctx.font = 'bold 30px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillText('画面已消失', VX, VY - 8);
  ctx.fillStyle = '#93a4bd';
  ctx.font = '18px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillText('请凭刚才的记忆判断：前方是否有障碍？', VX, VY + 30);
  ctx.fillStyle = 'rgba(34,211,238,.85)';
  ctx.font = '15px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillText('J / ← = 继续行驶　　K / → = 刹车（3 秒内作答）', VX, VY + 66);
  ctx.textAlign = 'left';
}

/** 反馈横幅（配色复用 CSS 中的 fb-hit/fb-miss/fb-fa/fb-cr） */
function showFeedback(outcome, timeout) {
  const map = {
    H:  ['fb-hit', '击中 ✓ 刹车成功！', '前方确实有障碍，你的判断完全正确。'],
    M:  ['fb-miss', '漏报 ✗ 危险！', '前方有障碍却没有刹车，发生了碰撞风险。'],
    FA: ['fb-fa', '虚警 ✗ 误刹车', '前方道路畅通，不必要的刹车会影响通行。'],
    CR: ['fb-cr', '正确拒斥 ✓ 继续行驶', '前方道路畅通，继续行驶是正确选择。']
  };
  const [cls, title, sub] = map[outcome];
  const ov = $('overlay');
  ov.className = `overlay overlay-response ${cls}`;
  ov.innerHTML =
    `<div>${title}</div><div class="fb-sub">${sub}${timeout ? '（超时未作答，记为「继续行驶」）' : ''}</div>`;
}

function hideOverlay() {
  const ov = $('overlay');
  ov.className = 'overlay';
  ov.innerHTML = '';
}

/* ============================== SDT 指标计算 ============================== */

/**
 * 由四格计数计算全部 SDT 指标。
 * 采用 log-linear 校正（每格 +0.5）：
 *   P(H) = (H+0.5)/(信号试次+1)，P(FA) = (FA+0.5)/(噪音试次+1)
 * 避免击中率 / 虚警率为 0 或 1 时 z 分数发散为 ±∞。
 */
function computeSDT(counts, nTotal) {
  const { H, M, FA, CR } = counts;
  const nS = H + M, nN = FA + CR;
  const pH = (H + 0.5) / (nS + 1);
  const pFA = (FA + 0.5) / (nN + 1);
  const zH = invNorm(pH), zFA = invNorm(pFA);

  return {
    H, M, FA, CR, nS, nN,
    pH, pFA,
    dPrime: zH - zFA,                       // 辨别力 d′
    c: -(zH + zFA) / 2,                     // 判断标准 c
    beta: Math.exp((zFA * zFA - zH * zH) / 2), // 似然比 β
    acc: (H + CR) / nTotal,                 // 准确率
    auc: Phi((zH - zFA) / Math.SQRT2)       // ROC 曲线下面积 Az = Φ(d′/√2)
  };
}

/* ============================== 结果页 ============================== */

function endGame() {
  state.phase = 'idle';
  setButtonsEnabled(false);
  hideOverlay();

  const m = computeSDT(state.counts, state.cfg.nTrials);
  state.metrics = m;

  /* 四格计数 */
  $('cnt-H').textContent = m.H; $('cnt-M').textContent = m.M;
  $('cnt-FA').textContent = m.FA; $('cnt-CR').textContent = m.CR;

  /* 指标卡 */
  $('m-pHit').textContent = `${m.pH.toFixed(2)}（${(m.pH * 100).toFixed(0)}%）`;
  $('m-pFA').textContent = `${m.pFA.toFixed(2)}（${(m.pFA * 100).toFixed(0)}%）`;
  $('m-dp').textContent = m.dPrime.toFixed(2);
  $('m-c').textContent = m.c.toFixed(2);
  $('m-acc').textContent = `${(m.acc * 100).toFixed(1)}%`;
  $('m-beta').textContent = m.beta >= 999 ? m.beta.toExponential(2) : m.beta.toFixed(2);

  /* 文字总结 */
  $('result-summary').textContent =
    `共 ${state.cfg.nTrials} 个试次（信号 ${m.nS} · 噪音 ${m.nN}），判断正确 ${m.H + m.CR} 次，准确率 ${(m.acc * 100).toFixed(1)}%。`;

  const dpDiff = m.dPrime - state.cfg.dPrime;
  const dpWord = Math.abs(dpDiff) < 0.35
    ? '实测辨别力与场景设定难度基本吻合'
    : dpDiff > 0 ? '实测辨别力高于设定难度，注意力很集中'
    : '实测辨别力低于设定难度，可放慢节奏或调高 d′ 再试';
  $('dp-compare').textContent =
    `场景设定 d′ = ${state.cfg.dPrime.toFixed(1)}，你的实测 d′ = ${m.dPrime.toFixed(2)}（${dpWord}）。`;

  const bias = m.c <= -0.3
    ? `c = ${m.c.toFixed(2)} < 0：标准偏「宽松/激进」——更倾向于报告有障碍、果断刹车，因此虚警偏多但漏报更少（β = ${m.beta.toFixed(2)} < 1）。`
    : m.c >= 0.3
      ? `c = ${m.c.toFixed(2)} > 0：标准偏「保守」——不轻易刹车，因此虚警更少，但在 P(S)=${state.cfg.prior.toFixed(2)} 的低先验下需警惕漏报风险（β = ${m.beta.toFixed(2)} > 1）。`
      : `c = ${m.c.toFixed(2)} ≈ 0：判断标准居中、不偏不倚（β ≈ 1）。`;
  $('bias-text').textContent = bias;

  /* 逐次回顾色带 */
  renderTrialStrip();

  /* 可视化：滑块初始值取本局实测结果 */
  $('c-slider').value = clamp(m.c, -3, 3);
  $('dp-slider').value = clamp(m.dPrime, 0, 3.5) || 0.5;
  const note = $('dist-canvas').closest('.panel').querySelector('.panel-note');
  note.innerHTML = `基于本局实测 <b>d′ = ${m.dPrime.toFixed(2)}</b>、<b>c = ${m.c.toFixed(2)}</b> 绘制；拖动 c / d′ 滑块可观察分布分离程度与标准位置如何影响四类结果面积。`;

  /* 存档 + 历史 / 排行榜 */
  saveRecord(m);
  renderHistory();

  /* 注意：必须先显示结果页再画图——drawAllViz 在结果页隐藏时会主动跳过 */
  showScreen('result');
  drawAllViz();
}

/** 逐次试次色带（hover 可见详细信息） */
function renderTrialStrip() {
  const wrap = $('trial-strip');
  wrap.innerHTML = '';
  const respText = { yes: '刹车', no: '继续' };
  const name = { H: '击中', M: '漏报', FA: '虚警', CR: '正确拒斥' };
  state.records.forEach((r, i) => {
    const dot = document.createElement('span');
    dot.className = `trial-dot ${r.outcome.toLowerCase()}`;
    dot.title = `第 ${i + 1} 试次：实际${r.trial.signal ? '有障碍(信号)' : '无障碍(噪音)'}，` +
                `你选择「${respText[r.resp]}」→ ${name[r.outcome]}，反应时 ${r.rt} ms`;
    wrap.appendChild(dot);
  });
}

/* ====================== 可视化 1：信号/噪音分布 ====================== */

/** 正态密度函数 */
function pdf(x, mu) {
  return Math.exp(-0.5 * (x - mu) * (x - mu)) / Math.sqrt(2 * Math.PI);
}

/** 填充某条正态曲线在 [lo, hi] 区间下的面积 */
function fillUnderCurve(ctx, X, Y, mu, lo, hi, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(X(lo), Y(0));
  const STEPS = 120;
  for (let i = 0; i <= STEPS; i++) {
    const x = lo + (hi - lo) * i / STEPS;
    ctx.lineTo(X(x), Y(pdf(x, mu)));
  }
  ctx.lineTo(X(hi), Y(0));
  ctx.closePath();
  ctx.fill();
}

function drawDistributions() {
  const cv = $('dist-canvas');
  cv.width = 1000; cv.height = 360;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const ml = 50, mr = 24, mt = 30, mb = 40;

  const dp = parseFloat($('dp-slider').value);
  const c = parseFloat($('c-slider').value);
  const xMin = -3.5, xMax = dp + 3.5;
  const yMax = 0.42;
  const X = (v) => ml + (v - xMin) / (xMax - xMin) * (W - ml - mr);
  const Y = (v) => H - mb - v / yMax * (H - mt - mb);

  ctx.fillStyle = '#0b1524';
  ctx.fillRect(0, 0, W, H);

  /* 网格与坐标轴 */
  ctx.strokeStyle = 'rgba(148,163,184,.15)';
  ctx.fillStyle = '#8aa0bd';
  ctx.font = '12px "Segoe UI",sans-serif';
  ctx.textAlign = 'center';
  for (let gx = Math.ceil(xMin); gx <= Math.floor(xMax); gx++) {
    ctx.beginPath(); ctx.moveTo(X(gx), mt); ctx.lineTo(X(gx), H - mb); ctx.stroke();
    ctx.fillText(gx, X(gx), H - mb + 18);
  }
  ctx.textAlign = 'right';
  for (let gy = 0; gy <= 0.4; gy += 0.1) {
    ctx.beginPath(); ctx.moveTo(ml, Y(gy)); ctx.lineTo(W - mr, Y(gy)); ctx.stroke();
    ctx.fillText(gy.toFixed(1), ml - 8, Y(gy) + 4);
  }
  /* 横轴 */
  ctx.strokeStyle = 'rgba(148,163,184,.5)';
  ctx.beginPath(); ctx.moveTo(ml, Y(0)); ctx.lineTo(W - mr, Y(0)); ctx.stroke();

  /* 四块面积：噪音在标准左/右分别为虚警(橙)/正确拒斥(蓝)；
     信号在标准左/右分别为漏报(红)/击中(绿) */
  fillUnderCurve(ctx, X, Y, 0, xMin, c, 'rgba(251,191,36,.28)');
  fillUnderCurve(ctx, X, Y, 0, c, xMax, 'rgba(96,165,250,.26)');
  fillUnderCurve(ctx, X, Y, dp, xMin, c, 'rgba(248,113,113,.26)');
  fillUnderCurve(ctx, X, Y, dp, c, xMax, 'rgba(52,211,153,.28)');

  /* 两条密度曲线 */
  const strokeCurve = (mu, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.5;
    ctx.beginPath();
    const STEPS = 200;
    for (let i = 0; i <= STEPS; i++) {
      const x = xMin + (xMax - xMin) * i / STEPS;
      i === 0 ? ctx.moveTo(X(x), Y(pdf(x, mu))) : ctx.lineTo(X(x), Y(pdf(x, mu)));
    }
    ctx.stroke();
  };
  strokeCurve(0, '#60a5fa');
  strokeCurve(dp, '#f87171');

  /* 均值标注（d′ 较小时两个均值位置接近，合并为一条标签避免文字重叠） */
  ctx.textAlign = 'center';
  if (dp >= 1.3) {
    ctx.fillStyle = '#60a5fa';
    ctx.fillText('μ_N = 0（噪音）', X(0), H - 8);
    ctx.fillStyle = '#f87171';
    ctx.fillText(`μ_S = ${dp.toFixed(1)}（信号）`, X(clamp(dp, xMin + 0.6, xMax - 0.6)), H - 8);
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`μ_N = 0（噪音） · μ_S = ${dp.toFixed(2)}（信号）`,
                 X(clamp(dp / 2, -2.2, 1.2)), H - 8);
  }

  /* 判断标准 c */
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.moveTo(X(c), mt - 6); ctx.lineTo(X(c), Y(0)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = X(c) > W - 90 ? 'right' : 'left';
  ctx.font = 'bold 13px "Segoe UI",sans-serif';
  ctx.fillText(`c = ${c.toFixed(2)}`, X(c) + (X(c) > W - 90 ? -6 : 6), mt + 6);
  ctx.textAlign = 'left';
}

/* ========================== 可视化 2：ROC 曲线 ========================== */

function drawROC() {
  const cv = $('roc-canvas');
  cv.width = 560; cv.height = 480;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const ml = 52, mt = 22, mb = 44, mr = 18;
  const size = Math.min(W - ml - mr, H - mt - mb);

  const dp = parseFloat($('dp-slider').value);
  const c = parseFloat($('c-slider').value);
  const X = (p) => ml + p * size;
  const Y = (p) => mt + size - p * size;

  ctx.fillStyle = '#0b1524';
  ctx.fillRect(0, 0, W, H);

  /* 网格 + 刻度 */
  ctx.strokeStyle = 'rgba(148,163,184,.15)';
  ctx.fillStyle = '#8aa0bd';
  ctx.font = '12px "Segoe UI",sans-serif';
  ctx.textAlign = 'center';
  for (let g = 0; g <= 5; g++) {
    const p = g / 5;
    ctx.beginPath(); ctx.moveTo(X(p), Y(0)); ctx.lineTo(X(p), Y(1)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), Y(p)); ctx.lineTo(X(1), Y(p)); ctx.stroke();
    ctx.fillText(p.toFixed(1), X(p), Y(0) + 18);
    if (g > 0) { ctx.textAlign = 'right'; ctx.fillText(p.toFixed(1), X(0) - 8, Y(p) + 4); ctx.textAlign = 'center'; }
  }
  /* 边框与轴名 */
  ctx.strokeStyle = 'rgba(148,163,184,.5)'; ctx.lineWidth = 1;
  ctx.strokeRect(X(0), Y(1), size, size);
  ctx.fillStyle = '#93a4bd'; ctx.font = '13px "Segoe UI",sans-serif';
  ctx.fillText('P(FA) 虚警率', X(0.5), H - 8);
  ctx.save();
  ctx.translate(15, Y(0.5)); ctx.rotate(-Math.PI / 2);
  ctx.fillText('P(Hit) 击中率', 0, 0);
  ctx.restore();

  /* 随机水平对角线 */
  ctx.strokeStyle = 'rgba(148,163,184,.55)';
  ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke();
  ctx.setLineDash([]);

  /* 理论 ROC：让标准从 +4 扫到 -4
     P(FA) = P(X>c|噪音) = 1-Φ(c)；P(Hit) = 1-Φ(c-d′) */
  ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  const STEPS = 220;
  for (let i = 0; i <= STEPS; i++) {
    const crit = 4 - 8 * i / STEPS;
    const fa = 1 - Phi(crit), hit = 1 - Phi(crit - dp);
    i === 0 ? ctx.moveTo(X(fa), Y(hit)) : ctx.lineTo(X(fa), Y(hit));
  }
  ctx.stroke();

  /* 曲线下面积 Az 文本 */
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(34,211,238,.9)';
  ctx.font = '12px "Segoe UI",sans-serif';
  ctx.fillText(`AUC = Φ(d′/√2) = ${Phi(dp / Math.SQRT2).toFixed(3)}`, X(0.04), Y(0.95));

  /* 本局实测操作点（红） */
  if (state.metrics) {
    const m = state.metrics;
    ctx.fillStyle = '#f87171';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(X(m.pFA), Y(m.pH), 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fca5a5';
    ctx.fillText('实测点', X(m.pFA) + 9, Y(m.pH) - 7);
  }

  /* 当前 c 滑块对应操作点（青） */
  const curFA = 1 - Phi(c), curHit = 1 - Phi(c - dp);
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath(); ctx.arc(X(curFA), Y(curHit), 5, 0, Math.PI * 2); ctx.fill();

  /* 同步 c 滑块下方的提示文字（理论概率） */
  $('c-val').textContent = c.toFixed(2);
  $('dp-viz-val').textContent = dp.toFixed(2);
  $('c-hint').textContent =
    `c 右移 = 更保守（更少报告「有障碍」）；左移 = 更激进。当前标准下理论击中率 ${(curHit * 100).toFixed(1)}%、虚警率 ${(curFA * 100).toFixed(1)}%。`;
}

/** 两张可视化图一起重画（任一滑块输入时调用） */
function drawAllViz() {
  if ($('screen-result').classList.contains('hidden')) return;
  drawDistributions();
  drawROC();
}

/* ====================== 多局历史 / 排行榜（localStorage） ====================== */

const HISTORY_KEY = 'sdt_autopilot_history_v1';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch (e) { return []; }
}

function saveRecord(m) {
  const list = loadHistory();
  list.push({
    t: Date.now(),
    setDp: state.cfg.dPrime,
    prior: state.cfg.prior,
    n: state.cfg.nTrials,
    H: m.H, M: m.M, FA: m.FA, CR: m.CR,
    dp: m.dPrime, c: m.c, acc: m.acc
  });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-50))); }
  catch (e) { /* 隐私模式等场景下静默失败 */ }
}

function renderHistory() {
  const list = loadHistory();
  const empty = $('history-empty'), table = $('history-table');
  const tbody = $('history-tbody');
  tbody.innerHTML = '';

  if (list.length === 0) {
    empty.style.display = '';
    table.style.display = 'none';
  } else {
    empty.style.display = 'none';
    table.style.display = '';
    /* 明细表：最新在最上方 */
    list.slice().reverse().forEach((r, i) => {
      const tr = document.createElement('tr');
      const time = new Date(r.t);
      const pad = (x) => String(x).padStart(2, '0');
      const tstr = `${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
      tr.innerHTML =
        `<td>${list.length - i}</td><td>${tstr}</td><td>${r.setDp.toFixed(1)}</td>` +
        `<td>${r.prior.toFixed(2)}</td><td>${r.n}</td>` +
        `<td>${r.H}/${r.M}/${r.FA}/${r.CR}</td>` +
        `<td>${r.dp.toFixed(2)}</td><td>${r.c.toFixed(2)}</td>` +
        `<td>${(r.acc * 100).toFixed(1)}%</td>`;
      tbody.appendChild(tr);
    });
  }

  /* 排行榜：按实测 d′ 降序取前 5 */
  const lb = $('leaderboard');
  lb.innerHTML = '';
  const top = list.slice().sort((a, b) => b.dp - a.dp).slice(0, 5);
  if (top.length === 0) {
    lb.innerHTML = '<p class="panel-note">完成一局后上榜。</p>';
    return;
  }
  top.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row';
    const time = new Date(r.t);
    row.innerHTML =
      `<span class="lb-rank ${i < 3 ? 'r' + (i + 1) : ''}">${i + 1}</span>` +
      `<span class="lb-meta">设定 d′ ${r.setDp.toFixed(1)} · ${r.n} 试次 · ` +
      `${time.getMonth() + 1}/${time.getDate()}</span>` +
      `<span><span class="lb-dp">d′ ${r.dp.toFixed(2)}</span><br>` +
      `<span class="lb-acc">准确率 ${(r.acc * 100).toFixed(0)}%</span></span>`;
    lb.appendChild(row);
  });
}

/* ============================== 启动 ============================== */

initStartScreen();
renderHistory(); // 结果页默认隐藏；先渲染一次保证打开结果页前数据就绪
