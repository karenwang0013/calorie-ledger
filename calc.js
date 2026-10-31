/* 热量账本 · 首页数字的唯一计算入口（2026-10-31 v10.69）
 *
 * 为什么单独抽出来：用户要求「以后所有数值都要算得对，不只是今天」
 * —— 只有把算式收成一处、再用自动化检查锁住，才不会下次改界面又算错。
 *
 * 约定（全部是整数千卡）：
 *   expNow      = 今天到现在为止已经消耗的：基础代谢 × 当天进度 + 手表活动
 *   expForecast = 照现在的走动，今天全天大概会消耗多少 = 到现在 + 日目标 × 剩余进度
 *   budget      = 今天总共还能吃多少 = expForecast − 缺口（增肌时缺口是负数，等于加盈余）
 *   left        = 还可以吃 = budget − 已吃（负数是已经超出）
 *   targetBurn  = 要达成缺口，全天得烧到多少 = 已吃 + 缺口（增肌时 = 已吃 − 盈余）
 *   gapNow      = 到现在为止的实际缺口 = 到现在消耗 − 已吃（负数=盈余）
 *
 * 三种模式只是 deficit 的符号不同：
 *   减脂 deficit > 0 ｜ 维持 deficit = 0 ｜ 增肌 deficit < 0（盈余）
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const clampFrac = f => Math.min(1, Math.max(0, Number(f) || 0));
  const n0 = v => Number(v) || 0;

  /** 到现在为止的消耗。det 来自 api.js daySummary().expenditure_detail */
  function expNow(det, expFull, frac) {
    const f = clampFrac(frac);
    const d = det || {};
    if (d.active && d.resting) return Math.round(n0(d.resting) * f) + n0(d.active);
    if (d.total) return Math.round(n0(d.total) * f);
    return Math.round(n0(expFull) * f);
  }

  /** 照现在节奏推算的全天消耗 */
  function expForecast(expNowVal, baseExp, frac) {
    const f = clampFrac(frac);
    return Math.round(n0(expNowVal) + n0(baseExp) * (1 - f));
  }

  /** 今天总共可吃 */
  function budget(forecast, deficit) {
    return Math.round(n0(forecast) - Math.round(n0(deficit)));
  }

  /** 还可以吃（负数=已超出） */
  function left(budgetVal, intake) {
    return Math.round(n0(budgetVal)) - Math.round(n0(intake));
  }

  /** 要达成缺口，全天得烧到多少 */
  function targetBurn(intake, deficit) {
    return Math.round(n0(intake) + Math.round(n0(deficit)));
  }

  /** 到现在为止的实际缺口（负数=盈余） */
  function gapNow(expNowVal, intake) {
    return Math.round(n0(expNowVal)) - Math.round(n0(intake));
  }

  return { expNow, expForecast, budget, left, targetBurn, gapNow };
});
