/* ============================================================
   exp-cm.js — 实验3：Cleveland–McGill 比例判断 + 刻度线改进
   ------------------------------------------------------------
   设计：3（显示格式：饼图 / 条形图 / 面积图）× 2（有刻度 / 无刻度）被试内
         每一段固定一种格式，段内“有刻度 / 无刻度”随机交叉出现；
         真实比例刻意避开刻度值（非 5 的倍数、非 25/50/75），避免被试直接读刻度猜答案。
   因变量：估计绝对误差（百分点）、方向偏差、反应时
   出处：Cleveland & McGill (1984) 图形知觉；Hollands & Dyre (2000) 比例判断偏差
   ============================================================ */

(function () {
  const AL = window.AL;
  const U = AL.util;
  const CFG = AL.config.CM;

  const FORMATS = ['pie', 'bar', 'area'];
  const FORMAT_LABEL = {
    pie: '饼图',
    bar: '条形图',
    area: '面积图（嵌套正方形）'
  };
  const FORMAT_DESC = {
    pie: '饼图用扇形的角度/面积表示比例。有刻度时，外圈标出 25/50/75 主刻度（每 5% 一条小刻度）。',
    bar: '条形图用共同基线上的长度表示比例。有刻度时，上方标出 0–100% 的刻度。',
    area: '面积图用嵌套正方形的面积表示比例（内方面积 = 整体面积的百分比）。有刻度时，用虚线方框标出 25/50/75 面积的参照。'
  };

  // 6 种格式顺序（拉丁方），按被试编号哈希分配
  const ORDERS = [
    ['pie', 'bar', 'area'],
    ['pie', 'area', 'bar'],
    ['bar', 'pie', 'area'],
    ['bar', 'area', 'pie'],
    ['area', 'pie', 'bar'],
    ['area', 'bar', 'pie']
  ];

  const state = {
    onFinish: null,
    pid: '',
    startedAt: '',
    order: ORDERS[0],
    blockIndex: 0,
    queue: [],
    i: 0,
    formal: false,
    results: [],
    practiceResults: [],
    formalCount: 0,
    trial: null,
    onset: 0,
    estimate: 50,
    typed: '50',          // 当前数字输入的字符串形式（支持全局键盘直接输入）
    typing: false,        // 用户是否已开始用键盘输入新数字（首字符替换而非追加）
    phase: 'idle',
    respTimer: null,
    quitting: false
  };

  /* ------------------------------------------------------------
     图形绘制
     ------------------------------------------------------------ */
  function polar(cx, cy, r, deg) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }

  function slicePath(cx, cy, r, from, to) {
    if (to - from >= 359.99) {
      return `M${cx} ${cy - r} A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`;
    }
    const s = polar(cx, cy, r, from);
    const e = polar(cx, cy, r, to);
    const large = to - from > 180 ? 1 : 0;
    return `M${cx} ${cy} L${s.x.toFixed(2)} ${s.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)} Z`;
  }

  function pieSVG(prop, withTicks) {
    const cx = 180, cy = 180, r = 140;
    const end = (prop / 100) * 360;
    let ticks = '';

    if (withTicks) {
      for (let k = 0; k < 20; k++) {
        const a = k * 18; // 每 5%
        const isMajor = Math.abs(a - 90) < 0.1 || Math.abs(a - 180) < 0.1 || Math.abs(a - 270) < 0.1;
        const p1 = polar(cx, cy, isMajor ? 140 : 145, a);
        const p2 = polar(cx, cy, isMajor ? 158 : 152, a);
        ticks += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"
          stroke="${isMajor ? '#2f6f9e' : '#9db4c6'}" stroke-width="${isMajor ? 2.6 : 1.6}" stroke-linecap="round"/>`;
      }
      [[90, '25%'], [180, '50%'], [270, '75%']].forEach(([a, lb]) => {
        const p = polar(cx, cy, 172, a);
        ticks += `<text x="${p.x.toFixed(1)}" y="${(p.y + 5).toFixed(1)}" font-size="13"
          fill="#557089" text-anchor="middle" font-family="Consolas, monospace">${lb}</text>`;
      });
    }

    return `<svg viewBox="0 0 360 360" width="330" height="330">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#eef3f8" stroke="#d2dfeb" stroke-width="2"/>
      <path d="${slicePath(cx, cy, r, 0, end)}" fill="#ff8a3d" opacity=".95"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#c9d8e6" stroke-width="2"/>
      ${ticks}
    </svg>`;
  }

  function barSVG(prop, withTicks) {
    const x0 = 60, y0 = 120, w = 500, h = 76;
    const fillW = (w * prop) / 100;
    let ticks = '';

    if (withTicks) {
      for (let k = 0; k <= 20; k++) {
        const x = x0 + (w * k) / 20;      // 每 5%
        const pct = k * 5;
        const major = pct % 25 === 0;
        ticks += `<line x1="${x}" y1="${y0 - 10}" x2="${x}" y2="${y0 - (major ? 22 : 16)}"
          stroke="${major ? '#557089' : '#9db4c6'}" stroke-width="${major ? 2 : 1.4}"/>`;
        if (pct % 25 === 0) {
          ticks += `<text x="${x}" y="${y0 - 30}" font-size="12" fill="#557089"
            text-anchor="middle" font-family="Consolas, monospace">${pct}</text>`;
        }
      }
    }

    return `<svg viewBox="0 0 620 300" width="600" height="290">
      <rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="5"
        fill="#eef3f8" stroke="#d2dfeb" stroke-width="2"/>
      <rect x="${x0}" y="${y0}" width="${fillW.toFixed(1)}" height="${h}" rx="4" fill="#ff8a3d" opacity=".95"/>
      <line x1="${x0}" y1="${y0 + h + 14}" x2="${x0 + w}" y2="${y0 + h + 14}"
        stroke="#c9d8e6" stroke-width="2"/>
      ${ticks}
      <text x="${x0}" y="${y0 + h + 40}" font-size="12" fill="#557089">0%</text>
      <text x="${x0 + w}" y="${y0 + h + 40}" font-size="12" fill="#557089" text-anchor="end">100%</text>
    </svg>`;
  }

  // 面积图：内方「面积」= 整体的 prop%
  function areaSVG(prop, withTicks) {
    const cx = 180, cy = 180, S = 250;
    const x0 = cx - S / 2, y0 = cy - S / 2;
    const side = S * Math.sqrt(prop / 100);
    let ticks = '';

    if (withTicks) {
      [25, 50, 75].forEach(p => {
        const s = S * Math.sqrt(p / 100);
        const ox = cx - s / 2, oy = cy - s / 2;
        ticks += `<rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}"
          fill="none" stroke="#7f99ad" stroke-width="1.4" stroke-dasharray="5 4"/>`;
        ticks += `<text x="${(ox + s).toFixed(1)}" y="${(oy - 4).toFixed(1)}" font-size="12"
          fill="#557089" text-anchor="end" font-family="Consolas, monospace">${p}%</text>`;
      });
    }

    return `<svg viewBox="0 0 360 360" width="330" height="330">
      <rect x="${x0}" y="${y0}" width="${S}" height="${S}" rx="6" fill="#eef3f8" stroke="#d2dfeb" stroke-width="2"/>
      <rect x="${(cx - side / 2).toFixed(1)}" y="${(cy - side / 2).toFixed(1)}"
        width="${side.toFixed(1)}" height="${side.toFixed(1)}" rx="4" fill="#ff8a3d" opacity=".95"/>
      ${ticks}
    </svg>`;
  }

  /* ------------------------------------------------------------
     试次生成
     ------------------------------------------------------------ */
  function buildBlock(format) {
    // 从比例池随机抽取，且刻意不落在刻度上（池中的值均已避开 25/50/75 与 5 的倍数）
    const pool = U.shuffle(CFG.POOL.slice()).slice(0, CFG.PROPS_PER_BLOCK);
    const trials = [];
    pool.forEach(prop => {
      // 同一比例分别在有/无刻度下各出现一次，段内随机交叉
      trials.push({ format, prop, ticks: true });
      trials.push({ format, prop, ticks: false });
    });
    return U.shuffle(trials);
  }

  function buildPractice() {
    // 3 种格式 × 有/无刻度，各 1 次，用非刻度值
    const combos = [
      ['pie', true, 28], ['pie', false, 67],
      ['bar', true, 43], ['bar', false, 72],
      ['area', true, 34], ['area', false, 58]
    ];
    return combos.map(([format, ticks, prop]) => ({ format, prop, ticks, practice: true }));
  }

  /* ------------------------------------------------------------
     渲染
     ------------------------------------------------------------ */
  function renderShell(host) {
    host.innerHTML = `
      <div class="exp-shell">
        <div class="hud">
          <div class="hud-left">
            <span class="hud-tag">EXP 3</span>
            <span class="hud-title">比例判断</span>
          </div>
          <div class="hud-center">
            <div class="progress"><div class="progress-bar" id="cmBar"></div></div>
            <span class="hud-count" id="cmCount">0 / 0</span>
          </div>
          <div class="hud-right">
            <span class="hud-cond" id="cmCond">练习</span>
            <button class="btn btn-ghost btn-tiny" id="cmQuit">退出 Esc</button>
          </div>
        </div>

        <div class="stage" id="cmStage">
          <div class="cm-stage">
            <div class="cm-prompt">高亮部分占整体的 <b>百分之多少</b>？</div>
            <div class="cm-chart" id="cmChart"></div>
            <div class="cm-answer">
              <input type="range" class="cm-slider" id="cmSlider" min="0" max="100" step="1" value="50" />
              <input type="text" class="cm-num" id="cmNum" inputmode="numeric" pattern="[0-9]*"
                     value="50" aria-label="直接输入百分比" maxlength="3" />
              <span class="cm-unit">%</span>
              <button class="btn btn-primary cm-confirm" id="cmConfirm">确认</button>
            </div>
          </div>
          <div class="overlay" id="cmOverlay" hidden></div>
          <div class="practice-chip" id="cmChip" hidden>练习</div>
        </div>

        <div class="foot-hint" id="cmFoot">
          拖动滑块、按 <kbd>←</kbd> <kbd>→</kbd>，或直接在输入框里填数字；按 <kbd>Enter</kbd> 确认
        </div>
      </div>`;

    const slider = U.$('#cmSlider');
    const num = U.$('#cmNum');
    slider.addEventListener('input', () => {
      state.typed = String(Number(slider.value) || 0);
      state.typing = false;   // 拖动滑块后，下一次键盘输入应从新数字开始
      updateSliderFill(Number(slider.value));
    });
    num.addEventListener('input', () => {
      // 只保留数字字符
      const digits = num.value.replace(/[^0-9]/g, '');
      if (digits !== num.value) num.value = digits;
      if (digits === '') { state.typed = '0'; updateSliderFill(0); return; }
      const v = U.clamp(Number(digits), 0, 100);
      // 超过 100 时回写到输入框，保持与滑块一致
      if (String(v) !== digits) num.value = String(v);
      state.typed = String(v);
      state.typing = true;    // 直接在输入框里敲字也算“开始输入”
      slider.value = v;
      slider.style.setProperty('--fill', v + '%');
    });
    // 输入框聚焦时，也允许退格键正常删除（text 输入框原生支持）
    num.addEventListener('keydown', e => {
      // 阻止非数字键（但允许退格、方向键、删除、回车、Tab）
      if (/^[0-9]$/.test(e.key)) return;
      if (['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key)) return;
      e.preventDefault();
    });
    num.addEventListener('blur', () => {
      state.typing = false;   // 输入框失焦后，下一次键盘输入应从新数字开始
      updateSliderFill(Number(slider.value));
    });
    U.$('#cmConfirm').addEventListener('click', confirmEstimate);
    U.$('#cmQuit').addEventListener('click', requestQuit);
    state.typed = '50';
    updateSliderFill(50);
  }

  function updateSliderFill(v) {
    const slider = U.$('#cmSlider');
    if (!slider) return;
    const val = U.clamp(Math.round(Number(v) || 0), 0, 100);
    slider.value = val;
    slider.style.setProperty('--fill', val + '%');
    const num = U.$('#cmNum');
    if (num && num.value !== String(val)) num.value = val;
  }

  function showOverlay(html) {
    const ovl = U.$('#cmOverlay');
    ovl.innerHTML = html;
    ovl.hidden = false;
  }
  function hideOverlay() {
    const ovl = U.$('#cmOverlay');
    if (!ovl) return;
    ovl.hidden = true;
    ovl.innerHTML = '';
  }

  function updateHud() {
    const bar = U.$('#cmBar'), count = U.$('#cmCount'), cond = U.$('#cmCond');
    if (!bar) return;
    const total = state.queue.length || 1;
    bar.style.width = Math.round((state.i / total) * 100) + '%';
    count.textContent = Math.min(state.i + 1, total) + ' / ' + total;
    cond.textContent = state.formal ? FORMAT_LABEL[state.order[state.blockIndex]] : '练习';
    const chip = U.$('#cmChip');
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
    state.order = ORDERS[U.hash(state.pid) % ORDERS.length];

    renderShell(host);
    AL.Exp.keyHandler = onKey;
    AL.guard.on();
    showPracticeIntro();
  }

  function showPracticeIntro() {
    showOverlay(`
      <div class="block-intro">
        <h2>练习阶段</h2>
        <p>共 ${CFG.PRACTICE_TRIALS} 个试次，覆盖 <b>饼图 / 条形图 / 面积图</b> 三种格式，以及<b>有刻度 / 无刻度</b>各一次，<b>不计入正式数据</b>。</p>
        <p>每次会显示一个图形，请估计<b>高亮部分占整体的百分比</b>，拖动滑块或直接输入数字后确认。</p>
        <p>注意：有刻度时，真实比例也<b>不一定</b>落在刻度上，请按实际比例判断。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="cmGo">开始练习</button>
        </div>
      </div>`);
    U.$('#cmGo').addEventListener('click', () => {
      hideOverlay();
      state.formal = false;
      state.queue = buildPractice();
      state.i = 0;
      AL.Exp.later(nextTrial, 200);
    });
  }

  function showBlockIntro() {
    const fmt = state.order[state.blockIndex];
    showOverlay(`
      <div class="block-intro">
        <div class="cond-chip">第 ${state.blockIndex + 1} / 3 段</div>
        <h2>${FORMAT_LABEL[fmt]}</h2>
        <p>本段共 <b>${CFG.PROPS_PER_BLOCK * 2}</b> 个试次，约 1 分钟。</p>
        <p>${FORMAT_DESC[fmt]}</p>
        <p><b>有刻度 / 无刻度会随机交叉出现</b>；而且有刻度时，真实比例也不一定落在刻度上，请按图形实际比例估计，不要直接读刻度。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="cmGo">开始本段</button>
        </div>
      </div>`);
    U.$('#cmGo').addEventListener('click', () => {
      hideOverlay();
      state.formal = true;
      state.queue = buildBlock(fmt);
      state.i = 0;
      AL.Exp.later(nextTrial, 250);
    });
  }

  function nextTrial() {
    if (state.i >= state.queue.length) return endBlock();
    const trial = state.queue[state.i];
    state.trial = trial;
    state.phase = 'fixation';
    hideOverlay();

    updateHud();
    U.$('#cmChart').innerHTML = '<div style="font-size:40px;color:#4a6272;font-family:monospace">+</div>';
    U.$('#cmConfirm').disabled = true;
    U.$('#cmSlider').value = 50;
    updateSliderFill(50);

    AL.Exp.later(() => presentStimulus(trial), 500);
  }

  function presentStimulus(trial) {
    const chart = U.$('#cmChart');
    const fmt = trial.format;
    chart.innerHTML =
      fmt === 'bar' ? barSVG(trial.prop, !!trial.ticks)
        : fmt === 'area' ? areaSVG(trial.prop, !!trial.ticks)
          : pieSVG(trial.prop, !!trial.ticks);

    state.phase = 'respond';
    state.onset = U.now();
    state.estimate = 50;
    state.typed = '50';
    state.typing = false;
    U.$('#cmConfirm').disabled = false;
    U.$('#cmSlider').value = 50;
    updateSliderFill(50);
    // 自动聚焦并全选输入框：用户直接敲键盘即可输入，首字符会替换默认值 50
    const num = U.$('#cmNum');
    if (num) { num.focus(); num.select(); }

    state.respTimer = AL.Exp.later(() => {
      if (state.phase !== 'respond') return;
      finishTrial(trial, null);
    }, CFG.TIMEOUT);
  }

  function confirmEstimate() {
    if (state.phase !== 'respond') return;
    clearTimeout(state.respTimer);
    const rt = U.now() - state.onset;
    finishTrial(trialRef(), rt);
  }

  function trialRef() { return state.trial; }

  function finishTrial(trial, rt) {
    if (!trial) return;
    const estimate = Number(U.$('#cmSlider').value);
    const err = estimate - trial.prop;

    const condKey = `${trial.format}_${trial.ticks ? 'ticks' : 'plain'}`;
    const rec = {
      participant_id: state.pid,
      trial_num: state.formal ? ++state.formalCount : -1,
      block_type: trial.format,
      trial_type: condKey,
      display_format: condKey,
      ticks: trial.ticks ? 1 : 0,
      tick_condition: trial.ticks ? 'ticks' : 'plain',
      true_proportion: trial.prop,
      estimate: estimate,
      abs_error: Math.abs(err),
      signed_error: err,
      rt: rt
    };

    if (state.formal) state.results.push(rec);
    else state.practiceResults.push(rec);

    state.phase = 'feedback';
    U.$('#cmConfirm').disabled = true;

    if (!state.formal) {
      showOverlay(`
        <div class="fb-card">
          <div class="fb-mark ${Math.abs(err) <= 5 ? 'ok' : 'bad'}">${Math.abs(err) <= 5 ? '✓' : '✗'}</div>
          <div class="fb-text">正确比例：<b>${trial.prop}%</b> · 你的估计：<b>${estimate}%</b> · 误差 ${err > 0 ? '+' : ''}${err}</div>
        </div>`);
      AL.Exp.later(() => {
        hideOverlay();
        state.i++;
        AL.Exp.later(nextTrial, 150);
      }, 1200);
    } else {
      AL.Exp.later(() => {
        state.i++;
        AL.Exp.later(nextTrial, 120);
      }, 420);
    }
  }

  function endBlock() {
    if (!state.formal) return endPractice();
    if (state.blockIndex < state.order.length - 1) {
      state.blockIndex++;
      showBlockIntro();
    } else {
      finish();
    }
  }

  function endPractice() {
    const n = state.practiceResults.length;
    const meanErr = U.mean(state.practiceResults.map(t => t.abs_error));
    showOverlay(`
      <div class="center-card">
        <h2>练习结束</h2>
        <p>平均绝对误差：<b>${Number.isFinite(meanErr) ? meanErr.toFixed(1) : '—'}</b> 个百分点。</p>
        <p>正式实验共 3 段，每段一种显示格式，段内“有刻度 / 无刻度”随机交叉出现。</p>
        <div class="hero-actions">
          <button class="btn btn-primary" id="cmGo">进入正式实验</button>
        </div>
      </div>`);
    U.$('#cmGo').addEventListener('click', () => {
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
        blockOrder: state.order,
        proportionPool: CFG.POOL,
        propsPerBlock: CFG.PROPS_PER_BLOCK,
        design: '3 (display format: pie/bar/area) x 2 (ticks/no-ticks) within-subject; proportions deliberately off-tick'
      },
      trials: state.results
    };
    if (state.onFinish) state.onFinish({ key: 'cm', payload });
  }

  /* ------------------------------------------------------------
     输入
     ------------------------------------------------------------ */
  function onKey(e) {
    if (!U.$('#modal').hidden) return;

    if (e.key === 'Escape') { e.preventDefault(); requestQuit(); return; }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.phase === 'respond') confirmEstimate();
      else {
        const ovl = U.$('#cmOverlay');
        const go = ovl && !ovl.hidden ? ovl.querySelector('.btn-primary') : null;
        if (go) go.click();
      }
      return;
    }

    // 直接输入数字（无需点击输入框）：首字符替换默认值，之后追加；限制 0–100
    if (state.phase === 'respond') {
      const num = U.$('#cmNum');
      const numFocused = document.activeElement === num;
      if (!numFocused && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const t = state.typing ? state.typed + e.key : e.key;
        state.typing = true;
        let n = Number(t);
        if (n > 100) n = 100;
        state.typed = String(n);
        updateSliderFill(n);
        return;
      }
      if (!numFocused && e.key === 'Backspace') {
        e.preventDefault();
        state.typed = state.typed.length > 1 ? state.typed.slice(0, -1) : '0';
        updateSliderFill(Number(state.typed));
        return;
      }
    }

    // 滑块/数字框获得焦点时方向键由浏览器处理；否则手动调整
    if (state.phase === 'respond' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const slider = U.$('#cmSlider');
      if (document.activeElement === slider || document.activeElement === U.$('#cmNum')) return;
      e.preventDefault();
      const delta = e.shiftKey ? 5 : 1;
      const v = U.clamp(Number(slider.value) + (e.key === 'ArrowRight' ? delta : -delta), 0, 100);
      state.typed = String(v);
      slider.value = v;
      updateSliderFill(v);
    }
  }

  async function requestQuit() {
    if (state.quitting) return;
    state.quitting = true;
    const resumable = state.phase === 'respond' || state.phase === 'fixation';
    AL.Exp.clearTimers();
    clearTimeout(state.respTimer);

    const ok = await AL.ui.confirm(
      '退出实验？',
      '当前实验尚未完成，退出后本次数据不会保存。',
      '退出'
    );
    state.quitting = false;

    if (ok) {
      AL.Exp.clearAll();
      U.$('#cmConfirm').disabled = true;
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
  AL.experiments.cm = {
    key: 'cm',
    no: '03',
    name: '比例判断',
    en: 'Proportion Judgment (Cleveland–McGill)',
    week: 'W7 显示设计',
    minutes: '4–5 分钟',
    tags: ['3 × 2 被试内', '刻度 × 格式交叉', `${CFG.PROPS_PER_BLOCK * 2 * 3} 正式试次`],
    desc: '同一比例用饼图、条形图或面积图呈现，判断误差会不同。经典结论：位置/长度判断优于角度/面积判断。改进条件为图形加上刻度，但“有/无刻度”随机交叉，且真实比例刻意避开刻度值，检验外部参照能否稳定降低判断误差。',
    prediction: '绝对误差：条形图 < 面积图 ≈ 饼图；同一格式下，有刻度应小于无刻度；无刻度条件的估计更向 50% 回归。',
    source: 'Cleveland & McGill (1984); Hollands & Dyre (2000)',
    brief() {
      return `
        <div class="panel">
          <div class="step-tag">Step 3 / 3 · 实验说明</div>
          <h2>实验3 · 比例判断</h2>
          <p class="panel-lead">
            每一屏呈现一个图形：<b>饼图</b>、<b>条形图</b>或<b>面积图</b>，其中一部分被高亮。
            你的任务是估计<b>高亮部分占整体的百分比</b>（0–100）。
          </p>
          <div class="metric-row">
            <div class="metric"><div class="metric-label">自变量</div><div class="metric-value" style="font-size:16px">3 格式 × 有/无刻度</div><div class="metric-note">段间拉丁方，段内随机交叉</div></div>
            <div class="metric"><div class="metric-label">真实比例</div><div class="metric-value" style="font-size:16px">随机 12%–89%</div><div class="metric-note">刻意避开刻度值</div></div>
            <div class="metric"><div class="metric-label">核心因变量</div><div class="metric-value" style="font-size:16px">绝对误差</div><div class="metric-note">|估计 − 真实|（百分点）</div></div>
          </div>
          <ul class="consent-list" style="margin-top:18px">
            <li><b>流程</b>：练习 ${CFG.PRACTICE_TRIALS} 试次 → 正式 3 段 × ${CFG.PROPS_PER_BLOCK * 2} 试次。</li>
            <li><b>操作</b>：拖动滑块，或按 <kbd>←</kbd> <kbd>→</kbd> 微调（<kbd>Shift</kbd> 加速），按 <kbd>Enter</kbd> 确认。</li>
            <li><b>预测</b>：条形图误差最小；同一格式下，有刻度误差小于无刻度。</li>
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
