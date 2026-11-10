/* ============================================================
   core.js — 工具函数、计时器、本地数据层、收数接口、CSV
   ============================================================ */

(function () {
  const AL = window.AL;

  /* ------------------------------------------------------------
     1. 基础工具
     ------------------------------------------------------------ */
  const U = AL.util = {
    $: (sel, root) => (root || document).querySelector(sel),
    $$: (sel, root) => Array.from((root || document).querySelectorAll(sel)),

    /** 高精度时间戳（作业要求：所有计时使用 performance.now） */
    now: () => performance.now(),

    rand: (min, max) => min + Math.random() * (max - min),
    randInt: (min, max) => Math.floor(min + Math.random() * (max - min + 1)),

    /** 原地洗牌（Fisher–Yates） */
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },

    /** 字符串 → 稳定的 32 位哈希，用于被试间的条件平衡 */
    hash(str) {
      let h = 2166136261;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    },

    mean(arr) {
      const v = arr.filter(x => Number.isFinite(x));
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
    },

    sd(arr) {
      const v = arr.filter(x => Number.isFinite(x));
      if (v.length < 2) return NaN;
      const m = U.mean(v);
      return Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
    },

    clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
    round: (x, d = 1) => (Number.isFinite(x) ? Number(x.toFixed(d)) : NaN),

    /** 统一把 CSV 里的 "true"/"True"/"TRUE"/"1"/true 解析为布尔（平台导出是 Python 风格首字母大写） */
    truthy(v) {
      if (v === true || v === 1) return true;
      const s = String(v).trim().toLowerCase();
      return s === 'true' || s === '1';
    },
    num(v) {
      if (v === '' || v === null || v === undefined) return NaN;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    },

    /** 百分比显示，NaN → '—' */
    pct(x, d = 1) {
      return Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '—';
    },
    ms(x) {
      return Number.isFinite(x) ? x.toFixed(0) + ' ms' : '—';
    },

    /** 创建元素并批量设置属性 */
    el(tag, attrs, children) {
      const node = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(k => {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
      (children || []).forEach(c => node.appendChild(c));
      return node;
    },

    /** 简单延时（不参与实验计时，仅用于界面动画） */
    sleep(ms) {
      return new Promise(res => setTimeout(res, ms));
    }
  };

  /* ------------------------------------------------------------
     2. 实验计时器：统一登记 setTimeout，退出实验时可一次性清理
     ------------------------------------------------------------ */
  /** 内部键（ab/np/cm）→ 收数平台与 CSV 中显示的实验名称 */
  AL.expLabel = key => (AL.config.EXP_LABEL && AL.config.EXP_LABEL[key]) || key;

  AL.Exp = {
    timers: [],
    keyHandler: null,
    running: false,

    later(fn, ms) {
      const id = setTimeout(() => {
        this.timers = this.timers.filter(t => t !== id);
        fn();
      }, ms);
      this.timers.push(id);
      return id;
    },

    clearTimers() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
    },

    clearAll() {
      this.clearTimers();
      this.keyHandler = null;
      this.running = false;
    }
  };

  document.addEventListener('keydown', e => {
    if (AL.Exp.keyHandler) AL.Exp.keyHandler(e);
  });

  /* ------------------------------------------------------------
     3. 本地数据层（localStorage）
        结构：{ current: 'P01', byPid: { P01: { exps: { ab: {...} } } } }
     ------------------------------------------------------------ */
  AL.store = {
    KEY: 'attentionlab.v1',
    data: { current: null, byPid: {} },

    load() {
      try {
        const raw = localStorage.getItem(this.KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.data.current = parsed.current || null;
            this.data.byPid = parsed.byPid || {};
          }
        }
      } catch (err) {
        console.warn('读取本地数据失败，将使用空数据。', err);
      }
      return this.data;
    },

    save() {
      try {
        localStorage.setItem(this.KEY, JSON.stringify(this.data));
      } catch (err) {
        console.warn('保存本地数据失败（可能是浏览器隐私模式）。', err);
      }
    },

    setParticipant(pid) {
      const id = String(pid || '').trim();
      this.data.current = id;
      if (!this.data.byPid[id]) {
        this.data.byPid[id] = {
          createdAt: new Date().toISOString(),
          consentAt: null,
          exps: {}
        };
      }
      this.data.byPid[id].consentAt = new Date().toISOString();
      this.save();
      return this.data.byPid[id];
    },

    participant() { return this.data.current; },

    record(pid) {
      return this.data.byPid[pid || this.data.current] || null;
    },

    getExp(key, pid) {
      const rec = this.record(pid);
      return rec && rec.exps ? rec.exps[key] || null : null;
    },

    saveExp(key, payload, pid) {
      const rec = this.record(pid);
      if (!rec) return null;
      rec.exps[key] = payload;
      this.save();
      return rec.exps[key];
    },

    clearExp(key, pid) {
      const rec = this.record(pid);
      if (rec && rec.exps) {
        delete rec.exps[key];
        this.save();
      }
    },

    pids() { return Object.keys(this.data.byPid); }
  };

  /* ------------------------------------------------------------
     4. 轻量 UI：toast 与确认框
     ------------------------------------------------------------ */
  let toastTimer = null;
  AL.ui = {
    toast(msg, ms = 2400) {
      const el = U.$('#toast');
      if (!el) return;
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { el.hidden = true; }, ms);
    },

    /** 返回 Promise<boolean> 的确认框 */
    confirm(title, body, okText) {
      return new Promise(resolve => {
        const modal = U.$('#modal');
        U.$('#modalTitle').textContent = title;
        U.$('#modalBody').textContent = body;
        const ok = U.$('#modalOk');
        const cancel = U.$('#modalCancel');
        ok.textContent = okText || '确定';
        modal.hidden = false;

        const done = val => {
          modal.hidden = true;
          ok.removeEventListener('click', onOk);
          cancel.removeEventListener('click', onCancel);
          resolve(val);
        };
        const onOk = () => done(true);
        const onCancel = () => done(false);
        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
      });
    }
  };

  /* ------------------------------------------------------------
     5. 防误操作：实验进行中屏蔽右键 + 离开提醒
     ------------------------------------------------------------ */
  let guardOn = false;
  const beforeUnload = e => { e.preventDefault(); e.returnValue = ''; };
  const blockContext = e => {
    e.preventDefault();
    AL.ui.toast('实验进行中，请勿使用右键菜单');
  };

  AL.guard = {
    on() {
      if (guardOn) return;
      guardOn = true;
      window.addEventListener('beforeunload', beforeUnload);
      document.addEventListener('contextmenu', blockContext);
    },
    off() {
      if (!guardOn) return;
      guardOn = false;
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('contextmenu', blockContext);
    }
  };

  /* ------------------------------------------------------------
     6. 收数接口
     ------------------------------------------------------------ */
  AL.api = {
    /**
     * 上传一个实验的数据
     * @returns {Promise<{status:'sent'|'skipped'|'error', detail?:string}>}
     */
    async submit(experiment, participant, condition, trials) {
      if (!AL.isProjectConfigured()) {
        return { status: 'skipped', detail: '未配置项目码' };
      }
      const body = {
        project: AL.config.PROJECT_CODE,
        experiment,
        participant,
        condition: condition || '',
        trials
      };

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), AL.config.API_TIMEOUT);
      try {
        const res = await fetch(AL.config.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        if (!res.ok) {
          return { status: 'error', detail: 'HTTP ' + res.status };
        }
        return { status: 'sent' };
      } catch (err) {
        clearTimeout(timer);
        return { status: 'error', detail: err && err.message ? err.message : '网络错误' };
      }
    },

    /**
     * 从收数平台拉取本项目全部记录，并展平成试次行
     * （平台 GET /api/hw2/data 返回 JSON：records[].trials[]）
     * @returns {Promise<{status:'ok'|'skipped'|'error', rows?:Array, detail?:string}>}
     */
    async fetchGroup() {
      if (!AL.isProjectConfigured()) {
        return { status: 'skipped', detail: '未配置项目码' };
      }
      const url = AL.config.API_URL.replace(/\/submit$/, '/data')
        + '?project=' + encodeURIComponent(AL.config.PROJECT_CODE);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), AL.config.API_TIMEOUT);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return { status: 'error', detail: 'HTTP ' + res.status };
        const j = await res.json();
        const rows = [];
        ((j && j.records) || []).forEach(rec => {
          (rec.trials || []).forEach(t => {
            // trial 里的 participant_id 优先；缺了才用提交时的被试编号
            rows.push(Object.assign({ experiment: rec.experiment, participant_id: rec.participant }, t));
          });
        });
        return { status: 'ok', rows };
      } catch (err) {
        clearTimeout(timer);
        return { status: 'error', detail: err && err.message ? err.message : '网络错误' };
      }
    }
  };

  /* ------------------------------------------------------------
     7. CSV 导出与解析
     ------------------------------------------------------------ */
  const COLUMNS = AL.CSV_COLUMNS = [
    'experiment', 'participant_id', 'trial_num', 'block_type', 'trial_type',
    'lag_ms', 't1_type', 't1_response', 't1_correct', 't1_rt',
    't2_present', 't2_color', 't2_side', 't2_response', 't2_correct',
    'prime_target', 'prime_rt', 'prime_correct', 'probe_target', 'probe_rt', 'probe_correct',
    'display_format', 'true_proportion', 'estimate', 'abs_error', 'signed_error',
    'rt', 'started_at'
  ];

  const esc = v => {
    if (v === null || v === undefined) return '';
    let s = String(v);
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  AL.csv = {
    /**
     * 把某被试的全部实验拼成统一的宽表
     */
    rowsFor(pid) {
      const rec = AL.store.record(pid);
      if (!rec || !rec.exps) return [];
      const rows = [];
      Object.keys(rec.exps).forEach(key => {
        const pack = rec.exps[key];
        (pack.trials || []).forEach(t => {
          const row = Object.assign({}, t);
          row.experiment = AL.expLabel(key);
          row.started_at = pack.startedAt || '';
          rows.push(row);
        });
      });
      return rows;
    },

    build(rows) {
      const lines = [COLUMNS.join(',')];
      rows.forEach(r => {
        lines.push(COLUMNS.map(c => esc(r[c])).join(','));
      });
      return lines.join('\r\n');
    },

    download(filename, text) {
      // \uFEFF：让 Excel 正确识别 UTF-8 中文
      const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    exportParticipant(pid) {
      const rows = this.rowsFor(pid || AL.store.participant());
      if (!rows.length) {
        AL.ui.toast('当前还没有可导出的数据');
        return false;
      }
      this.download(`attention-lab_${pid || 'all'}_${Date.now()}.csv`, this.build(rows));
      return true;
    },

    exportAllParticipants() {
      const all = [];
      AL.store.pids().forEach(pid => { all.push(...this.rowsFor(pid)); });
      if (!all.length) {
        AL.ui.toast('当前还没有可导出的数据');
        return false;
      }
      this.download(`attention-lab_全被试_${Date.now()}.csv`, this.build(all));
      return true;
    },

    /** 解析 CSV 文本 → 对象数组（支持引号内逗号与换行） */
    parse(text) {
      const src = text.replace(/^\uFEFF/, '');
      const rows = [];
      let row = [], field = '', inQuotes = false;

      for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
          if (ch === '"') {
            if (src[i + 1] === '"') { field += '"'; i++; }
            else inQuotes = false;
          } else field += ch;
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          row.push(field); field = '';
        } else if (ch === '\n') {
          row.push(field); field = '';
          rows.push(row); row = [];
        } else if (ch !== '\r') {
          field += ch;
        }
      }
      if (field.length || row.length) { row.push(field); rows.push(row); }

      if (!rows.length) return [];
      const header = rows[0].map(h => h.trim());
      return rows.slice(1)
        .filter(r => r.some(c => c !== ''))
        .map(r => {
          const obj = {};
          header.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
          return obj;
        });
    }
  };

  /* ------------------------------------------------------------
     8. 启动时读取本地数据
     ------------------------------------------------------------ */
  AL.store.load();
})();
