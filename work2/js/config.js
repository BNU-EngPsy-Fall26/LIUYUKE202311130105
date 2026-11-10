/* ============================================================
   config.js — 全局配置
   ------------------------------------------------------------
   PROJECT_CODE：在 https://attention-lab-production.up.railway.app/hw2
   新建项目后得到的 6 位项目码，替换下面的占位符即可开始上传。
   未替换时，实验仍可正常运行，数据会保存在本地并可通过 CSV 导出。
   ============================================================ */

window.AL = window.AL || {};

AL.config = {
  APP_NAME: '注意实验室',
  VERSION: '1.0.0',

  // 课程收数接口（作业要求指定）
  API_URL: 'https://attention-lab-production.up.railway.app/api/hw2/submit',

  // 课程项目码（/hw2 新建项目后获得）
  PROJECT_CODE: 'V8ZWVB',

  // 上传超时（毫秒）
  API_TIMEOUT: 8000,

  // 实验在收数平台 / CSV 中显示的名称（内部仍用 ab / np / cm 作为键）
  EXP_LABEL: {
    ab: '驾驶注意瞬脱',
    np: '座舱负启动',
    cm: '比例判断'
  },

  // 实验参数（集中在此，便于核对与复现）
  AB: {
    // Lag = T1 onset → T2 onset 的 SOA（ms）：经典注意瞬脱从 T1 onset 计时
    // 盲区 200-500ms，我们设 Lag=200(盲区最深)/300(盲区)/500(开始恢复)/700(完全恢复)
    LAGS: [200, 300, 500, 700],
    T2_DURATION: 33,              // T2 呈现时长（ms）：极短，确保在瞬脱窗口内难以识别
    T1_DURATION: 200,             // T1 呈现时长（ms）：缩短到 200ms，让 T2 能在经典盲区内出现
    DISTRACTOR_DURATION: 80,      // T1→T2 之间的闪光干扰项呈现时长（ms）
    T1_MAX_WAIT: 2200,            // 事故出现后最长等待被试按空格的时间（ms）；超时则 T2 不出现
    PREROLL_MIN: 1000,            // 试次开始 → 事故出现的最短随机延时（ms）
    PREROLL_MAX: 3400,            // 试次开始 → 事故出现的最长随机延时（ms），区间内随机以免可预期
    WARNING_LEAD: 400,            // 预警提前量（ms）：明显的 HUD 警报，便于察觉
    TRIALS_PER_LAG: 2,            // 每段每个 Lag 2 试次 → 每段 8 个含 T2 试次
    FILLER_TRIALS: 2,             // 每段的无 T2 填充试次
    PRACTICE_TRIALS: 4,           // 练习 4 试次
    REST_SECONDS: 15
  },
  NP: {
    TRIALS_PER_TYPE: 6,           // 每段每种试次类型 6 个 → 每种类型共 12 个
    PRACTICE_TRIALS: 6,
    SOA: 500,                     // 启动 → 探测 的空白间隔（ms）
    TIMEOUT: 3000,                // 单次判断超时（ms）
    REST_SECONDS: 15
  },
  CM: {
    // 比例池：刻意避开 0/5 结尾与 25/50/75 刻度值，避免被试直接“读刻度”猜答案
    POOL: [12, 17, 23, 28, 34, 39, 43, 47, 53, 58, 63, 67, 72, 78, 83, 89],
    PROPS_PER_BLOCK: 5,           // 每段抽取 5 个比例，每个比例分别在有/无刻度下各出现 1 次
    PRACTICE_TRIALS: 6,           // 练习 6 试次：3 种格式 × 有/无刻度 各一次
    TIMEOUT: 20000,
    REST_SECONDS: 10
  }
};

/** 判断项目码是否已配置 */
AL.isProjectConfigured = function () {
  const code = String(AL.config.PROJECT_CODE || '').trim();
  return /^[A-Za-z0-9]{6}$/.test(code) && code !== 'YOUR_PROJECT_CODE';
};
