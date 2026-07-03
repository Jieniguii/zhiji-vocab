// 本地存储：用 localStorage（file:// 下稳定、单用户够用），并支持导出/导入备份
(function () {
  const KEY_REC = 'zhiji.records.v1';
  const KEY_SET = 'zhiji.settings.v1';
  const KEY_ACT = 'zhiji.activity.v1';

  const Store = {
    records: {},   // word(lowercase) -> record
    activity: {},  // 'YYYY-MM-DD' -> { learned: n, reviewed: n }
    settings: {
      accent: 'us',            // us / uk
      dailyReviewCap: 0,       // 0 = 不限量
      dailyNewCount: 20,       // 默认学新数量
      bank: 'cet6',            // 当前词库
      orderMode: 'smart'       // smart(核心优先) / shuffle(完全乱序) / alpha(字母序)
    },

    load() {
      try {
        const r = localStorage.getItem(KEY_REC);
        this.records = r ? JSON.parse(r) : {};
      } catch (e) { this.records = {}; }
      try {
        const s = localStorage.getItem(KEY_SET);
        if (s) Object.assign(this.settings, JSON.parse(s));
      } catch (e) {}
      try {
        const a = localStorage.getItem(KEY_ACT);
        this.activity = a ? JSON.parse(a) : {};
      } catch (e) { this.activity = {}; }
    },

    saveRecords() {
      localStorage.setItem(KEY_REC, JSON.stringify(this.records));
    },
    saveSettings() {
      localStorage.setItem(KEY_SET, JSON.stringify(this.settings));
    },
    saveActivity() {
      localStorage.setItem(KEY_ACT, JSON.stringify(this.activity));
    },

    // 记录今日活动：type = 'learned' | 'reviewed'
    bumpActivity(type, n) {
      const d = new Date();
      const pad = x => String(x).padStart(2, '0');
      const today = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
      if (!this.activity[today]) this.activity[today] = { learned: 0, reviewed: 0 };
      this.activity[today][type] = Math.max(0, (this.activity[today][type] || 0) + (n || 1));
      this.saveActivity();
    },

    // 连续学习天数（含今天或昨天起算）
    streak() {
      const days = Object.keys(this.activity).filter(d => {
        const a = this.activity[d];
        return a && (a.learned || a.reviewed);
      });
      if (!days.length) return 0;
      const set = new Set(days);
      const dayMs = 86400000;
      let cur = new Date();
      // 今天没活动就从昨天算
      const fmt = dt => { const p = x => String(x).padStart(2, '0'); return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate()); };
      if (!set.has(fmt(cur))) cur = new Date(cur.getTime() - dayMs);
      let s = 0;
      while (set.has(fmt(cur))) { s++; cur = new Date(cur.getTime() - dayMs); }
      return s;
    },

    key(word) { return String(word).toLowerCase(); },
    get(word) { return this.records[this.key(word)] || null; },
    put(rec) { this.records[this.key(rec.word)] = rec; this.saveRecords(); },

    all() { return Object.values(this.records); },
    count() { return Object.keys(this.records).length; },
    masteredCount() { return this.all().filter(r => r.mastered).length; },

    // 今天到期需要复习的词
    due(today) {
      return this.all().filter(r =>
        !r.mastered && r.nextReview && r.nextReview <= today
      );
    },

    // 从词库里挑还没学过的词，按学习顺序模式排序
    pickNewWords(bankArr, count, mode) {
      mode = mode || this.settings.orderMode;
      let cand = bankArr.filter(w => !this.get(w.word));
      if (mode === 'smart') {
        // 核心优先；同级保持词库里的乱序（sort 稳定）
        cand = cand.slice().sort((a, b) => (a.tier || 4) - (b.tier || 4));
      } else if (mode === 'alpha') {
        cand = cand.slice().sort((a, b) => a.word.toLowerCase().localeCompare(b.word.toLowerCase()));
      }
      // shuffle：词库文件本身已乱序，直接用原顺序
      return cand.slice(0, count);
    },

    // 某词库已学词数
    learnedInBank(bankArr) {
      let n = 0;
      for (const w of bankArr) if (this.get(w.word)) n++;
      return n;
    },

    // ---- 备份 ----
    exportBackup() {
      const data = {
        app: 'zhiji-vocab',
        version: 1,
        exportedAt: new Date().toISOString(),
        records: this.records,
        settings: this.settings,
        activity: this.activity
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      a.href = url;
      a.download = `智记备份_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    importBackup(obj) {
      if (!obj || obj.app !== 'zhiji-vocab' || !obj.records) {
        throw new Error('不是有效的智记备份文件');
      }
      this.records = obj.records;
      if (obj.settings) Object.assign(this.settings, obj.settings);
      if (obj.activity) this.activity = obj.activity;
      this.saveRecords();
      this.saveSettings();
      this.saveActivity();
    }
  };

  window.Store = Store;
})();
