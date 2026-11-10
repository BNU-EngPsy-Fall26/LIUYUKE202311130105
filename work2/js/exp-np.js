/* ============================================================
   exp-np.js — 实验2：座舱仪表负启动（Negative Priming）
   ------------------------------------------------------------
   设计：2（显示条件：基线/弱高亮，block 间平衡）× 3（试次类型：控制/正启动/负启动）
   因变量：探测判断反应时与正确率；负启动量 = RT(负启动) − RT(控制)
   出处：Tipper (1985) 负启动效应；座舱情境参照 Wickens 的注意资源与显示设计研究
   ============================================================ */

(function () {
  const AL = window.AL;
  const U = AL.util;
  const CFG = AL.config.NP;

  const GAUGES = [
    { name: '高度', code: 'ALT' },
    { name: '速度', code: 'SPD' },
    { name: '航向', code: 'HDG' },
    { name: '燃油', code: 'FUEL' },
    { name: '液压', code: 'HYD' },
    { name: '温度', code: 'TEMP' }
  ];

  const TYPE_LABEL = { control: '控制', positive: '正启动', negative: '负启动' };
  const BLOCK_LABEL = { baseline: '基线（仅目标红框）', highlight: '弱高亮（干扰项加浅灰边框）' };

  /* ------------------------------------------------------------
     仪表绘制（拟真：刻度数字、警示弧区、指针尾、表圈光泽）
     ------------------------------------------------------------ */
  const RAD = d => (d * Math.PI) / 180;
  function arcPath(cx, cy, r, a1, a2) {
    const x1 = cx + r * Math.sin(RAD(a1)), y1 = cy - r * Math.cos(RAD(a1));
    const x2 = cx + r * Math.sin(RAD(a2)), y2 = cy - r * Math.cos(RAD(a2));
    const large = (a2 - a1) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  function valToAngle(v) { return -135 + v * 2.7; } // 0→-135°, 100→135°

  function gaugeSVG(angle) {
    let ticks = '', labels = '';
    // 主刻度 + 数字 0/25/50/75/100
    [[0, -135], [25, -67.5], [50, 0], [75, 67.5], [100, 135]].forEach(([v, a]) => {
      const x1 = 80 + 60 * Math.sin(RAD(a)), y1 = 80 - 60 * Math.cos(RAD(a));
      const x2 = 80 + 47 * Math.sin(RAD(a)), y2 = 80 - 47 * Math.cos(RAD(a));
      ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
        stroke="#3a4f5f" stroke-width="2.6" stroke-linecap="round"/>`;
      const lx = 80 + 36 * Math.sin(RAD(a)), ly = 80 - 36 * Math.cos(RAD(a));
      labels += `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle"
        font-size="10" fill="#4a6275" font-family="Consolas,monospace">${v}</text>`;
    });
    // 次刻度
    for (let a = -121.5; a <= 121.5; a += 27) {
      const x1 = 80 + 60 * Math.sin(RAD(a)), y1 = 80 - 60 * Math.cos(RAD(a));
      const x2 = 80 + 53 * Math.sin(RAD(a)), y2 = 80 - 53 * Math.cos(RAD(a));
      ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
        stroke="#8aa0b2" stroke-width="1.4" stroke-linecap="round"/>`;
    }

    const nx = 80 + 46 * Math.sin(RAD(angle));
    const ny = 80 - 46 * Math.cos(RAD(angle));
    const tx = 80 - 16 * Math.sin(RAD(angle));   // 指针尾
    const ty = 80 + 16 * Math.cos(RAD(angle));

    return `<svg viewBox="0 0 160 160">
      <defs>
        <radialGradient id="bezel" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="70%" stop-color="#eaf2f9"/>
          <stop offset="100%" stop-color="#d3e0ec"/>
        </radialGradient>
      </defs>
      <circle cx="80" cy="80" r="68" fill="#c9d6e2" stroke="#a7b8c7" stroke-width="2"/>
      <circle cx="80" cy="80" r="64" fill="url(#bezel)" stroke="#dfeaf3" stroke-width="1"/>
      <!-- 高值警示弧区（75–100） -->
      <path d="${arcPath(80, 80, 57, 67.5, 135)}" fill="none" stroke="#e5533d" stroke-width="5" stroke-linecap="round" opacity=".85"/>
      ${ticks}
      ${labels}
      <polygon points="80,4 72,18 88,18" fill="#e5533d"/>
      <line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}"
        stroke="#ef7a2a" stroke-width="3.4" stroke-linecap="round"/>
      <circle cx="80" cy="80" r="7" fill="#2a3943"/>
      <circle cx="80" cy="80" r="3" fill="#ef7a2a"/>
    </svg>`;
  }

  function makeAngles(targetIdx) {
    const arr = [];
    for (let i = 0; i < GAUGES.length; i++) {
      const mag = i === targetIdx ? U.rand(58, 106) : U.rand(30, 108);
      const sign = Math.random() < 0.5 ? -1 : 1;
      arr.push(Math.round(sign * mag));
    }
    return arr;
  }

  /* ------------------------------------------------------------
     试次生成
     ------------------------------------------------------------ */
  function buildPractice() {
    const types = ['control', 'positive', 'negative'];
    const trials = [];
    for (let i = 0; i < CFG.PRACTICE_TRIALS; i++) {
      const type = types[i % 3];
      const probeIdx = i % 6;
      let primeIdx;
      if (type === 'positive') primeIdx = probeIdx;
      else if (type === 'negative') primeIdx = (probeIdx + 1 + (i % 5)) % 6;
      else primeIdx = (probeIdx + 3) % 6;
      trials.push({ type, probeIdx, primeIdx, blockType: 'baseline', practice: true });
    }
    return U.shuffle(trials);
  }

  function buildBlock(blockType) {
    const types = ['control', 'positive', 'negative'];
    const trials = [];

    for (let t = 0; t < types.length; t++) {
      for (let rep = 0; rep < CFG.TRIALS_PER_TYPE; rep++) {
        const type = types[t];
        const probeIdx = (rep + t * 2) % 6;
        let primeIdx;
        if (type === 'positive') primeIdx = probeIdx;
        else if (type === 'negative') primeIdx = (probeIdx + 1 + (rep % 5)) % 6;
        else primeIdx = (probeIdx + 3) % 6;

        trials.push({ type, probeIdx, primeIdx, blockType });
      }
    }
    return U.shuffle(trials);
  }

  /* ------------------------------------------------------------
     运行状态
     ------------------------------------------------------------ */
  const state = {
    onFinish: null,
    pid: '',
    startedAt: '',
    blockOrder: ['baseline', 'highlight'],
    blockIndex: 0,
    queue: [],
    i: 0,
    formal: false,
    results: [],
    practiceResults: [],
    formalCount: 0,
    trial: null,
    phase: 'idle',
    responseMode: null,
    onset: 0,
    currentSide: '',
    primeRt: null,
    primeCorrect: null,
    respTimer: null,
    quitting: false
  };

  /* ------------------------------------------------------------
     渲染
     ------------------------------------------------------------ */
  function renderShell(host) {
    const tiles = GAUGES.map((g, i) => `
      <div class="gauge-tile" data-i="${i}">
        <div class="gauge-body">${gaugeSVG(0)}</div>
        <div class="gauge-name">${g.name}<span>${g.code}</span></div>
      </div>`).join('');

    host.innerHTML = `
      <div class="exp-shell">
        <div class="hud">
          <div class="hud-left">
            <span class="hud-tag">EXP 2</span>
            <span class="hud-title">座舱负启动</span>
          </div>
          <div class="hud-center">
            <div class="progress"><div class="progress-bar" id="npBar"></div></div>
            <span class="hud-count" id="npCount">0 / 0</span>
          </div>
          <div class="hud-right">
            <span class="hud-cond" id="npCond">练习</span>
            <button class="btn btn-ghost btn-tiny" id="npQuit">退出 Esc</button>
          </div>
        </div>

        <div class="stage" id="npStage">
          <div class="cockpit">
            <!-- 前窗视图：天空 + 地平线 + 云层 + 跑道 -->
            <div class="windshield">
              <svg viewBox="0 0 960 180" preserveAspectRatio="none" width="100%" height="100%">
                <defs>
                  <linearGradient id="skyG2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#7cc1ee"/>
                    <stop offset="70%" stop-color="#bfe2f7"/>
                    <stop offset="100%" stop-color="#e9f5fc"/>
                  </linearGradient>
                </defs>
                <rect width="960" height="180" fill="url(#skyG2)"/>
                <!-- 云 -->
                <g fill="#ffffff" opacity=".92">
                  <ellipse cx="160" cy="46" rx="58" ry="13"/>
                  <ellipse cx="200" cy="40" rx="40" ry="11"/>
                  <ellipse cx="760" cy="34" rx="66" ry="14"/>
                  <ellipse cx="812" cy="42" rx="44" ry="11"/>
                  <ellipse cx="470" cy="28" rx="50" ry="10"/>
                </g>
                <!-- 远山 -->
                <path d="M0 92 L140 64 L260 88 L420 56 L560 86 L720 60 L960 94 L960 180 L0 180 Z" fill="#9fc2d6" opacity=".7"/>
                <!-- 地平线 + 跑道 -->
                <rect y="96" width="960" height="84" fill="#7fae6a"/>
                <polygon points="420,96 540,96 760,180 200,180" fill="#6b6f72"/>
                <g fill="#f2c14e">
                  <rect x="476" y="118" width="8" height="8"/>
                  <rect x="470" y="136" width="20" height="8"/>
                  <rect x="462" y="156" width="36" height="10"/>
                </g>
              </svg>
              <div class="windshield-frame"></div>
            </div>
            <div class="cockpit-head">
              <span>综合仪表显示 · <b>INTEGRATED INSTRUMENT PANEL</b></span>
              <span id="npPhase">等待开始</span>
            </div>
            <div class="cockpit-grid" id="npGrid">${tiles}</div>
            <div class="np-answer-bar">
              <button class="np-btn" data-side="low"><b>F</b>偏低</button>
              <button class="np-btn" data-side="high"><b>J</b>偏高</button>
            </div>
          </div>
          <div class="overlay" id="npOverlay" hidden></div>
          <div class="practice-chip" id="npChip" hidden>练习</div>
        </div>

        <div class="foot-hint" id="npFoot">
          只看<b>红框</b>仪表：指针在中线<b>上方</b>按 <kbd>J</kbd>（偏高），<b>下方</b>按 <kbd>F</kbd>（偏低）
        </div>
      </div>`;

    U.$('#npQuit').addEventListener('click', requestQuit);
    U.$$('.np-btn').forEach(b => {
      b.addEventListener('click', () => handleResponse(b.dataset.side));
    });
  }

  function showOverlay(html) {
    const ovl = U.$('#npOverlay');
    ovl.innerHTML = html;
    ovl.hidden = false;
  }
  function hideOverlay() {
    const ovl = U.$('#npOverlay');
    if (!ovl) return;
    ovl.hidden = true;
    ovl.innerHTML = '';
  }

  function setGridVisible(on) {
    const grid = U.$('#npGrid');
    if (grid) grid.style.visibility = on ? 'visible' : 'hidden';
    const phase = U.$('#npPhase');
    if (phase) phase.textContent = on ? (state.responseMode === 'prime' ? '启动显示' : '探测显示') : '—';
  }

  function renderDisplay(targetIdx, angles, highlight) {
    U.$$('#npGrid .gauge-tile').forEach((tile, i) => {
      let cls = 'gauge-tile';
      if (i === targetIdx) cls += ' target';
      else if (highlight) cls += ' hl';
      tile.className = cls;
      const body = tile.querySelector('.gauge-body');
      if (body) body.innerHTML = gaugeSVG(angles[i]);
    });
  }

  function updateHud() {
    const bar = U.$('#npBar'), count = U.$('#npCount'), cond = U.$('#npCond');
    if (!bar) return;
    const total = state.queue.length || 1;
    bar.style.width = Math.round((state.i / total) * 100) + '%';
    count.textContent = Math.min(state.i + 1, total) + ' / ' + total;
    cond.textContent = state.formal ? BLOCK_LABEL[state.blockOrder[state.blockIndex]].split('（')[0] : '练习';
    const chip = U.$('#npChip');
    if (chip) chip.hidden = state.formal;
  }

  /* ------------------------------------------------------------
     流程
     ------------------------------------------------------------ */
  function start(host, onFinish) {
    state.onFinish = onFinish;
    state.pid = AL.store.participant() || 'ANON';
    state.startedAt = new Date().toISOString();
    state.results = [];
    state.practiceResults = [];
    state.blockIndex = 0;
    state.formalCount = 0;
    state.formal = false;
    state.phase = 'idle';
    state.quitting = false;
    state.blockOrder = (U.hash(state.pid) % 2 === 0)
      ? ['baseline', 'highlight']
      : ['highlight', 'baseline'];

    renderShell(host);
    AL.Exp.keyHandler = onKey;
    AL.guard.on();
    showPracticeIntro();
  }

  function showPracticeIntro() {
    showOverlay(`
      <div class="block-intro">
        <h2>练习阶段</h2>
        <p>共 ${CFG.PRACTICE_TRIALS} 个试次，三种试次类型都会出现，<b>不计入正式数据</b>。</p>
        <p>每个试次包含两次判断：先看“启动显示”，再看“探测显示”。</p>
        <p>只判断<b style="color:#e05348">红框</b>仪表：指针在顶部中线右侧按 <kbd>J</kbd>（偏高），左侧按 <kbd>F</kbd>（偏低）。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="npGo">开始练习</button>
        </div>
      </div>`);
    U.$('#npGo').addEventListener('click', () => {
      hideOverlay();
      state.formal = false;
      state.queue = buildPractice();
      state.i = 0;
      AL.Exp.later(nextTrial, 200);
    });
  }

  function showBlockIntro() {
    const type = state.blockOrder[state.blockIndex];
    showOverlay(`
      <div class="block-intro">
        <div class="cond-chip">第 ${state.blockIndex + 1} / 2 段</div>
        <h2>${BLOCK_LABEL[type]}</h2>
        <p>本段共 <b>${CFG.TRIALS_PER_TYPE * 3}</b> 个试次（每种类型 ${CFG.TRIALS_PER_TYPE} 个），约 2 分钟。</p>
        <p>${type === 'baseline'
          ? '基线条件：只有目标仪表有红色边框，其余仪表不作任何标记。'
          : '弱高亮条件：非目标仪表会带一圈很淡的浅灰边框，以降低你主动抑制它们的程度。'}</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="npGo">开始本段</button>
        </div>
      </div>`);
    U.$('#npGo').addEventListener('click', () => {
      hideOverlay();
      state.formal = true;
      state.queue = buildBlock(type);
      state.i = 0;
      AL.Exp.later(nextTrial, 250);
    });
  }

  function showRest() {
    let left = CFG.REST_SECONDS;
    showOverlay(`
      <div class="center-card">
        <h2>休息一下</h2>
        <p>已完成一段。下一段会切换显示条件。</p>
        <div class="big-num" id="npLeft">${left}</div>
        <div class="hero-actions">
          <button class="btn btn-primary" id="npGo">继续下一段</button>
        </div>
      </div>`);
    U.$('#npGo').addEventListener('click', () => {
      hideOverlay();
      state.blockIndex++;
      showBlockIntro();
    });
    const tick = () => {
      left--;
      const el = U.$('#npLeft');
      if (!el) return;
      el.textContent = Math.max(0, left);
      if (left > 0) AL.Exp.later(tick, 1000);
    };
    AL.Exp.later(tick, 1000);
  }

  function nextTrial() {
    if (state.i >= state.queue.length) return endBlock();
    const trial = state.queue[state.i];
    state.trial = trial;
    state.practice = !!trial.practice;
    state.phase = 'fixation';
    state.primeRt = null;
    state.primeCorrect = null;
    state.responseMode = null;

    updateHud();
    setGridVisible(false);
    hideOverlay();

    AL.Exp.later(() => {
      presentPrime(trial);
    }, 500);
  }

  function presentPrime(trial) {
    trial.primeAngles = makeAngles(trial.primeIdx);
    trial.primeSide = trial.primeAngles[trial.primeIdx] > 0 ? 'high' : 'low';

    state.phase = 'prime';
    state.responseMode = 'prime';
    state.currentSide = trial.primeSide;
    state.onset = U.now();

    renderDisplay(trial.primeIdx, trial.primeAngles, trial.blockType === 'highlight');
    setGridVisible(true);

    state.respTimer = AL.Exp.later(() => {
      if (state.responseMode !== 'prime') return;
      state.primeRt = null;
      state.primeCorrect = false;
      goProbe(trial);
    }, CFG.TIMEOUT);
  }

  function goProbe(trial) {
    clearTimeout(state.respTimer);
    state.phase = 'soa';
    state.responseMode = null;
    setGridVisible(false);
    if (U.$('#npPhase')) U.$('#npPhase').textContent = '…';

    AL.Exp.later(() => {
      trial.probeAngles = makeAngles(trial.probeIdx);
      trial.probeSide = trial.probeAngles[trial.probeIdx] > 0 ? 'high' : 'low';

      state.phase = 'probe';
      state.responseMode = 'probe';
      state.currentSide = trial.probeSide;
      state.onset = U.now();

      renderDisplay(trial.probeIdx, trial.probeAngles, trial.blockType === 'highlight');
      setGridVisible(true);

      state.respTimer = AL.Exp.later(() => {
        if (state.responseMode !== 'probe') return;
        finishTrial(trial, null, false);
      }, CFG.TIMEOUT);
    }, CFG.SOA);
  }

  function handleResponse(side) {
    const mode = state.responseMode;
    if (!mode) return;
    const rt = U.now() - state.onset;
    const correct = side === state.currentSide;

    if (mode === 'prime') {
      state.primeRt = rt;
      state.primeCorrect = correct;
      goProbe(state.trial);
    } else {
      finishTrial(state.trial, rt, correct);
    }
  }

  function finishTrial(trial, probeRt, probeCorrect) {
    clearTimeout(state.respTimer);
    state.responseMode = null;
    setGridVisible(false);

    const rec = {
      participant_id: state.pid,
      trial_num: state.formal ? ++state.formalCount : -1,
      block_type: trial.blockType,
      trial_type: trial.type,
      prime_target: GAUGES[trial.primeIdx].name,
      prime_rt: state.primeRt,
      prime_correct: !!state.primeCorrect,
      probe_target: GAUGES[trial.probeIdx].name,
      probe_rt: probeRt,
      probe_correct: !!probeCorrect,
      prime_side: trial.primeSide,
      probe_side: trial.probeSide
    };

    if (state.formal) state.results.push(rec);
    else state.practiceResults.push(rec);

    state.phase = 'feedback';

    if (!state.formal) {
      showOverlay(`
        <div class="fb-card">
          <div class="fb-mark ${probeCorrect ? 'ok' : 'bad'}">${probeCorrect ? '✓' : '✗'}</div>
          <div class="fb-text">${probeCorrect ? '判断正确' : (probeRt === null ? '超时未反应' : '判断错误')}</div>
        </div>`);
      AL.Exp.later(() => {
        hideOverlay();
        state.i++;
        AL.Exp.later(nextTrial, 150);
      }, 800);
    } else {
      AL.Exp.later(() => {
        state.i++;
        AL.Exp.later(nextTrial, 120);
      }, 380);
    }
  }

  function endBlock() {
    if (!state.formal) return endPractice();
    if (state.blockIndex < 1) showRest();
    else finish();
  }

  function endPractice() {
    const n = state.practiceResults.length;
    const ok = state.practiceResults.filter(t => t.probe_correct).length;
    showOverlay(`
      <div class="center-card">
        <h2>练习结束</h2>
        <p>探测判断正确率：<b>${ok} / ${n}</b>。正式实验请保持“先看启动、再看探测”的节奏。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="npGo">进入正式实验</button>
        </div>
      </div>`);
    U.$('#npGo').addEventListener('click', () => {
      hideOverlay();
      state.blockIndex = 0;
      showBlockIntro();
    });
  }

  function finish() {
    AL.Exp.clearAll();
    AL.guard.off();
    const payload = {
      startedAt: state.startedAt,
      completedAt: new Date().toISOString(),
      meta: {
        blockOrder: state.blockOrder,
        trialsPerType: CFG.TRIALS_PER_TYPE,
        soa: CFG.SOA,
        design: '2 (display) x 3 (trial type) within-subject'
      },
      trials: state.results
    };
    if (state.onFinish) state.onFinish({ key: 'np', payload });
  }

  /* ------------------------------------------------------------
     输入
     ------------------------------------------------------------ */
  function onKey(e) {
    if (!U.$('#modal').hidden) return;

    if (e.key === 'Escape') { e.preventDefault(); requestQuit(); return; }

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      handleResponse('low');
      return;
    }
    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      handleResponse('high');
      return;
    }

    const ovl = U.$('#npOverlay');
    if (ovl && !ovl.hidden && e.key === 'Enter') {
      const go = ovl.querySelector('.btn-primary');
      if (go) { e.preventDefault(); go.click(); }
    }
  }

  async function requestQuit() {
    if (state.quitting) return;
    state.quitting = true;
    const resumable = state.phase !== 'idle' && state.phase !== 'feedback';
    AL.Exp.clearTimers();
    clearTimeout(state.respTimer);
    state.responseMode = null;

    const ok = await AL.ui.confirm(
      '退出实验？',
      '当前实验尚未完成，退出后本次数据不会保存。',
      '退出'
    );
    state.quitting = false;

    if (ok) {
      AL.Exp.clearAll();
      setGridVisible(false);
      hideOverlay();
      AL.guard.off();
      if (AL.app) AL.app.goHome();
    } else if (resumable) {
      hideOverlay();
      AL.Exp.later(nextTrial, 200);
    }
  }

  /* ------------------------------------------------------------
     注册
     ------------------------------------------------------------ */
  AL.experiments = AL.experiments || {};
  AL.experiments.np = {
    key: 'np',
    no: '02',
    name: '座舱负启动',
    en: 'Negative Priming in Cockpit Displays',
    week: 'W6 搜索与并行加工',
    minutes: '5–6 分钟',
    tags: ['2 × 3 被试内', '弱高亮改进', `${AL.config.NP.TRIALS_PER_TYPE * 6} 正式试次`],
    desc: '在六个仪表的座舱界面中，你只对红框目标做“偏高/偏低”判断。上一轮被忽略的干扰仪表，如果在下一轮变成目标，你的反应会变慢——这就是负启动。改进条件给干扰仪表加上极淡的浅灰边框，检验削弱抑制能否减小负启动量。',
    prediction: '负启动条件的探测反应时应长于控制条件（出现负启动）；弱高亮条件下，负启动量应小于基线条件。',
    source: 'Tipper (1985) 负启动效应；Eriksen & Eriksen (1974) 干扰效应',
    brief() {
      return `
        <div class="panel">
          <div class="step-tag">Step 3 / 3 · 实验说明</div>
          <h2>实验2 · 座舱负启动</h2>
          <p class="panel-lead">
            你会看到上下两排共 <b>6 个圆形仪表</b>（高度、速度、航向、燃油、液压、温度）。
            每一屏只有 <b style="color:#e05348">1 个红框仪表</b>是目标，其余都是需要忽略的干扰项。
          </p>
          <div class="metric-row">
            <div class="metric"><div class="metric-label">自变量 1</div><div class="metric-value" style="font-size:16px">基线 / 弱高亮</div><div class="metric-note">block 间平衡顺序</div></div>
            <div class="metric"><div class="metric-label">自变量 2</div><div class="metric-value" style="font-size:16px">控制 / 正 / 负启动</div><div class="metric-note">block 内随机</div></div>
            <div class="metric"><div class="metric-label">核心因变量</div><div class="metric-value" style="font-size:16px">探测反应时</div><div class="metric-note">负启动量 = 负启动 − 控制</div></div>
          </div>
          <ul class="consent-list" style="margin-top:18px">
            <li><b>流程</b>：练习 ${CFG.PRACTICE_TRIALS} 试次 → 正式 2 段 × ${CFG.TRIALS_PER_TYPE * 3} 试次（段间休息 ${CFG.REST_SECONDS} 秒）。</li>
            <li><b>单试次</b>：启动显示（红框判断）→ 空白 ${CFG.SOA}ms → 探测显示（红框判断）。</li>
            <li><b>操作</b>：指针在顶部中线<b>右侧</b>按 <kbd>J</kbd>（偏高），<b>左侧</b>按 <kbd>F</kbd>（偏低）；也可点屏幕按钮。</li>
            <li><b>预测</b>：负启动条件的探测反应时最长；弱高亮条件下负启动量应减小。</li>
          </ul>
          <div class="panel-actions">
            <button class="btn btn-ghost" id="briefBack">返回首页</button>
            <button class="btn btn-primary" id="briefStart">开始实验</button>
          </div>
        </div>`;
    },
    start
  };
})();
