/* ============================================================
   results.js — 效应量计算、图表渲染、CSV 汇总导入
   ============================================================ */

(function () {
  const AL = window.AL;
  const U = AL.util;

  const p1 = x => (Number.isFinite(x) ? x.toFixed(1) : '—');
  const p0 = x => (Number.isFinite(x) ? x.toFixed(0) : '—');
  const diff = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a - b : NaN);

  /* ------------------------------------------------------------
     1. 分析函数（对本地 trial 与导入的 CSV 行都适用）
     ------------------------------------------------------------ */
  AL.analysis = {
    ab(trials) {
      const blocks = ['baseline', 'warning'];
      const lags = AL.config.AB.LAGS.slice();  // 从配置动态读取
      const out = {};

      blocks.forEach(b => {
        out[b] = lags.map(lag => {
          const cells = trials.filter(t =>
            String(t.block_type) === b &&
            Number(t.lag_ms) === lag &&
            U.truthy(t.t2_present)
          );
          const t1ok = cells.filter(t => U.truthy(t.t1_correct));
          const t2ok = t1ok.filter(t => U.truthy(t.t2_correct));
          return {
            lag,
            n: cells.length,
            nT1ok: t1ok.length,
            acc: t1ok.length ? t2ok.length / t1ok.length : NaN,
            t1acc: cells.length ? t1ok.length / cells.length : NaN,
            rt: U.mean(cells.map(t => U.num(t.t1_rt)))
          };
        });
      });

      return out;
    },

    np(trials) {
      const blocks = ['baseline', 'highlight'];
      const types = ['control', 'positive', 'negative'];
      const out = {};

      blocks.forEach(b => {
        out[b] = {};
        types.forEach(type => {
          const cells = trials.filter(t =>
            String(t.block_type) === b && String(t.trial_type) === type
          );
          // 标准做法：启动与探测都正确才纳入反应时
          const bothOk = cells.filter(t => U.truthy(t.prime_correct) && U.truthy(t.probe_correct));
          out[b][type] = {
            n: cells.length,
            nRt: bothOk.length,
            rt: U.mean(bothOk.map(t => U.num(t.probe_rt))),
            acc: cells.length ? cells.filter(t => U.truthy(t.probe_correct)).length / cells.length : NaN
          };
        });
      });

      return out;
    },

    cm(trials) {
      const conds = ['pie_plain', 'pie_ticks', 'bar_plain', 'bar_ticks', 'area_plain', 'area_ticks'];
      const out = {};
      conds.forEach(c => {
        const cells = trials.filter(t => String(t.display_format) === c);
        out[c] = {
          n: cells.length,
          abs: U.mean(cells.map(t => U.num(t.abs_error))),
          bias: U.mean(cells.map(t => U.num(t.signed_error))),
          rt: U.mean(cells.map(t => U.num(t.rt)))
        };
      });
      return out;
    }
  };

  /* ------------------------------------------------------------
     2. 结果页状态
     ------------------------------------------------------------ */
  AL.results = {
    tab: 'ab',
    group: null,   // {rows, n, label}

    init() {
      U.$$('#resultTabs .tab').forEach(btn => {
        btn.addEventListener('click', () => this.setTab(btn.dataset.tab));
      });

      U.$('#btnImport').addEventListener('click', () => U.$('#csvFile').click());

      // 一键从收数平台拉取全班数据（JSON 展平为试次行，替代手动下载 CSV）
      U.$('#btnFetchGroup').addEventListener('click', async () => {
        const btn = U.$('#btnFetchGroup');
        btn.disabled = true;
        AL.ui.toast('正在从收数平台拉取…');
        const res = await AL.api.fetchGroup();
        btn.disabled = false;
        if (res.status !== 'ok' || !res.rows.length) {
          AL.ui.toast(res.status === 'ok' ? '平台暂无数据' : `拉取失败：${res.detail}`);
          return;
        }
        const pids = new Set(res.rows.map(r => r.participant_id).filter(Boolean));
        this.group = { rows: res.rows, n: pids.size, label: '收数平台' };
        U.$('#btnClearImport').hidden = false;
        this.updateSub();
        this.render();
        AL.ui.toast(`已拉取 ${res.rows.length} 条试次 / ${pids.size} 名被试`);
      });
      U.$('#btnClearImport').addEventListener('click', () => {
        this.group = null;
        U.$('#btnClearImport').hidden = true;
        this.updateSub();
        this.render();
        AL.ui.toast('已恢复为本地被试数据');
      });

      U.$('#csvFile').addEventListener('change', e => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const rows = AL.csv.parse(String(reader.result));
            if (!rows.length || !rows[0].experiment) {
              AL.ui.toast('CSV 缺少 experiment 列，无法识别');
              return;
            }
            const pids = new Set(rows.map(r => r.participant_id).filter(Boolean));
            this.group = { rows, n: pids.size, label: file.name };
            U.$('#btnClearImport').hidden = false;
            this.updateSub();
            this.render();
            AL.ui.toast(`已导入 ${rows.length} 条试次 / ${pids.size} 名被试`);
          } catch (err) {
            console.error(err);
            AL.ui.toast('CSV 解析失败');
          }
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
      });
    },

    updateSub() {
      const sub = U.$('#resultSub');
      if (!sub) return;
      if (this.group) {
        sub.textContent = `汇总数据：${this.group.n} 名被试 · 来源 ${this.group.label}`;
      } else {
        const pid = AL.store.participant();
        sub.textContent = pid ? `当前被试：${pid}（本地数据）` : '当前没有本地被试数据';
      }
    },

    /** 汇总 CSV 里的 experiment 可能是新名称（驾驶注意瞬脱）或旧键（ab），两者都认 */
    isExp(row, key) {
      const v = String(row.experiment);
      return v === key || v === AL.expLabel(key);
    },

    dataFor(key) {
      if (this.group) {
        return this.group.rows.filter(r => this.isExp(r, key));
      }
      return this.localFor(key);
    },

    /** 始终取本地当前被试的数据（不受汇总导入影响） */
    localFor(key) {
      const pack = AL.store.getExp(key);
      return pack && pack.trials ? pack.trials : [];
    },

    /**
     * 对比数据：优先取本地当前被试；本地没有时，若当前编号在汇总里，
     * 则从汇总中拆出「我 vs 其他人」（留一法：汇总均值不含自己）
     */
    compareData(key) {
      let local = this.localFor(key);
      let groupRows = this.group ? this.group.rows.filter(r => this.isExp(r, key)) : [];
      let selfFromCsv = false;
      const norm = s => String(s == null ? '' : s).trim().toLowerCase();
      const pid = norm(AL.store.participant());
      if (groupRows.length && pid) {
        const mine = groupRows.filter(r => norm(r.participant_id) === pid);
        const others = groupRows.filter(r => norm(r.participant_id) !== pid);
        if (!local.length && mine.length) { local = mine; selfFromCsv = true; }
        if (others.length) groupRows = others;  // 有其他人才排除自己，否则保留全部
      }
      return { local, group: groupRows, selfFromCsv };
    },

    /** 有汇总数据但无法生成对比图时，说明原因 */
    cmpHint(body) {
      const pid = AL.store.participant() || '未设置';
      body.insertAdjacentHTML('beforeend', `
        <div class="result-block">
          <div class="interpret">暂未生成对比图：当前编号 <b>${pid}</b> 没有本实验的本地数据，且汇总数据中也找不到该编号与其他被试的组合。
          完成本实验，或把编号切换为汇总中已有的编号后即可对比。</div>
        </div>`);
    },

    setTab(tab) {
      this.tab = tab;
      U.$$('#resultTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      this.render();
    },

    render() {
      const body = U.$('#resultBody');
      if (!body) return;
      body.innerHTML = '';
      if (this.tab === 'ab') this.renderAB(body);
      else if (this.tab === 'np') this.renderNP(body);
      else this.renderCM(body);
      this.updateSub();
    },

    empty(body, title) {
      body.innerHTML = `
        <div class="result-block">
          <div class="empty-state">
            <b>还没有数据</b>
            ${title}<br />
            完成对应实验后，这里会自动计算效应量并绘制图表。
          </div>
        </div>`;
    },

    /* ---------------------------- 实验1 ---------------------------- */
    renderAB(body) {
      const trials = this.dataFor('ab');
      if (!trials.length) return this.empty(body, '实验1 · 驾驶注意瞬脱尚未完成。');

      const cfg = AL.config.AB;
      const lags = cfg.LAGS;
      // 经典注意瞬脱：中间的 Lag 是盲区最大点，最后一个是恢复点
      const idxMin = 1;   // 瞬脱最低点索引（Lag 200ms）
      const idxMax = lags.length - 1;  // 恢复点索引（最后一个 Lag）

      const a = AL.analysis.ab(trials);
      const accB = a.baseline.map(x => x.acc * 100);
      const accW = a.warning.map(x => x.acc * 100);
      const t1B = a.baseline.map(x => x.t1acc * 100);
      const t1W = a.warning.map(x => x.t1acc * 100);

      const blinkB = diff(accB[idxMax], accB[idxMin]);   // 恢复点 − 最低点
      const blinkW = diff(accW[idxMax], accW[idxMin]);
      const change = diff(blinkB, blinkW);

      const xLabels = lags.map(l => l + ' ms');

      body.innerHTML = `
        <div class="result-block">
          <h3>注意瞬脱曲线：T2 条件正确率</h3>
          <div class="rb-sub">只统计 T1（事故类型）答对的试次；每个 Lag 每条件 ${cfg.TRIALS_PER_LAG} 个试次；Lag 为 T1 消失后间隔</div>
          <div class="chart-wrap" id="abChart"></div>
          <div class="metric-row" style="margin-top:16px">
            <div class="metric">
              <div class="metric-label">基线 · Lag ${lags[idxMin]}ms</div>
              <div class="metric-value warn">${p1(accB[idxMin])}%</div>
              <div class="metric-note">瞬脱预期最低点</div>
            </div>
            <div class="metric">
              <div class="metric-label">基线 · Lag ${lags[idxMax]}ms</div>
              <div class="metric-value">${p1(accB[idxMax])}%</div>
              <div class="metric-note">预期恢复点</div>
            </div>
            <div class="metric">
              <div class="metric-label">基线瞬脱幅度</div>
              <div class="metric-value accent">${p1(blinkB)} pp</div>
              <div class="metric-note">Lag${lags[idxMax]} − Lag${lags[idxMin]}</div>
            </div>
            <div class="metric">
              <div class="metric-label">预警后瞬脱幅度</div>
              <div class="metric-value ok">${p1(blinkW)} pp</div>
              <div class="metric-note">改进条件</div>
            </div>
            <div class="metric">
              <div class="metric-label">幅度变化</div>
              <div class="metric-value ${Number.isFinite(change) && change > 0 ? 'ok' : 'warn'}">${p1(change)} pp</div>
              <div class="metric-note">正值 = 瞬脱减小</div>
            </div>
          </div>
        </div>

        <div class="result-block">
          <h3>分段数据表</h3>
          <div class="rb-sub">T1 正确率反映事故识别，T1 反应时为空格转向反应</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>Lag</th>
                <th>基线 n</th><th>基线 T2</th><th>基线 T1</th><th>基线 T1 RT</th>
                <th>预警 n</th><th>预警 T2</th><th>预警 T1</th><th>预警 T1 RT</th>
              </tr>
            </thead>
            <tbody>
              ${lags.map((_, i) => `
                <tr>
                  <td>${a.baseline[i].lag} ms</td>
                  <td>${a.baseline[i].nT1ok}</td>
                  <td>${p1(accB[i])}%</td>
                  <td>${p1(t1B[i])}%</td>
                  <td>${p0(a.baseline[i].rt)} ms</td>
                  <td>${a.warning[i].nT1ok}</td>
                  <td>${p1(accW[i])}%</td>
                  <td>${p1(t1W[i])}%</td>
                  <td>${p0(a.warning[i].rt)} ms</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="result-block">
          <h3>与经典研究对比</h3>
          <div class="interpret">
            ${this.interpretAB(accB, accW, blinkB, blinkW, change, lags)}
          </div>
          <div class="interpret" style="border-color:#4fb6c4">
            <b>方法说明</b>：T2 条件正确率 = 在 T1 答对的试次中 T2 答对的比例，这是注意瞬脱研究的通行算法，
            用于排除“根本没看清 T1”的试次。瞬脱幅度取 Lag ${lags[idxMax]}ms 与 Lag ${lags[idxMin]}ms 之差（百分点，pp）。
          </div>
        </div>`;

      AL.chart.line(U.$('#abChart'), {
        xLabels: xLabels,
        series: [
          { name: '无预警（基线）', color: '#e8692f', values: accB },
          { name: '有预警（改进）', color: '#2f8fd6', values: accW }
        ],
        yMin: 0,
        yMax: 100,
        yLabel: 'T2 条件正确率 (%)',
        xLabel: 'T1 消失后的时间间隔（Lag）',
        valueFmt: v => v.toFixed(0) + '%'
      });

      // 对比图：我的 vs 汇总
      const { local: abLocal, group: abGroup, selfFromCsv: abSelfCsv } = this.compareData('ab');
      if (abLocal.length && abGroup.length) {
        const aLoc = AL.analysis.ab(abLocal);
        const aGrp = AL.analysis.ab(abGroup);
        const accBL = aLoc.baseline.map(x => x.acc * 100);
        const accWL = aLoc.warning.map(x => x.acc * 100);
        const accBG = aGrp.baseline.map(x => x.acc * 100);
        const accWG = aGrp.warning.map(x => x.acc * 100);
        // 对比分析文字：我的瞬脱幅度 vs 群体
        const myB = diff(accBL[idxMax], accBL[idxMin]), gB = diff(accBG[idxMax], accBG[idxMin]);
        const myW = diff(accWL[idxMax], accWL[idxMin]), gW = diff(accWG[idxMax], accWG[idxMin]);
        const abCmpTxt = `你的基线瞬脱幅度为 <b>${p1(myB)} pp</b>，其他被试平均为 <b>${p1(gB)} pp</b>` +
          (Number.isFinite(myB) && Number.isFinite(gB)
            ? (myB > gB ? '，你的瞬脱效应<b>强于</b>群体平均，说明 T1 加工占用了你更多注意资源。' : '，你的瞬脱效应<b>弱于或接近</b>群体平均，T2 识别受 T1 的影响相对较小。')
            : '。') +
          ` 预警条件下：你为 ${p1(myW)} pp，群体为 ${p1(gW)} pp，` +
          (Number.isFinite(myW) && Number.isFinite(gW) && myW < myB && gW < gB
            ? '两者都因预警而减小，方向与群体一致。'
            : '可对照两者预警前后的变化方向是否一致。');
        body.insertAdjacentHTML('beforeend', `
          <div class="result-block">
            <h3>你的数据 vs 汇总均值对比 <span class="rb-sub-inline">（${this.group.n} 名被试）</span></h3>
            <div class="rb-sub">实线 = 你的数据${abSelfCsv ? '（取自汇总中本编号的记录）' : ''}，虚线 = 其他被试汇总均值；均为 T1 答对条件下的 T2 正确率</div>
            <div class="chart-wrap" id="abCmpChart"></div>
            <div class="interpret" style="margin-top:10px">${abCmpTxt}</div>
          </div>`);
        AL.chart.line(U.$('#abCmpChart'), {
          xLabels,
          series: [
            { name: '我 · 基线', color: '#e8692f', values: accBL, dashed: false },
            { name: '我 · 预警', color: '#2f8fd6', values: accWL, dashed: false },
            { name: '汇总 · 基线', color: '#e8692f', values: accBG, dashed: true },
            { name: '汇总 · 预警', color: '#2f8fd6', values: accWG, dashed: true }
          ],
          yMin: 0, yMax: 100,
          yLabel: 'T2 条件正确率 (%)',
          xLabel: 'T1 消失后的时间间隔（Lag）',
          valueFmt: v => v.toFixed(0) + '%'
        });
      } else if (this.group) {
        this.cmpHint(body);
      }
    },

    interpretAB(accB, accW, blinkB, blinkW, change, lags) {
      const minB = Math.min(...accB.filter(Number.isFinite));
      const idxMin = accB.indexOf(minB);
      const idxMax = lags.length - 1;
      let txt = `本次基线条件下，T2 条件正确率最低的是 <span class="hl">Lag ${lags[idxMin]}ms</span>
        （${p1(minB)}%），Lag ${lags[idxMin]}ms 为 ${p1(accB[idxMin])}%、Lag ${lags[idxMax]}ms 为 ${p1(accB[idxMax])}%。
        瞬脱幅度为 <b>${p1(blinkB)} 个百分点</b>。`;
      txt += ` Raymond, Shapiro 与 Arnell（1992）报告的典型瞬脱窗口约为 200–500ms，幅度常在 20–40 个百分点之间，可作为对照。`;
      if (Number.isFinite(change)) {
        txt += change > 0
          ? ` 加入预警后，瞬脱幅度变为 ${p1(blinkW)} 个百分点，<span class="hl">减小了 ${p1(change)} 个百分点</span>，方向与“预警把注意提前定向到事故位置、从而释放 T2 编码资源”的预测一致。`
          : ` 加入预警后瞬脱幅度为 ${p1(blinkW)} 个百分点，<span class="hl">反而增大了 ${p1(-change)} 个百分点</span>，与预测相反；可能的原因是预警本身占用注意资源，或样本量不足导致估计不稳定。`;
      }
      return txt;
    },

    /* ---------------------------- 实验2 ---------------------------- */
    renderNP(body) {
      const trials = this.dataFor('np');
      if (!trials.length) return this.empty(body, '实验2 · 座舱负启动尚未完成。');

      const n = AL.analysis.np(trials);
      const types = ['control', 'positive', 'negative'];
      const labels = ['控制', '正启动', '负启动'];
      const baseRt = types.map(t => n.baseline[t].rt);
      const hlRt = types.map(t => n.highlight[t].rt);

      const npB = diff(baseRt[2], baseRt[0]);
      const npH = diff(hlRt[2], hlRt[0]);
      const cut = diff(npB, npH);

      const maxRt = Math.max(
        ...baseRt.filter(Number.isFinite),
        ...hlRt.filter(Number.isFinite),
        300
      );
      const yMax = Math.ceil((maxRt * 1.25) / 100) * 100;

      body.innerHTML = `
        <div class="result-block">
          <h3>探测阶段反应时</h3>
          <div class="rb-sub">仅统计启动与探测都正确的试次（标准负启动算法）</div>
          <div class="chart-wrap" id="npChart"></div>
          <div class="metric-row" style="margin-top:16px">
            <div class="metric">
              <div class="metric-label">基线 · 负启动量</div>
              <div class="metric-value accent">${p0(npB)} ms</div>
              <div class="metric-note">负启动 − 控制</div>
            </div>
            <div class="metric">
              <div class="metric-label">弱高亮 · 负启动量</div>
              <div class="metric-value ok">${p0(npH)} ms</div>
              <div class="metric-note">改进条件</div>
            </div>
            <div class="metric">
              <div class="metric-label">效应缩减</div>
              <div class="metric-value ${Number.isFinite(cut) && cut > 0 ? 'ok' : 'warn'}">${p0(cut)} ms</div>
              <div class="metric-note">正值 = 改进有效</div>
            </div>
            <div class="metric">
              <div class="metric-label">正启动量</div>
              <div class="metric-value">${p0(diff(baseRt[1], baseRt[0]))} ms</div>
              <div class="metric-note">负值 = 重复启动加快</div>
            </div>
          </div>
        </div>

        <div class="result-block">
          <h3>分段数据表</h3>
          <div class="rb-sub">括号内为纳入反应时计算的试次数</div>
          <table class="data-table">
            <thead>
              <tr>
                <th>试次类型</th>
                <th>基线 RT</th><th>基线 正确率</th>
                <th>弱高亮 RT</th><th>弱高亮 正确率</th>
              </tr>
            </thead>
            <tbody>
              ${types.map((t, i) => `
                <tr>
                  <td>${labels[i]}</td>
                  <td>${p0(n.baseline[t].rt)} ms <span style="color:#5c7280">(${n.baseline[t].nRt})</span></td>
                  <td>${p1(n.baseline[t].acc * 100)}%</td>
                  <td>${p0(n.highlight[t].rt)} ms <span style="color:#5c7280">(${n.highlight[t].nRt})</span></td>
                  <td>${p1(n.highlight[t].acc * 100)}%</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="result-block">
          <h3>与经典研究对比</h3>
          <div class="interpret">${this.interpretNP(npB, npH, cut, baseRt)}</div>
          <div class="interpret" style="border-color:#4fb6c4">
            <b>方法说明</b>：负启动量 = RT(负启动) − RT(控制)。Tipper（1985）报告成人负启动量通常在 20–50ms；
            若你的数值为负或接近 0，说明本次未能复现，应结合正确率与试次数讨论。
          </div>
        </div>`;

      AL.chart.bars(U.$('#npChart'), {
        groups: [
          { label: '控制', values: [baseRt[0], hlRt[0]] },
          { label: '正启动', values: [baseRt[1], hlRt[1]] },
          { label: '负启动', values: [baseRt[2], hlRt[2]] }
        ],
        series: [
          { name: '基线', color: '#e8692f' },
          { name: '弱高亮（改进）', color: '#2f8fd6' }
        ],
        yMax,
        yLabel: '探测反应时 (ms)',
        valueFmt: v => v.toFixed(0)
      });

      // 对比图：我的 vs 汇总
      const { local: npLocal, group: npGroup, selfFromCsv: npSelfCsv } = this.compareData('np');
      if (npLocal.length && npGroup.length) {
        const nLoc = AL.analysis.np(npLocal);
        const nGrp = AL.analysis.np(npGroup);
        const yMaxCmp = Math.max(yMax, ...types.flatMap(t => [
          nGrp.baseline[t].rt, nGrp.highlight[t].rt,
          nLoc.baseline[t].rt, nLoc.highlight[t].rt
        ]).filter(Number.isFinite)) * 1.15;
        // 对比分析文字：我的负启动量 vs 群体
        const myNpB = diff(nLoc.baseline.negative.rt, nLoc.baseline.control.rt);
        const gNpB = diff(nGrp.baseline.negative.rt, nGrp.baseline.control.rt);
        const myNpH = diff(nLoc.highlight.negative.rt, nLoc.highlight.control.rt);
        const gNpH = diff(nGrp.highlight.negative.rt, nGrp.highlight.control.rt);
        const npCmpTxt = `你的负启动量：基线 <b>${p0(myNpB)} ms</b>、弱高亮 <b>${p0(myNpH)} ms</b>；` +
          `其他被试平均：基线 <b>${p0(gNpB)} ms</b>、弱高亮 <b>${p0(gNpH)} ms</b>。` +
          (Number.isFinite(myNpB) && Number.isFinite(gNpB)
            ? (myNpB > gNpB
              ? ' 你的抑制后效比群体更明显；'
              : ' 你的抑制后效弱于群体平均；')
            : '') +
          (Number.isFinite(myNpH) && Number.isFinite(myNpB) && myNpH < myNpB
            ? ' 弱高亮使你的负启动量下降，与改进预期一致。'
            : ' 弱高亮对你的负启动量削弱不明显，可结合试次数讨论。');
        body.insertAdjacentHTML('beforeend', `
          <div class="result-block">
            <h3>你的数据 vs 汇总均值对比 <span class="rb-sub-inline">（${this.group.n} 名被试）</span></h3>
            <div class="rb-sub">实线 = 你的数据${npSelfCsv ? '（取自汇总中本编号的记录）' : ''}，虚线 = 其他被试汇总均值；均为启动+探测都正确的试次的探测 RT</div>
            <div class="chart-wrap" id="npCmpChart"></div>
            <div class="interpret" style="margin-top:10px">${npCmpTxt}</div>
          </div>`);
        AL.chart.line(U.$('#npCmpChart'), {
          xLabels: labels,
          series: [
            { name: '我 · 基线', color: '#e8692f', values: types.map(t => nLoc.baseline[t].rt) },
            { name: '我 · 弱高亮', color: '#2f8fd6', values: types.map(t => nLoc.highlight[t].rt) },
            { name: '汇总 · 基线', color: '#e8692f', values: types.map(t => nGrp.baseline[t].rt), dashed: true },
            { name: '汇总 · 弱高亮', color: '#2f8fd6', values: types.map(t => nGrp.highlight[t].rt), dashed: true }
          ],
          yMin: 0, yMax: Math.ceil(yMaxCmp / 50) * 50,
          yLabel: '探测反应时 (ms)',
          xLabel: '试次类型',
          valueFmt: v => v.toFixed(0)
        });
      } else if (this.group) {
        this.cmpHint(body);
      }
    },

    interpretNP(npB, npH, cut, baseRt) {
      let txt = '';
      if (!Number.isFinite(npB)) {
        return '数据不足，无法计算负启动量。请确认每段试次完整完成。';
      }
      if (npB > 0) {
        txt += `基线条件下，负启动试次的探测反应时比控制条件慢 <span class="hl">${p0(npB)} ms</span>，
          成功复现了负启动效应；正启动量为 ${p0(diff(baseRt[1], baseRt[0]))} ms（负值表示重复启动更快）。`;
      } else {
        txt += `基线条件下负启动量为 <span class="hl">${p0(npB)} ms</span>，未出现预期的变慢，
          本次未复现负启动效应。`;
      }
      txt += ` Tipper（1985）报告的典型量级为 20–50ms，可用于对照。`;
      if (Number.isFinite(cut)) {
        txt += cut > 0
          ? ` 弱高亮条件下负启动量降为 ${p0(npH)} ms，<span class="hl">减少了 ${p0(cut)} ms</span>，
             与“降低对干扰项的主动抑制强度、从而削弱抑制后效”的预测一致。`
          : ` 弱高亮条件下负启动量为 ${p0(npH)} ms，比基线还大 ${p0(-cut)} ms，与预测相反。`;
      }
      return txt;
    },

    /* ---------------------------- 实验3 ---------------------------- */
    renderCM(body) {
      const trials = this.dataFor('cm');
      if (!trials.length) return this.empty(body, '实验3 · 比例判断尚未完成。');

      const c = AL.analysis.cm(trials);
      const conds = ['pie_plain', 'pie_ticks', 'bar_plain', 'bar_ticks', 'area_plain', 'area_ticks'];
      const labels = ['饼图·无刻度', '饼图·有刻度', '条形图·无刻度', '条形图·有刻度', '面积图·无刻度', '面积图·有刻度'];
      const absArr = conds.map(k => c[k].abs);
      const dPie = diff(absArr[0], absArr[1]);
      const dBar = diff(absArr[2], absArr[3]);
      const dArea = diff(absArr[4], absArr[5]);
      const cls = v => (Number.isFinite(v) && v > 0 ? 'ok' : 'warn');

      body.innerHTML = `
        <div class="result-block">
          <h3>比例判断误差</h3>
          <div class="rb-sub">误差 = |估计值 − 真实值|，单位：百分点（pp），越小越好；有/无刻度在段内随机交叉</div>
          <div class="chart-wrap" id="cmChartWrap"></div>
          <div class="metric-row" style="margin-top:16px">
            <div class="metric">
              <div class="metric-label">饼图 · 刻度改善</div>
              <div class="metric-value ${cls(dPie)}">${p1(dPie)} pp</div>
              <div class="metric-note">无刻度 − 有刻度</div>
            </div>
            <div class="metric">
              <div class="metric-label">条形图 · 刻度改善</div>
              <div class="metric-value ${cls(dBar)}">${p1(dBar)} pp</div>
              <div class="metric-note">无刻度 − 有刻度</div>
            </div>
            <div class="metric">
              <div class="metric-label">面积图 · 刻度改善</div>
              <div class="metric-value ${cls(dArea)}">${p1(dArea)} pp</div>
              <div class="metric-note">无刻度 − 有刻度</div>
            </div>
            <div class="metric">
              <div class="metric-label">平均刻度改善</div>
              <div class="metric-value ${cls(U.mean([dPie, dBar, dArea]))}">${p1(U.mean([dPie, dBar, dArea]))} pp</div>
              <div class="metric-note">正值 = 误差下降</div>
            </div>
          </div>
        </div>

        <div class="result-block">
          <h3>分段数据表</h3>
          <table class="data-table">
            <thead>
              <tr><th>显示格式</th><th>n</th><th>平均绝对误差</th><th>平均方向偏差</th><th>平均 RT</th></tr>
            </thead>
            <tbody>
              ${conds.map((k, i) => `
                <tr>
                  <td>${labels[i]}</td>
                  <td>${c[k].n}</td>
                  <td>${p1(c[k].abs)} pp</td>
                  <td>${p1(c[k].bias)} pp</td>
                  <td>${p0(c[k].rt)} ms</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="result-block">
          <h3>与经典研究对比</h3>
          <div class="interpret">${this.interpretCM(absArr, c, conds)}</div>
          <div class="interpret" style="border-color:#4fb6c4">
            <b>方法说明</b>：方向偏差 = 估计 − 真实。若平均偏差在低比例时为正、高比例时为负，
            说明估计向 50% 回归，这与 Hollands &amp; Dyre（2000）的循环幂模型一致。
          </div>
        </div>`;

      AL.chart.bars(U.$('#cmChartWrap'), {
        groups: conds.map((k, i) => ({ label: labels[i], values: [absArr[i]] })),
        series: [{ name: '平均绝对误差 (pp)', color: '#e8692f' }],
        yMax: Math.max(12, Math.ceil((Math.max(...absArr.filter(Number.isFinite), 1) * 1.35) / 5) * 5),
        yLabel: '平均绝对误差 (百分点)',
        valueFmt: v => v.toFixed(1)
      });

      // 对比图：我的 vs 汇总
      const { local: cmLocal, group: cmGroup, selfFromCsv: cmSelfCsv } = this.compareData('cm');
      if (cmLocal.length && cmGroup.length) {
        const cLoc = AL.analysis.cm(cmLocal);
        const cGrp = AL.analysis.cm(cmGroup);
        const absLoc = conds.map(k => cLoc[k].abs);
        const absGrp = conds.map(k => cGrp[k].abs);
        const allVals = absLoc.concat(absGrp).filter(Number.isFinite);
        const yMaxCmp = Math.max(8, Math.ceil(Math.max(...allVals, 1) * 1.35));
        // 对比分析文字：我的误差 vs 群体，并指出差异最大的条件
        const myMean = U.mean(absLoc), gMean = U.mean(absGrp);
        let maxI = -1, maxD = -1;
        absLoc.forEach((v, i) => {
          const d = Math.abs(diff(v, absGrp[i]));
          if (Number.isFinite(d) && d > maxD) { maxD = d; maxI = i; }
        });
        const cmCmpTxt = `你的平均绝对误差为 <b>${p1(myMean)} pp</b>，其他被试平均为 <b>${p1(gMean)} pp</b>` +
          (Number.isFinite(myMean) && Number.isFinite(gMean)
            ? (myMean < gMean ? '，你的比例判断<b>更准</b>。' : '，你的比例判断误差<b>高于</b>群体平均。')
            : '。') +
          (maxI >= 0 ? ` 与群体差异最大的是「${labels[maxI]}」（相差 ${p1(maxD)} pp），可检查该条件下的作答策略。` : '');
        body.insertAdjacentHTML('beforeend', `
          <div class="result-block">
            <h3>你的数据 vs 汇总均值对比 <span class="rb-sub-inline">（${this.group.n} 名被试）</span></h3>
            <div class="rb-sub">实线 = 你的数据${cmSelfCsv ? '（取自汇总中本编号的记录）' : ''}，虚线 = 其他被试汇总均值；误差越小越好</div>
            <div class="chart-wrap" id="cmCmpChart"></div>
            <div class="interpret" style="margin-top:10px">${cmCmpTxt}</div>
          </div>`);
        AL.chart.line(U.$('#cmCmpChart'), {
          xLabels: labels,
          series: [
            { name: '我的绝对误差', color: '#e8692f', values: absLoc },
            { name: '汇总绝对误差', color: '#2f8fd6', values: absGrp, dashed: true }
          ],
          yMin: 0, yMax: yMaxCmp,
          yLabel: '平均绝对误差 (百分点)',
          xLabel: '显示格式 × 刻度条件',
          valueFmt: v => v.toFixed(1)
        });
      } else if (this.group) {
        this.cmpHint(body);
      }
    },

    interpretCM(absArr, c, conds) {
      const [pieP, pieT, barP, barT, areaP, areaT] = absArr;
      let txt = `无刻度时：饼图 <span class="hl">${p1(pieP)}</span>、条形图 ${p1(barP)}、面积图 ${p1(areaP)} 个百分点；
        加刻度后：饼图 ${p1(pieT)}、条形图 ${p1(barT)}、面积图 ${p1(areaT)}。`;
      const ds = [['饼图', pieP - pieT], ['条形图', barP - barT], ['面积图', areaP - areaT]]
        .filter(([, d]) => Number.isFinite(d));
      if (ds.length) {
        const avg = U.mean(ds.map(([, d]) => d));
        txt += avg > 0
          ? ` 有刻度整体使误差平均下降 ${p1(avg)} 个百分点，支持“外部参照可减轻比例判断偏差”的预测。`
          : ` 有刻度并未稳定降低误差（平均反而高 ${p1(-avg)} 个百分点），与预测不一致。`;
      }
      const fmts = [['饼图', U.mean([pieP, pieT])], ['条形图', U.mean([barP, barT])], ['面积图', U.mean([areaP, areaT])]]
        .filter(([, v]) => Number.isFinite(v));
      if (fmts.length) {
        const best = fmts.slice().sort((a, b) => a[1] - b[1])[0];
        txt += ` Cleveland 与 McGill（1984）认为位置/长度判断优于角度/面积判断；本实验中误差最小的格式为${best[0]}（${p1(best[1])} 个百分点），可作为该结论的对照。`;
      }
      const bias = conds.map(k => `${k}：${p1(c[k].bias)}`);
      txt += ` 方向偏差（估计 − 真实）分别为 ${bias.join('、')}，正值表示高估。`;
      return txt;
    }
  };
})();
