/* ============================================================
   exp-ab.js — 实验1：驾驶场景注意瞬脱（Attentional Blink）
   ------------------------------------------------------------
   设计：2（预警：无/有，block 间平衡）× 4（Lag：100/300/500/700 ms）被试内
   因变量：T1 正确率、T1 反应时、T1 正确条件下的 T2 条件正确率
   出处：Raymond, Shapiro & Arnell (1992) 注意瞬脱；驾驶情境参照 Horrey et al. (2006) SEEV
   ============================================================ */

(function () {
  const AL = window.AL;
  const U = AL.util;
  const CFG = AL.config.AB;

  const T1_TYPES = ['紧急刹车', '路面落物', '电动车横穿', '前车变道'];
  const T2_COLORS = ['红', '蓝', '黑', '白'];
  const T2_HEX = { 红: '#e8443c', 蓝: '#3f7fe0', 黑: '#1a1e23', 白: '#f4f7f9' };
  const NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------
     事故图标（更拟真：带车窗、车轮、车灯/转向灯、投影）
     ------------------------------------------------------------ */
  const ACCIDENT_ART = {
    紧急刹车: `
      <ellipse cx="0" cy="22" rx="100" ry="20" fill="#000" opacity=".35"/>
      <!-- 车身 -->
      <rect x="-72" y="-46" width="144" height="74" rx="15" fill="#38464f" stroke="#e6eef3" stroke-width="3"/>
      <!-- 后窗 -->
      <rect x="-54" y="-34" width="108" height="28" rx="7" fill="#9ec5e0" opacity=".9"/>
      <rect x="-54" y="-34" width="108" height="9" rx="5" fill="#bbd8ec" opacity=".8"/>
      <!-- 刹车灯（高亮红光） -->
      <rect x="-68" y="2" width="26" height="12" rx="4" fill="#ff2a1f"/>
      <rect x="42" y="2" width="26" height="12" rx="4" fill="#ff2a1f"/>
      <circle cx="-55" cy="8" r="14" fill="#ff3b2f" opacity=".5"/>
      <circle cx="55" cy="8" r="14" fill="#ff3b2f" opacity=".5"/>
      <!-- 车牌 -->
      <rect x="-22" y="14" width="44" height="14" rx="2" fill="#1a2228"/>
      <text x="0" y="25" text-anchor="middle" font-size="9" fill="#f2b134" font-family="Consolas,monospace" letter-spacing="1">BRAKE</text>
      <!-- 车轮/保险杠 -->
      <rect x="-72" y="22" width="144" height="10" rx="4" fill="#1a2228"/>`,
    路面落物: `
      <ellipse cx="0" cy="34" rx="92" ry="14" fill="#000" opacity=".4"/>
      <!-- 木箱 -->
      <polygon points="-58,30 58,30 44,-28 -44,-28" fill="#c9853a" stroke="#6b3e12" stroke-width="3"/>
      <polygon points="-44,-28 44,-28 36,-52 -36,-52" fill="#e0a052" stroke="#6b3e12" stroke-width="2"/>
      <line x1="-58" y1="0" x2="58" y2="0" stroke="#6b3e12" stroke-width="2"/>
      <line x1="-44" y1="-28" x2="44" y2="-28" stroke="#6b3e12" stroke-width="2"/>
      <!-- 警示带 -->
      <rect x="-58" y="-6" width="116" height="10" fill="#1a1a1a"/>
      <rect x="-58" y="-6" width="14" height="10" fill="#f5b93f"/>
      <rect x="-30" y="-6" width="14" height="10" fill="#f5b93f"/>
      <rect x="-2" y="-6" width="14" height="10" fill="#f5b93f"/>
      <rect x="26" y="-6" width="14" height="10" fill="#f5b93f"/>
      <!-- 惊叹号 -->
      <circle cx="72" cy="-34" r="16" fill="#ff2a1f"/>
      <rect x="69" y="-44" width="6" height="16" rx="2" fill="#fff"/>
      <circle cx="72" cy="-22" r="3.2" fill="#fff"/>`,
    电动车横穿: `
      <ellipse cx="0" cy="36" rx="96" ry="14" fill="#000" opacity=".35"/>
      <!-- 前后轮 -->
      <circle cx="-46" cy="22" r="19" fill="#1a1a1a" stroke="#c9d6df" stroke-width="3"/>
      <circle cx="-46" cy="22" r="7" fill="#c9d6df"/>
      <circle cx="42" cy="22" r="19" fill="#1a1a1a" stroke="#c9d6df" stroke-width="3"/>
      <circle cx="42" cy="22" r="7" fill="#c9d6df"/>
      <!-- 车架 -->
      <path d="M-46 22 L-6 -14 L42 22" fill="none" stroke="#2c3a45" stroke-width="6" stroke-linejoin="round"/>
      <path d="M-6 -14 L-28 22" fill="none" stroke="#2c3a45" stroke-width="6" stroke-linejoin="round"/>
      <!-- 骑手身体 -->
      <rect x="-16" y="-52" width="36" height="42" rx="10" fill="#3f7fe0" stroke="#dce9f5" stroke-width="2"/>
      <!-- 头盔 -->
      <ellipse cx="2" cy="-60" rx="15" ry="14" fill="#1a1a1a" stroke="#c9d6df" stroke-width="2"/>
      <rect x="-6" y="-60" width="16" height="6" rx="2" fill="#9ec5e0"/>
      <!-- 把手/车灯 -->
      <rect x="-30" y="-22" width="10" height="4" rx="2" fill="#1a1a1a"/>
      <circle cx="58" cy="-2" r="11" fill="#fff8d6"/>
      <ellipse cx="74" cy="-2" rx="30" ry="12" fill="#fff8d6" opacity=".3"/>`,
    前车变道: `
      <g transform="rotate(-13)">
        <ellipse cx="0" cy="26" rx="96" ry="14" fill="#000" opacity=".35"/>
        <rect x="-68" y="-42" width="136" height="72" rx="13" fill="#38464f" stroke="#e6eef3" stroke-width="3"/>
        <rect x="-50" y="-30" width="100" height="26" rx="6" fill="#9ec5e0" opacity=".9"/>
        <!-- 左转向灯（橙色闪烁） -->
        <rect x="-68" y="-6" width="14" height="22" rx="3" fill="#ff8a00"/>
        <rect x="54" y="-6" width="14" height="22" rx="3" fill="#ff2a1f"/>
        <rect x="-68" y="-6" width="14" height="22" rx="3" fill="#ff8a00" opacity=".7"/>
        <rect x="-68" y="22" width="136" height="10" rx="4" fill="#1a2228"/>
      </g>
      <!-- 变道箭头 -->
      <path d="M-110 -6 L-150 -6" stroke="#ff8a00" stroke-width="7" stroke-linecap="round"/>
      <path d="M-150 -6 L-136 -20 M-150 -6 L-136 8" stroke="#ff8a00" stroke-width="7" stroke-linecap="round" fill="none"/>`
  };

  /* ------------------------------------------------------------
     舞台与道路渲染
     ------------------------------------------------------------ */
  const scene = {
    svg: null,
    lanes: null,
    posts: null,
    edges: null,
    t1: null,
    t2: null,
    warnG: null,
    blankR: null,
    fix: null,
    raf: null,
    t0: 0,
    running: false,
    dashEls: [],
    postEls: [],

    geom(p) {
      return { y: 198 + 342 * p * p, w: 56 + 440 * p * p };
    },

    init(svg) {
      this.svg = svg;
      this.lanes = svg.querySelector('#lanes');
      this.posts = svg.querySelector('#posts');
      this.edges = svg.querySelector('#edges');
      this.t1 = svg.querySelector('#t1');
      this.t2 = svg.querySelector('#t2');
      this.warnG = svg.querySelector('#warnGroup');
      this.blankR = svg.querySelector('#blank');
      this.fix = svg.querySelector('#fixation');
      this.t1.setAttribute('transform', 'translate(480 340)');
      this.t2.setAttribute('transform', 'translate(480 392)');
      this.buildEdge();
      this.buildDashes();
      this.buildPosts();
    },

    buildEdge() {
      [-1, 1].forEach(side => {
        const near = [], far = [];
        for (let i = 0; i <= 26; i++) {
          const p = i / 26;
          const g = this.geom(p);
          const x = 480 + side * g.w;
          near.push([x - 3, g.y]);
          far.push([x + 3, g.y]);
        }
        const pts = near.concat(far.reverse()).map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');
        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', pts);
        poly.setAttribute('class', 'edge-line');
        this.edges.appendChild(poly);
      });
    },

    buildDashes() {
      const count = 14;
      for (let i = 0; i < count; i++) {
        const el = document.createElementNS(NS, 'polygon');
        el.setAttribute('class', 'lane-dash');
        this.lanes.appendChild(el);
        this.dashEls.push(el);
      }
    },

    buildPosts() {
      const count = 14;
      for (let i = 0; i < count; i++) {
        [-1, 1].forEach(side => {
          const post = document.createElementNS(NS, 'rect');
          post.setAttribute('class', 'post');
          this.posts.appendChild(post);
          const cap = document.createElementNS(NS, 'rect');
          cap.setAttribute('class', 'post-top');
          this.posts.appendChild(cap);
          this.postEls.push({ post, cap, i, side });
        });
      }
    },

    update(t) {
      const cycle = t * 0.42;
      const n = this.dashEls.length;
      for (let i = 0; i < n; i++) {
        const p1 = (cycle + i / n) % 1;
        const p2 = Math.min(1, p1 + 0.055);
        const a = this.geom(p1);
        const b = this.geom(p2);
        const w1 = 3 + 10 * p1 * p1;
        const w2 = 3 + 10 * p2 * p2;
        this.dashEls[i].setAttribute('points', [
          (480 - w1).toFixed(1) + ',' + a.y.toFixed(1),
          (480 + w1).toFixed(1) + ',' + a.y.toFixed(1),
          (480 + w2).toFixed(1) + ',' + b.y.toFixed(1),
          (480 - w2).toFixed(1) + ',' + b.y.toFixed(1)
        ].join(' '));
      }

      this.postEls.forEach(item => {
        const p = (cycle + item.i / 14 + 0.05) % 1;
        const g = this.geom(p);
        const x = 480 + item.side * (g.w * 1.06);
        const h = 6 + 58 * p * p;
        const w = 3 + 7 * p * p;
        item.post.setAttribute('x', (x - w / 2).toFixed(1));
        item.post.setAttribute('y', (g.y - h).toFixed(1));
        item.post.setAttribute('width', w.toFixed(1));
        item.post.setAttribute('height', h.toFixed(1));
        item.cap.setAttribute('x', (x - w / 2).toFixed(1));
        item.cap.setAttribute('y', (g.y - h).toFixed(1));
        item.cap.setAttribute('width', w.toFixed(1));
        item.cap.setAttribute('height', Math.max(1.5, w * 0.5).toFixed(1));
      });
    },

    loop: function (now) {
      if (!this.running) return;
      this.update((now - this.t0) / 1000);
      this.raf = requestAnimationFrame(this.loop.bind(this));
    },

    startRoad() {
      if (this.running) return;
      this.running = true;
      this.t0 = U.now();
      this.raf = requestAnimationFrame(this.loop.bind(this));
    },

    stopRoad() {
      this.running = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
    },

    reset() {
      this.t1.innerHTML = '';
      this.t2.innerHTML = '';
      this.showWarning(false);
      this.blank(false);
      this.fix.classList.remove('on');
      this.svg.classList.remove('steer');
      this.hideDistractor();
    },

    /* 转向动画：镜头向左侧偏移并轻微侧倾，模拟避让动作 */
    steer() {
      const el = this.svg;
      el.classList.remove('steer');
      void el.getBoundingClientRect(); // 强制重排，保证动画可以重新触发
      el.classList.add('steer');
      AL.Exp.later(() => el.classList.remove('steer'), 700);
    },

    blank(on) {
      this.blankR.setAttribute('opacity', on ? '1' : '0');
    },

    showFixation(on) {
      this.fix.classList.toggle('on', !!on);
    },

    showWarning(on) {
      this.warnG.classList.toggle('on', !!on);
      const stage = this.svg && this.svg.closest('.stage');
      if (stage) stage.classList.toggle('warn-active', !!on);
    },

    showAccident(type) {
      if (!type) { this.t1.innerHTML = ''; return; }
      this.t1.innerHTML = ACCIDENT_ART[type] || '';
    },

    showPedestrian(color) {
      if (!color) { this.t2.innerHTML = ''; return; }
      // T2 显示在中心（480, 340），和 T1 事故竞争同一空间注意资源
      this.t2.setAttribute('transform', `translate(480 340)`);
      // 行人缩小到 ~60%，让 33ms 极短呈现下更难看清
      const s = 0.6;
      const hx = v => (v * s).toFixed(1);  // 水平缩放
      const hy = v => (v * s).toFixed(1);  // 垂直缩放
      this.t2.innerHTML = `
        <ellipse cx="0" cy="${hy(62)}" rx="${hx(26)}" ry="${hy(6)}" fill="#000" opacity=".42"/>
        <g transform="scale(${s})">
          <!-- 腿 -->
          <rect x="-13" y="14" width="10" height="42" rx="4" fill="#26333c"/>
          <rect x="3" y="14" width="10" height="42" rx="4" fill="#26333c"/>
          <!-- 鞋 -->
          <ellipse cx="-8" cy="58" rx="9" ry="4" fill="#1a1a1a"/>
          <ellipse cx="8" cy="58" rx="9" ry="4" fill="#1a1a1a"/>
          <!-- 躯干（上衣）- 这是要判断颜色的部分 -->
          <path d="M-20 -22 Q-24 16 -13 18 L13 18 Q24 16 20 -22 Z" fill="${T2_HEX[color]}" stroke="#0a1116" stroke-width="2"/>
          <!-- 手臂 -->
          <rect x="-28" y="-18" width="8" height="34" rx="4" fill="${T2_HEX[color]}" stroke="#0a1116" stroke-width="1.5"/>
          <rect x="20" y="-18" width="8" height="34" rx="4" fill="${T2_HEX[color]}" stroke="#0a1116" stroke-width="1.5"/>
          <!-- 头 -->
          <circle cx="0" cy="-42" r="13" fill="#e8c39e" stroke="#0a1116" stroke-width="1.8"/>
        </g>`;
    },

    /* T1→T2 之间的闪光干扰项：和 T2 同位置（中心），消耗注意资源 */
    showDistractor() {
      // 中心闪现一个橙色三角警告路标，80ms 后消失
      const NS = 'http://www.w3.org/2000/svg';
      const tri = document.createElementNS(NS, 'g');
      tri.setAttribute('id', 'distractorG');
      tri.innerHTML = `
        <polygon points="-36,-36 36,-36 0,28" fill="#ff9d1a" stroke="#1a1100" stroke-width="3" opacity="0.95"/>
        <rect x="-3" y="-18" width="6" height="22" fill="#1a1100"/>
        <circle cx="0" cy="12" r="4" fill="#1a1100"/>`;
      tri.setAttribute('transform', 'translate(480 340)');
      tri.style.transformOrigin = 'center';
      // 快速淡入淡出动画
      tri.style.transition = 'opacity 40ms';
      this.svg.appendChild(tri);
      requestAnimationFrame(() => tri.style.opacity = '1');
      return tri;
    },

    hideDistractor() {
      const g = this.svg.querySelector('#distractorG');
      if (g) g.remove();
    }
  };

  /* ------------------------------------------------------------
     试次生成
     ------------------------------------------------------------ */
  // 练习只使用部分 Lag（不追求覆盖全部条件），让被试先熟悉流程
  const PRACTICE_LAGS = AL.config.AB.LAGS.slice(1, 3);  // 取中间两个 Lag（200, 400）

  function buildPractice() {
    const trials = [];
    for (let i = 0; i < CFG.PRACTICE_TRIALS; i++) {
      trials.push({
        lagMs: PRACTICE_LAGS[i % PRACTICE_LAGS.length],
        t2Present: i % 4 !== 3,
        t1Type: T1_TYPES[i % T1_TYPES.length],
        t2Color: T2_COLORS[i % T2_COLORS.length],
        blockType: i % 2 === 0 ? 'warning' : 'baseline',
        practice: true
      });
    }
    return U.shuffle(trials);
  }

  function buildBlock(blockType) {
    const trials = [];
    const nPerLag = CFG.TRIALS_PER_LAG;

    CFG.LAGS.forEach(lag => {
      for (let i = 0; i < nPerLag; i++) trials.push({ lagMs: lag, t2Present: true });
    });
    for (let i = 0; i < CFG.FILLER_TRIALS; i++) {
      trials.push({ lagMs: CFG.LAGS[i % CFG.LAGS.length], t2Present: false });
    }

    U.shuffle(trials);

    // T1 类型在整个 block 内尽量均等
    const t1pool = [];
    trials.forEach((_, i) => t1pool.push(T1_TYPES[i % T1_TYPES.length]));
    U.shuffle(t1pool);
    trials.forEach((t, i) => { t.t1Type = t1pool[i]; });

    // T2 颜色在含 T2 的试次中均等
    const withT2 = trials.filter(t => t.t2Present);
    const cpool = [];
    withT2.forEach((_, i) => cpool.push(T2_COLORS[i % T2_COLORS.length]));
    U.shuffle(cpool);
    withT2.forEach((t, i) => { t.t2Color = cpool[i]; });

    trials.forEach(t => { t.blockType = blockType; });
    return trials;
  }

  /* ------------------------------------------------------------
     运行时状态
     ------------------------------------------------------------ */
  const state = {
    host: null,
    onFinish: null,
    pid: '',
    startedAt: '',
    blockOrder: ['baseline', 'warning'],
    blockIndex: 0,
    queue: [],
    i: 0,
    formal: false,
    results: [],
    practiceResults: [],
    trial: null,
    t1Onset: 0,
    spaceTime: 0,
    t1Rt: null,
    t1Pressed: false,
    t2Shown: false,
    trialEnded: false,
    keyOpen: false,
    formalCount: 0,
    phase: 'idle',
    quitting: false
  };

  const LABEL = { baseline: '无预警（基线）', warning: '有预警（改进）' };

  /* ------------------------------------------------------------
     渲染外壳
     ------------------------------------------------------------ */
  function renderShell(host) {
    host.innerHTML = `
      <div class="exp-shell hud-glass">
        <div class="hud">
          <div class="hud-left">
            <span class="hud-tag">EXP 1</span>
            <span class="hud-title">驾驶注意瞬脱</span>
          </div>
          <div class="hud-center">
            <div class="progress"><div class="progress-bar" id="abBar"></div></div>
            <span class="hud-count" id="abCount">0 / 0</span>
          </div>
          <div class="hud-right">
            <span class="hud-cond" id="abCond">练习</span>
            <button class="btn btn-ghost btn-tiny" id="abQuit">退出 Esc</button>
          </div>
        </div>

        <div class="stage" id="abStage">
          <svg class="road-svg" id="roadSvg" viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#8fc6ee"/>
                <stop offset="52%" stop-color="#c8e4f8"/>
                <stop offset="100%" stop-color="#eef8ff"/>
              </linearGradient>
              <linearGradient id="roadG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#9aa6b0"/>
                <stop offset="100%" stop-color="#767f88"/>
              </linearGradient>
              <linearGradient id="hoodG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#eef4f9"/>
                <stop offset="100%" stop-color="#c3d1dd"/>
              </linearGradient>
              <radialGradient id="vig" cx="50%" cy="48%" r="72%">
                <stop offset="62%" stop-color="rgba(16,40,60,0)"/>
                <stop offset="100%" stop-color="rgba(16,40,60,0.20)"/>
              </radialGradient>
            </defs>

            <rect width="960" height="540" fill="url(#skyG)"/>
            <g id="city"></g>
            <rect x="0" y="190" width="960" height="10" fill="#9fc0d6" opacity=".55"/>
            <polygon points="440,198 520,198 1030,540 -70,540" fill="url(#roadG)"/>
            <g id="edges"></g>
            <g id="lanes"></g>
            <g id="posts"></g>
            <g id="t1"></g>
            <g id="t2"></g>

            <g id="fixation" class="fixation">
              <line class="fix-cross" x1="464" y1="270" x2="496" y2="270"/>
              <line class="fix-cross" x1="480" y1="254" x2="480" y2="286"/>
            </g>

            <g id="dashboard">
              <path d="M0 458 Q480 430 960 458 L960 540 L0 540 Z" fill="url(#hoodG)"/>
              <circle cx="112" cy="518" r="46" fill="#fdfefe" stroke="#c3d2de" stroke-width="2"/>
              <circle cx="112" cy="518" r="37" fill="none" stroke="#dbe6ef" stroke-width="1"/>
              <path d="M112 518 L112 486" stroke="#e8692f" stroke-width="3" stroke-linecap="round"/>
              <text x="112" y="536" text-anchor="middle" font-size="8" fill="#7d909e" letter-spacing="1">km/h</text>
              <rect x="796" y="484" width="128" height="26" rx="5" fill="#ffffff" stroke="#cfdde9"/>
              <text x="860" y="502" text-anchor="middle" font-size="11" fill="#5c7486" font-family="monospace">SYSTEM OK</text>
              <rect x="796" y="516" width="128" height="8" rx="4" fill="#dde8f1"/>
              <rect x="796" y="516" width="86" height="8" rx="4" fill="#2f8fd6" opacity=".75"/>
            </g>

            <g id="warnGroup" class="warn-frame">
              <!-- 全屏脉冲警示框 -->
              <rect x="5" y="5" width="950" height="530" rx="16" fill="none" stroke="#ffb020" stroke-width="7"/>
              <rect x="5" y="5" width="950" height="530" rx="16" fill="#ff9d1a" opacity=".07"/>
              <!-- 顶部警报条 -->
              <g>
                <rect x="288" y="26" width="384" height="56" rx="13" fill="#1b1105" fill-opacity=".74" stroke="#ffb020" stroke-width="2.5"/>
                <rect x="288" y="26" width="384" height="56" rx="13" fill="none" stroke="#ffd873" stroke-width="1" opacity=".7"/>
                <circle cx="322" cy="54" r="15" fill="#ffb020"/>
                <text x="322" y="60" text-anchor="middle" font-size="18" font-weight="700" fill="#3a1e00">!</text>
                <text x="492" y="61" text-anchor="middle" font-size="18" font-weight="700" fill="#ffd98a" letter-spacing="4">前方风险预警</text>
              </g>
              <!-- 四角括号 -->
              <path d="M28 52 L28 28 L52 28" fill="none" stroke="#ffd873" stroke-width="4" stroke-linecap="round"/>
              <path d="M932 52 L932 28 L908 28" fill="none" stroke="#ffd873" stroke-width="4" stroke-linecap="round"/>
              <path d="M28 488 L28 512 L52 512" fill="none" stroke="#ffd873" stroke-width="4" stroke-linecap="round"/>
              <path d="M932 488 L932 512 L908 512" fill="none" stroke="#ffd873" stroke-width="4" stroke-linecap="round"/>
            </g>

            <rect width="960" height="540" fill="url(#vig)" pointer-events="none"/>
            <rect id="blank" width="960" height="540" fill="#eef4fa" opacity="0"/>
          </svg>

          <div class="overlay" id="abOverlay" hidden></div>
          <div class="practice-chip" id="abPracticeChip" hidden>练习</div>
        </div>

        <div class="foot-hint" id="abFoot">
          看到突发情况立即按 <kbd>空格</kbd>（转向反应）；随后按 <kbd>1</kbd>–<kbd>5</kbd> 或点击作答
        </div>
      </div>`;

    // 城市剪影
    const city = U.$('#city');
    const hs = [22, 34, 18, 46, 28, 38, 20, 52, 30, 24, 44, 26, 36, 20, 48, 28, 32, 24];
    let x = -10;
    hs.forEach((h, i) => {
      const w = 34 + (i % 3) * 14;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', x);
      r.setAttribute('y', 190 - h);
      r.setAttribute('width', w - 5);
      r.setAttribute('height', h);
      r.setAttribute('fill', '#b7cfe2');
      r.setAttribute('opacity', '0.85');
      city.appendChild(r);
      x += w;
    });

    U.$('#abQuit').addEventListener('click', requestQuit);
  }

  function showOverlay(html) {
    const ovl = U.$('#abOverlay');
    ovl.innerHTML = html;
    ovl.hidden = false;
  }
  function hideOverlay() {
    const ovl = U.$('#abOverlay');
    if (!ovl) return;
    ovl.hidden = true;
    ovl.innerHTML = '';
  }

  function updateHud() {
    const bar = U.$('#abBar');
    const count = U.$('#abCount');
    const cond = U.$('#abCond');
    if (!bar) return;
    const total = state.queue.length || 1;
    bar.style.width = Math.round((state.i / total) * 100) + '%';
    count.textContent = Math.min(state.i + 1, total) + ' / ' + total;
    cond.textContent = state.formal ? LABEL[state.blockOrder[state.blockIndex]] : '练习';
    const chip = U.$('#abPracticeChip');
    if (chip) chip.hidden = state.formal;
  }

  /* ------------------------------------------------------------
     流程控制
     ------------------------------------------------------------ */
  function start(host, onFinish) {
    state.host = host;
    state.onFinish = onFinish;
    state.pid = AL.store.participant() || 'ANON';
    state.startedAt = new Date().toISOString();
    state.results = [];
    state.practiceResults = [];
    state.blockIndex = 0;
    state.formalCount = 0;
    state.formal = false;
    state.blockOrder = (U.hash(state.pid) % 2 === 0)
      ? ['baseline', 'warning']
      : ['warning', 'baseline'];

    renderShell(host);
    scene.init(U.$('#roadSvg'));
    scene.reset();

    AL.Exp.keyHandler = onKey;
    AL.guard.on();

    showPracticeIntro();
  }

  function showPracticeIntro() {
    showOverlay(`
      <div class="block-intro">
        <h2>练习阶段</h2>
        <p>共 ${CFG.PRACTICE_TRIALS} 个试次，只使用部分时间间隔（Lag），<b>不计入正式数据</b>。</p>
        <p>每个试次：注视点 → 行车画面 → 可能出现事故 → 可能出现行人 → 回答两个问题。</p>
        <p>事故会短暂出现（约 ${(CFG.T1_DURATION / 1000).toFixed(2)} 秒），<b>出现时机在每试次内随机</b>；看到后按 <kbd>空格</kbd> 转向，画面会向左避让。</p>
        <p>练习结束后进入正式实验：共 <b>20</b> 个试次，分 <b>2 轮</b>（每轮 10 个）。</p>
        <p>练习结束会显示正误。练习中会<b>交替出现有/无预警</b>的试次，帮你熟悉橙色 HUD 警报。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="abGo">开始练习</button>
        </div>
      </div>`);
    U.$('#abGo').addEventListener('click', () => {
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
        <h2>${LABEL[type]}</h2>
        <p>本段共 <b>${CFG.TRIALS_PER_LAG * CFG.LAGS.length + CFG.FILLER_TRIALS}</b> 个试次。</p>
        <p>${type === 'warning'
          ? `事故出现前 ${CFG.WARNING_LEAD}ms，整个画面会亮起醒目的橙色 HUD 警报（脉冲边框 + 顶部警示条）。请留意这一提示。`
          : '本段没有任何提前预警，事故会突然出现。'}</p>
        <p>看到事故立即按 <kbd>空格</kbd>；随后回答事故类型与行人衣服颜色。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="abGo">开始本段</button>
        </div>
      </div>`);
    U.$('#abGo').addEventListener('click', () => {
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
        <p>已完成一段，让眼睛放松 ${CFG.REST_SECONDS} 秒。下一段会切换预警条件。</p>
        <div class="big-num" id="abLeft">${left}</div>
        <div class="hero-actions">
          <button class="btn btn-primary" id="abGo">继续下一段</button>
        </div>
      </div>`);
    U.$('#abGo').addEventListener('click', () => {
      hideOverlay();
      state.blockIndex++;
      showBlockIntro();
    });

    const tick = () => {
      left--;
      const el = U.$('#abLeft');
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
    state.phase = 'trial';
    state.t1Pressed = false;
    state.t1Rt = null;
    state.t1Onset = 0;
    state.keyOpen = false;

    updateHud();
    scene.reset();
    scene.showFixation(true);

    AL.Exp.later(() => {
      scene.showFixation(false);
      scene.startRoad();

      // 事故出现时刻在区间内随机，避免被试预判节奏
      const preroll = U.rand(CFG.PREROLL_MIN, CFG.PREROLL_MAX);
      AL.Exp.later(() => {
        if (trial.blockType === 'warning') {
          scene.showWarning(true);
          AL.Exp.later(() => {
            scene.showWarning(false);
            presentT1(trial);
          }, CFG.WARNING_LEAD);
        } else {
          presentT1(trial);
        }
      }, preroll);
    }, 500);
  }

  function presentT1(trial) {
    state.t1Onset = U.now();
    state.spaceTime = 0;
    state.t1Pressed = false;
    state.t2Shown = false;
    state.trialEnded = false;
    state.keyOpen = true;
    scene.showAccident(trial.t1Type);

    // T1 消失后立刻插入干扰项（和 T2 同位置中心），消耗注意资源
    AL.Exp.later(() => {
      scene.showAccident(null);
      if (trial.t2Present) {
        scene.showDistractor();
        AL.Exp.later(() => scene.hideDistractor(), CFG.DISTRACTOR_DURATION);
      }
    }, CFG.T1_DURATION);

    // ★ 核心改动：Lag 从 T1 onset 算（经典注意瞬脱范式！）
    // 这样 Lag=200ms 就真的是 T1 onset→T2 onset 的 SOA=200ms，落在盲区最深处
    if (trial.t2Present) {
      AL.Exp.later(() => {
        if (state.trialEnded) return;
        if (!state.t1Pressed) {
          // Lag 到了还没按空格，T2 不出现，稍后进作答
          AL.Exp.later(() => endTrial(trial), 200);
          return;
        }
        // 正常：在瞬脱窗口内呈现 T2
        state.t2Shown = true;
        scene.showPedestrian(trial.t2Color);
        AL.Exp.later(() => scene.showPedestrian(null), CFG.T2_DURATION);
        AL.Exp.later(() => endTrial(trial), CFG.T2_DURATION + 500);
      }, trial.lagMs);   // ← Lag 从 T1 onset 算
    }

    // 最长等待：到 T1_MAX_WAIT 还没按空格，则不出现行人，直接进问题
    AL.Exp.later(() => {
      if (!state.trialEnded && !state.t1Pressed) endTrial(trial);
    }, CFG.T1_MAX_WAIT);
  }

  function endTrial(trial) {
    if (state.trialEnded) return;
    state.trialEnded = true;
    state.keyOpen = false;
    scene.stopRoad();
    scene.blank(true);
    askQ1(trial);
  }

  function askQ1(trial) {
    state.phase = 'q1';
    showOverlay(`
      <div class="qcard">
        <div class="q-label">问题 1 / 2</div>
        <div class="q-text">刚才出现的突发情况是？</div>
        <div class="q-options">
          ${T1_TYPES.map((t, i) =>
            `<button class="opt" data-i="${i}"><span class="opt-key">${i + 1}</span>${t}</button>`).join('')}
        </div>
      </div>`);
    U.$$('#abOverlay .opt').forEach(btn => {
      btn.addEventListener('click', () => {
        trial.q1 = T1_TYPES[Number(btn.dataset.i)];
        askQ2(trial);
      });
    });
  }

  function askQ2(trial) {
    state.phase = 'q2';
    const opts = T2_COLORS.concat(['未出现行人']);
    showOverlay(`
      <div class="qcard">
        <div class="q-label">问题 2 / 2</div>
        <div class="q-text">事故之后出现的行人，上衣是什么颜色？</div>
        <div class="q-options">
          ${opts.map((c, i) => {
            const dot = T2_HEX[c] ? `<i style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${T2_HEX[c]};border:1px solid #667;margin-right:7px;vertical-align:-1px"></i>` : '';
            return `<button class="opt" data-i="${i}"><span class="opt-key">${i + 1}</span>${dot}${c}</button>`;
          }).join('')}
        </div>
      </div>`);
    U.$$('#abOverlay .opt').forEach(btn => {
      btn.addEventListener('click', () => {
        trial.q2 = opts[Number(btn.dataset.i)];
        completeTrial(trial);
      });
    });
  }

  function completeTrial(trial) {
    hideOverlay();
    const t1Correct = trial.q1 === trial.t1Type;
    const t2Correct = trial.t2Present ? trial.q2 === trial.t2Color : trial.q2 === '未出现行人';

    const rec = {
      participant_id: state.pid,
      trial_num: state.formal ? ++state.formalCount : -1,
      block_type: trial.blockType,
      lag_ms: trial.lagMs,
      t1_type: trial.t1Type,
      t1_response: trial.q1,
      t1_correct: t1Correct,
      t1_rt: state.t1Pressed ? state.t1Rt : null,
      t2_present: !!trial.t2Present,
      t2_color: trial.t2Present ? trial.t2Color : '',
      t2_side: 'center',   // 新设计：T2 始终出现在中心，与 T1 竞争同一空间注意资源
      t2_response: trial.q2,
      t2_correct: t2Correct
    };

    if (state.formal) state.results.push(rec);
    else state.practiceResults.push(rec);

    if (!state.formal) {
      const right = t1Correct && t2Correct;
      showOverlay(`
        <div class="fb-card">
          <div class="fb-mark ${right ? 'ok' : 'bad'}">${right ? '✓' : '✗'}</div>
          <div class="fb-text">事故：<b>${trial.t1Type}</b> · 行人：<b>${trial.t2Present ? trial.t2Color : '未出现'}</b></div>
        </div>`);
      AL.Exp.later(() => {
        hideOverlay();
        state.i++;
        AL.Exp.later(nextTrial, 120);
      }, 1000);
    } else {
      state.phase = 'gap';
      AL.Exp.later(() => {
        state.i++;
        AL.Exp.later(nextTrial, 120);
      }, 320);
    }
  }

  function endBlock() {
    if (!state.formal) return endPractice();

    if (state.blockIndex < 1) {
      showRest();
    } else {
      finish();
    }
  }

  function endPractice() {
    const n = state.practiceResults.length;
    const both = state.practiceResults.filter(t => t.t1_correct && t.t2_correct).length;
    showOverlay(`
      <div class="center-card">
        <h2>练习结束</h2>
        <p>两题全对：<b>${both} / ${n}</b>。正式实验不显示正误反馈，请保持同样节奏。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="abGo">进入正式实验</button>
        </div>
      </div>`);
    U.$('#abGo').addEventListener('click', () => {
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
        trialsPerLag: CFG.TRIALS_PER_LAG,
        lags: CFG.LAGS,
        design: '2 (warning) x 4 (lag) within-subject'
      },
      trials: state.results
    };
    if (state.onFinish) state.onFinish({ key: 'ab', payload });
  }

  /* ------------------------------------------------------------
     输入处理
     ------------------------------------------------------------ */
  function onKey(e) {
    if (!U.$('#modal').hidden) return; // 确认框打开时不响应实验按键

    if (e.code === 'Space') {
      e.preventDefault();
      if (state.keyOpen && !state.t1Pressed) {
        state.t1Pressed = true;
        state.spaceTime = U.now();
        state.t1Rt = state.spaceTime - state.t1Onset;
        scene.steer();   // 播一次转向（避让）动画
        // 注意：不再在这里安排 T2 —— T2 由 T1 消失时启动的独立 Lag 计时器触发
        // 如果这是个无 T2 试次，延迟一会就进作答
        if (state.trial && !state.trial.t2Present) {
          AL.Exp.later(() => endTrial(state.trial), 350);
        }
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      requestQuit();
      return;
    }

    const ovl = U.$('#abOverlay');
    if (ovl && !ovl.hidden) {
      const opts = U.$$('.opt', ovl);
      const n = parseInt(e.key, 10);
      if (opts.length && n >= 1 && n <= opts.length) {
        e.preventDefault();
        opts[n - 1].click();
        return;
      }
      if (e.key === 'Enter') {
        const go = ovl.querySelector('.btn-primary');
        if (go) { e.preventDefault(); go.click(); }
      }
    }
  }

  async function requestQuit() {
    if (state.quitting) return;
    state.quitting = true;

    const resumable = state.phase === 'trial' || state.phase === 'q1' || state.phase === 'q2';
    AL.Exp.clearTimers();
    scene.stopRoad();

    const ok = await AL.ui.confirm(
      '退出实验？',
      resumable ? '当前试次尚未完成，退出后本次实验的数据不会保存。' : '确定返回首页吗？',
      '退出'
    );
    state.quitting = false;

    if (ok) {
      cleanup();
      if (AL.app) AL.app.goHome();
    } else if (resumable) {
      // 取消退出：重新呈现当前试次，避免留下半截刺激
      hideOverlay();
      scene.reset();
      AL.Exp.later(nextTrial, 200);
    }
  }


  function cleanup() {
    AL.Exp.clearAll();
    scene.stopRoad();
    AL.guard.off();
  }

  /* ------------------------------------------------------------
     注册实验
     ------------------------------------------------------------ */
  AL.experiments = AL.experiments || {};
  AL.experiments.ab = {
    key: 'ab',
    no: '01',
    name: '驾驶注意瞬脱',
    en: 'Attentional Blink in Driving',
    week: 'W5 选择性注意',
    minutes: '6–8 分钟',
    tags: ['2 × 4 被试内', '预警线索改进', `${(AL.config.AB.TRIALS_PER_LAG * AL.config.AB.LAGS.length + AL.config.AB.FILLER_TRIALS) * 2} 正式试次`],
    desc: '在流动的城市道路画面中，突发的第一目标（事故）会短暂“致盲”注意，使你更难辨认随后出现的行人。改进条件在事故前 400ms 亮起全屏橙色 HUD 警报，检验预警能否缩小这一注意瞬脱窗口。',
    prediction: '基线条件下 Lag 300ms 的 T2 正确率最低、Lag 700ms 回升；预警条件下瞬脱幅度（Lag 700 − Lag 300）应显著减小。',
    source: 'Raymond, Shapiro & Arnell (1992); 驾驶改编参照 Horrey et al. (2006)',
    brief() {
      return `
        <div class="panel">
          <div class="step-tag">Step 3 / 3 · 实验说明</div>
          <h2>实验1 · 驾驶注意瞬脱</h2>
          <p class="panel-lead">
            你将以第一人称视角观看一段城市道路行车画面。画面中会突然出现<b>事故</b>，
            紧接着在路边出现一名<b>行人</b>。你需要对两者分别做出判断。
          </p>
          <div class="metric-row">
            <div class="metric"><div class="metric-label">自变量 1</div><div class="metric-value" style="font-size:16px">预警 无 / 有</div><div class="metric-note">block 间平衡顺序</div></div>
            <div class="metric"><div class="metric-label">自变量 2</div><div class="metric-value" style="font-size:16px">Lag 100–700ms</div><div class="metric-note">4 水平，block 内随机</div></div>
            <div class="metric"><div class="metric-label">核心因变量</div><div class="metric-value" style="font-size:16px">T2 条件正确率</div><div class="metric-note">仅统计 T1 答对的试次</div></div>
          </div>
          <ul class="consent-list" style="margin-top:18px">
            <li><b>流程</b>：练习 ${CFG.PRACTICE_TRIALS} 试次 → 正式 2 段 × ${CFG.TRIALS_PER_LAG * CFG.LAGS.length + CFG.FILLER_TRIALS} 试次（段间休息 ${CFG.REST_SECONDS} 秒）。</li>
            <li><b>操作</b>：事故出现时立即按 <kbd>空格</kbd>；随后用 <kbd>1</kbd>–<kbd>5</kbd> 或鼠标回答“事故类型”和“行人上衣颜色”。</li>
            <li><b>注意</b>：行人可能不出现，此时问题 2 请选择“未出现行人”。</li>
            <li><b>预测</b>：基线条件下 Lag 300ms 的 T2 正确率最低、Lag 700ms 回升；加入预警后，瞬脱幅度应减小。</li>
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
