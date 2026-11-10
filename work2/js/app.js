/* ============================================================
   app.js — 路由、知情同意、被试编号、首页、结束页、收数上传
   ============================================================ */

(function () {
  const AL = window.AL;
  const U = AL.util;

  const ORDER = ['ab', 'np', 'cm'];
  const UPLOAD_CONDITION = {
    ab: 'baseline+warning',
    np: 'baseline+highlight',
    cm: 'pie_plain+pie_ticks+bar_plain+bar_ticks+area_plain+area_ticks'
  };

  let pendingExp = null;
  let consentGiven = false;
  let sessionPid = null;
  let currentScreen = 'home';

  /* ------------------------------------------------------------
     路由
     ------------------------------------------------------------ */
  function show(name) {
    currentScreen = name;
    U.$$('.screen').forEach(s => {
      s.classList.toggle('active', s.dataset.screen === name);
    });
    document.body.classList.toggle('in-exp', name === 'run');
    const topbar = U.$('#topbar');
    if (topbar) topbar.style.display = name === 'run' ? 'none' : '';
    const btnHome = U.$('#btnHome');
    if (btnHome) btnHome.hidden = name === 'home';
    const viewport = U.$('#viewport');
    if (viewport) viewport.scrollTop = 0;
  }

  /* ------------------------------------------------------------
     首页
     ------------------------------------------------------------ */
  function renderHome() {
    const grid = U.$('#expGrid');
    if (!grid) return;

    grid.innerHTML = ORDER.map(key => {
      const e = AL.experiments[key];
      const rec = AL.store.getExp(key);
      const done = !!(rec && rec.trials && rec.trials.length);
      return `
        <article class="exp-card ${done ? 'done' : ''}">
          <div class="exp-card-top">
            <span class="exp-no">EXP ${e.no}</span>
            <span class="exp-week">${e.week}</span>
          </div>
          <div>
            <h3>${e.name}</h3>
            <div class="exp-en">${e.en}</div>
          </div>
          <p class="exp-desc">${e.desc}</p>
          <div class="exp-tags">${e.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
          <div class="exp-card-foot">
            <span class="exp-status ${done ? 'ok' : ''}">
              ${done ? `已完成 · ${rec.trials.length} 条试次` : `预计 ${e.minutes}`}
            </span>
            <button class="btn ${done ? 'btn-ghost' : 'btn-primary'} btn-sm" data-start="${key}">
              ${done ? '重新实验' : '开始实验'}
            </button>
          </div>
        </article>`;
    }).join('');

    U.$$('[data-start]').forEach(btn => {
      btn.addEventListener('click', () => openExperiment(btn.dataset.start));
    });

    const notice = U.$('#apiNotice');
    if (notice) {
      notice.hidden = AL.isProjectConfigured();
    }
  }

  function updateChip() {
    const pid = AL.store.participant();
    const chip = U.$('#pidChip');
    const val = U.$('#pidChipValue');
    const change = U.$('#btnChangePid');
    if (!chip || !val) return;
    if (pid) {
      val.textContent = pid;
      chip.hidden = false;
      if (change) change.hidden = false;
    } else {
      chip.hidden = true;
      if (change) change.hidden = true;
    }
  }

  // 清除当前编号，回到编号输入页，重新输入被试编号
  function changePid() {
    AL.store.data.current = null;
    AL.store.save();
    sessionPid = null;
    pendingExp = null;      // 清空待进入的实验，避免误跳到旧实验
    consentGiven = false;   // 更换编号后需重新确认知情同意
    updateChip();
    showIdentity();
  }

  /* ------------------------------------------------------------
     实验入口流程：同意 → 编号 → 说明 → 运行
     ------------------------------------------------------------ */
  function openExperiment(key) {
    if (!AL.experiments[key]) return;
    pendingExp = key;

    if (!consentGiven) {
      const check = U.$('#consentCheck');
      const next = U.$('#btnConsentNext');
      if (check) check.checked = false;
      if (next) next.disabled = true;
      show('consent');
      return;
    }
    if (!sessionPid) {
      showIdentity();
      return;
    }
    showBrief(key);
  }

  function showIdentity() {
    const input = U.$('#pidInput');
    const hint = U.$('#pidHint');
    input.value = AL.store.participant() || '';
    hint.textContent = '';
    hint.className = 'hint';
    show('identity');
    setTimeout(() => input.focus(), 60);
  }

  function submitIdentity() {
    const input = U.$('#pidInput');
    const hint = U.$('#pidHint');
    const pid = input.value.trim();

    if (!/^[A-Za-z0-9_-]{2,12}$/.test(pid)) {
      hint.textContent = '请使用 2–12 位字母、数字、下划线或短横线（如 P01）';
      hint.className = 'hint err';
      return;
    }
    hint.textContent = '';
    hint.className = 'hint ok';

    AL.store.setParticipant(pid);
    sessionPid = pid;
    updateChip();
    if (pendingExp && AL.experiments[pendingExp]) showBrief(pendingExp);
    else goHome();
  }

  function showBrief(key) {
    const mod = AL.experiments[key];
    const host = U.$('#briefHost');
    host.innerHTML = mod.brief();

    const start = U.$('#briefStart');
    const back = U.$('#briefBack');
    if (start) start.addEventListener('click', () => launch(key));
    if (back) back.addEventListener('click', goHome);

    show('brief');
  }

  function launch(key) {
    const mod = AL.experiments[key];
    show('run');
    const host = U.$('#runHost');
    host.innerHTML = '';
    // 等一帧，确保舞台尺寸已由 CSS 计算完成
    requestAnimationFrame(() => {
      mod.start(host, onFinish);
    });
  }

  /* ------------------------------------------------------------
     实验完成：保存 + 上传 + 结束页
     ------------------------------------------------------------ */
  function onFinish(result) {
    const key = result.key;
    const payload = result.payload;

    AL.store.saveExp(key, payload);
    showDone(key, payload);
  }

  function computeStats(key, trials) {
    if (key === 'ab') {
      const t1 = trials.filter(t => U.truthy(t.t1_correct)).length / (trials.length || 1);
      const t1ok = trials.filter(t => U.truthy(t.t1_correct));
      const t2cond = t1ok.filter(t => U.truthy(t.t2_correct)).length / (t1ok.length || 1);
      const rt = U.mean(trials.map(t => U.num(t.t1_rt)));
      return [
        { label: 'T1 正确率', value: U.pct(t1), cls: '' },
        { label: 'T2 条件正确率', value: U.pct(t2cond), cls: 'accent' },
        { label: 'T1 平均反应时', value: U.ms(rt), cls: '' }
      ];
    }
    if (key === 'np') {
      const acc = trials.filter(t => U.truthy(t.probe_correct)).length / (trials.length || 1);
      const rt = U.mean(trials.filter(t => U.truthy(t.probe_correct)).map(t => U.num(t.probe_rt)));
      const ctrl = U.mean(trials.filter(t => t.trial_type === 'control' && U.truthy(t.probe_correct)).map(t => U.num(t.probe_rt)));
      const neg = U.mean(trials.filter(t => t.trial_type === 'negative' && U.truthy(t.probe_correct)).map(t => U.num(t.probe_rt)));
      return [
        { label: '探测正确率', value: U.pct(acc), cls: '' },
        { label: '平均探测 RT', value: U.ms(rt), cls: '' },
        { label: '负启动量（全部段）', value: Number.isFinite(neg - ctrl) ? (neg - ctrl).toFixed(0) + ' ms' : '—', cls: 'accent' }
      ];
    }
    const abs = U.mean(trials.map(t => U.num(t.abs_error)));
    const rt = U.mean(trials.map(t => U.num(t.rt)));
    return [
      { label: '平均绝对误差', value: Number.isFinite(abs) ? abs.toFixed(1) + ' pp' : '—', cls: 'accent' },
      { label: '平均反应时', value: U.ms(rt), cls: '' },
      { label: '完成试次', value: String(trials.length), cls: '' }
    ];
  }

  function showDone(key, payload) {
    const mod = AL.experiments[key];
    const pid = AL.store.participant() || 'ANON';
    const stats = computeStats(key, payload.trials);
    const panel = U.$('#donePanel');

    panel.innerHTML = `
      <div class="done-icon">✓</div>
      <h2>实验完成</h2>
      <p>${mod.name} 已记录 ${payload.trials.length} 个正式试次（被试编号 ${pid}）。</p>
      <div class="done-stats">
        ${stats.map(s => `
          <div class="metric">
            <div class="metric-label">${s.label}</div>
            <div class="metric-value ${s.cls}">${s.value}</div>
          </div>`).join('')}
      </div>
      <div class="upload-state" id="uploadState">正在检查收数接口…</div>
      <div class="hero-actions">
        <button class="btn btn-primary" id="btnDoneResults">查看结果</button>
        <button class="btn btn-ghost" id="btnDoneHome">返回首页</button>
        <button class="btn btn-ghost" id="btnDoneCsv">导出 CSV</button>
      </div>`;

    U.$('#btnDoneResults').addEventListener('click', () => openResults(key));
    U.$('#btnDoneHome').addEventListener('click', goHome);
    U.$('#btnDoneCsv').addEventListener('click', () => AL.csv.exportParticipant(pid));

    show('done');
    renderHome();
    upload(key, pid, payload.trials);
  }

  function upload(key, pid, trials) {
    const el = U.$('#uploadState');
    if (!el) return;

    if (!AL.isProjectConfigured()) {
      el.className = 'upload-state err';
      el.textContent = '未配置项目码：数据已保存在本地，请用“导出 CSV”提交，或在 config.js 中填入 6 位项目码。';
      return;
    }

    el.textContent = '正在上传到课程收数接口…';
    AL.api.submit(AL.expLabel(key), pid, UPLOAD_CONDITION[key] || '', trials).then(res => {
      const node = U.$('#uploadState');
      if (!node) return;
      if (res.status === 'sent') {
        node.className = 'upload-state ok';
        node.textContent = `已上传到课程收数接口（实验 ${AL.expLabel(key)} · 被试 ${pid}）。`;
      } else {
        node.className = 'upload-state err';
        node.innerHTML = `上传失败：${res.detail || '未知错误'}。数据已保存在本地，可导出 CSV 后手动提交。
          <button class="btn btn-ghost btn-tiny" id="btnRetry" style="margin-left:8px">重试</button>`;
        const retry = U.$('#btnRetry');
        if (retry) retry.addEventListener('click', () => upload(key, pid, trials));
      }
    });
  }

  /* ------------------------------------------------------------
     导航
     ------------------------------------------------------------ */
  function goHome() {
    AL.Exp.clearAll();
    AL.guard.off();
    show('home');
    renderHome();
    updateChip();
  }

  function openResults(tab) {
    show('results');
    AL.results.updateSub();
    AL.results.setTab(tab || AL.results.tab);
  }

  function firstIncomplete() {
    for (const k of ORDER) {
      const rec = AL.store.getExp(k);
      if (!(rec && rec.trials && rec.trials.length)) return k;
    }
    return ORDER[0];
  }

  function exportLocal() {
    const pid = AL.store.participant();
    if (pid) {
      const ok = AL.csv.exportParticipant(pid);
      if (!ok) AL.ui.toast('还没有可导出的数据');
    } else {
      AL.csv.exportAllParticipants();
    }
  }

  /* ------------------------------------------------------------
     事件绑定
     ------------------------------------------------------------ */
  function bind() {
    U.$('#brandHome').addEventListener('click', goHome);
    U.$('#brandHome').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); }
    });

    U.$('#btnHome').addEventListener('click', goHome);
    const changePidBtn = U.$('#btnChangePid');
    if (changePidBtn) changePidBtn.addEventListener('click', changePid);
    U.$('#btnResults').addEventListener('click', () => openResults());
    U.$('#btnHomeResults').addEventListener('click', () => openResults());
    U.$('#btnStartFirst').addEventListener('click', () => openExperiment(firstIncomplete()));
    U.$('#btnHomeExport').addEventListener('click', exportLocal);
    U.$('#btnExportAll').addEventListener('click', exportLocal);

    // 知情同意
    const check = U.$('#consentCheck');
    const next = U.$('#btnConsentNext');
    check.addEventListener('change', () => { next.disabled = !check.checked; });
    U.$('#btnConsentBack').addEventListener('click', goHome);
    next.addEventListener('click', () => {
      if (!check.checked) return;
      consentGiven = true;
      if (!sessionPid) showIdentity();
      else showBrief(pendingExp);
    });

    // 被试编号
    U.$('#btnPidNext').addEventListener('click', submitIdentity);
    U.$('#btnPidBack').addEventListener('click', () => show('home'));
    U.$('#pidInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submitIdentity(); }
    });
  }

  /* ------------------------------------------------------------
     启动
     ------------------------------------------------------------ */
  AL.app = {
    goHome,
    openResults,
    show
  };

  function init() {
    AL.store.load();
    bind();
    AL.results.init();
    updateChip();
    renderHome();
    show('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
