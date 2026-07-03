// 间隔复习算法：主指标 level（掌握阶段），智能调节 ease（健康分）
// 下次复习日 = 今天 + round(BASE[level] * ease)
(function () {
  const BASE = [1, 2, 4, 7, 15, 30]; // level 0..5 的基础天数；level 6 = 已掌握
  const MAX_LEVEL = 6;
  const EASE_MIN = 0.6, EASE_MAX = 1.6, EASE_STEP = 0.1;

  function pad(n) { return String(n).padStart(2, '0'); }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }

  const SRS = {
    todayStr() { return fmt(new Date()); },
    addDays(str, n) { const d = parse(str); d.setDate(d.getDate() + n); return fmt(d); },

    // 新学完成 → 建立记录，明天首次复习
    newRecord(word) {
      const today = this.todayStr();
      return {
        word: word,
        level: 0,
        ease: 1.0,
        reps: 0,
        lapses: 0,
        mastered: false,
        firstLearned: today,
        lastReviewed: today,
        nextReview: this.addDays(today, 1),
        createdAt: today
      };
    },

    // 复习时判定「认识」(√)
    onKnow(rec) {
      const today = this.todayStr();
      rec.reps++;
      rec.lastReviewed = today;
      rec.ease = Math.min(EASE_MAX, +(rec.ease + EASE_STEP).toFixed(2));
      rec.level = Math.min(MAX_LEVEL, rec.level + 1);
      if (rec.level >= MAX_LEVEL) {
        rec.mastered = true;
        rec.nextReview = null;
      } else {
        const days = Math.max(1, Math.round(BASE[rec.level] * rec.ease));
        rec.nextReview = this.addDays(today, days);
      }
      return rec;
    },

    // 复习时判定「忘记」(×) → 回退 + 缩短 + 明天重来（并进入重学队列）
    onForget(rec) {
      const today = this.todayStr();
      rec.reps++;
      rec.lapses++;
      rec.lastReviewed = today;
      rec.ease = Math.max(EASE_MIN, +(rec.ease - 2 * EASE_STEP).toFixed(2));
      rec.level = Math.max(0, rec.level - 2);
      rec.mastered = false;
      rec.nextReview = this.addDays(today, 1);
      return rec;
    },

    // 预览下次间隔天数（用于展示）
    nextIntervalPreview(rec) {
      if (rec.level >= MAX_LEVEL) return '已掌握';
      return Math.max(1, Math.round(BASE[rec.level] * rec.ease)) + '天';
    },

    BASE, MAX_LEVEL
  };

  window.SRS = SRS;
})();
