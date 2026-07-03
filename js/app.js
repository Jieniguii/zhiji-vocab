// 路由 + 首页 + 设置 + 总结页
(function () {
  // 分级标签
  window.TIER_LABEL = { 1: '核心', 2: '高频', 3: '中频', 4: '低频' };
  window.TIER_CLASS = { 1: 't-core', 2: 't-high', 3: 't-mid', 4: 't-low' };

  const App = {
    // 词库注册表
    banks: {
      cet6: { name: 'CET6', varName: 'cet6' },
      daily: { name: '日常基础', varName: 'daily' },
      tech: { name: '办公·编程', varName: 'tech' },
      jp: { name: '日语JLPT', varName: 'jp', lang: 'ja' }
    },

    init() {
      Store.load();
      Speech.init();
      const W = window.WORDBANKS || {};
      // 挂上每个词库的数组
      Object.keys(this.banks).forEach(k => { this.banks[k].arr = W[this.banks[k].varName] || []; });
      // 复习查词用：合并所有词库的 word -> wordObj
      this.bankMap = {};
      Object.keys(this.banks).forEach(k => {
        (this.banks[k].arr || []).forEach(w => {
          if (!this.bankMap[w.word.toLowerCase()]) this.bankMap[w.word.toLowerCase()] = w;
        });
      });
      // 校验当前词库有效
      if (!this.banks[Store.settings.bank]) Store.settings.bank = 'cet6';
      this.renderHome();
    },

    curBank() { return this.banks[Store.settings.bank] || this.banks.cet6; },

    show(id) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      window.scrollTo(0, 0);
    },

    // ---------------- 首页 ----------------
    renderHome() {
      this.show('screen-home');
      const today = SRS.todayStr();
      const due = Store.due(today);
      const learned = Store.count();
      const mastered = Store.masteredCount();
      const notMastered = learned - mastered;

      const d = new Date();
      const wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      document.getElementById('home-date').textContent =
        `${d.getMonth() + 1}月${d.getDate()}日 · 周${wk}`;

      const bank = this.curBank();
      const bankLearned = Store.learnedInBank(bank.arr);
      const bankOptions = Object.keys(this.banks).map(k =>
        `<option value="${k}" ${k === Store.settings.bank ? 'selected' : ''}>${this.banks[k].name}（${this.banks[k].arr.length}）</option>`
      ).join('');

      const jaNoVoice = bank.lang === 'ja' && window.Speech && !Speech.hasVoiceFor('ja');

      const el = document.getElementById('home-body');
      el.innerHTML = `
        <div class="card home-card">
          <div class="row">
            <label>词库</label>
            <select id="bank-select">${bankOptions}</select>
          </div>
          <div class="hc-sub">本词库已学 ${bankLearned} / ${bank.arr.length} 词</div>
          ${jaNoVoice ? `<div class="warn-tip">⚠️ 未检测到日语语音，日语发音已暂停。<br>装法：Windows 设置 → 时间和语言 → 语音 → 管理语音 → 添加“日语”，装好后重启本应用。</div>` : ''}
        </div>

        <div class="card home-card">
          <div class="hc-title">📖 学新</div>
          <div class="hc-sub">全部已学 ${learned} 词 · 未掌握 ${notMastered}</div>
          <div class="row">
            <label>本次学新数量</label>
            <input type="number" id="new-count" min="1" value="${Store.settings.dailyNewCount}" />
          </div>
          <button class="btn primary block" id="btn-study">开始学新 →</button>
        </div>

        <div class="card home-card">
          <div class="hc-title">📝 复习</div>
          <div class="hc-sub">今日待复习 <b>${due.length}</b> 词</div>
          <button class="btn ok block" id="btn-review" ${due.length ? '' : 'disabled'}>
            ${due.length ? '开始复习 (' + due.length + ') →' : '今天没有要复习的词'}
          </button>
        </div>

        ${(() => {
          const tw = this.todayWords().length;
          return tw ? `<div class="card home-card">
            <div class="hc-title">⚡ 今日复盘</div>
            <div class="hc-sub">今天学了 ${tw} 词 · 趁热再快刷一遍，记得更牢</div>
            <button class="btn warn block" id="btn-flip">开始快刷 (${tw}) →</button>
          </div>` : '';
        })()}

        <div class="stat-bar">
          <div><b>${learned}</b><span>累计学习</span></div>
          <div><b>${mastered}</b><span>已掌握</span></div>
          <div><b>${due.length}</b><span>待复习</span></div>
        </div>

        <div class="foot-links">
          <a id="lnk-learned">📚 已学单词</a>
          <a id="lnk-stats">📊 统计 / 日历</a>
          <a id="lnk-settings">⚙️ 设置 / 备份</a>
        </div>`;

      document.getElementById('bank-select').onchange = (e) => {
        Store.settings.bank = e.target.value;
        Store.saveSettings();
        this.renderHome();
      };
      document.getElementById('btn-study').onclick = () => {
        const n = Math.max(1, parseInt(document.getElementById('new-count').value) || 1);
        Store.settings.dailyNewCount = n;
        Store.saveSettings();
        this.startStudy(n);
      };
      const rb = document.getElementById('btn-review');
      if (due.length) rb.onclick = () => this.startReview();
      const fb = document.getElementById('btn-flip');
      if (fb) fb.onclick = () => this.startFlip();
      document.getElementById('lnk-settings').onclick = () => this.renderSettings();
      document.getElementById('lnk-stats').onclick = () => this.renderStats();
      document.getElementById('lnk-learned').onclick = () => this.renderLearned();
    },

    // ---------------- 学新 ----------------
    startStudy(n) {
      const words = Store.pickNewWords(this.curBank().arr, n);
      if (!words.length) {
        alert('这个词库的词都学过啦！可以换个词库，或去复习。');
        return;
      }
      this.lastBatch = words;
      Study.start({
        words: words,
        title: '学新',
        onDone: (results) => this.finishStudy(words, results)
      });
    },

    finishStudy(batch, results) {
      // 为新学的词建立复习记录（明天首次复习），并按当场难度定起始健康分
      let created = 0;
      batch.forEach(w => {
        if (!Store.get(w.word)) {
          const rec = SRS.newRecord(w.word);
          const st = (results[w.word.toLowerCase()] || {}).status || 'known';
          if (st === 'forgot') rec.ease = 0.7;       // 难：间隔更紧，被刷得更勤
          else if (st === 'vague') rec.ease = 0.85;  // 中
          rec.initialDifficulty = st;
          Store.put(rec);
          created++;
        }
      });
      if (created) Store.bumpActivity('learned', created);
      this.renderSummary(batch, results);
    },

    // ---------------- 复习 ----------------
    startReview() {
      const today = SRS.todayStr();
      let due = Store.due(today);
      // 弱项优先：level 低的先复习
      due.sort((a, b) => a.level - b.level || (a.ease - b.ease));
      const cap = Store.settings.dailyReviewCap;
      if (cap && cap > 0) due = due.slice(0, cap);

      const items = [];
      due.forEach(rec => {
        const w = this.bankMap[rec.word.toLowerCase()];
        if (w) items.push({ rec: rec, word: w });
      });
      if (!items.length) { this.renderHome(); return; }

      Review.start({
        items: items,
        onDone: () => this.renderHome()
      });
    },

    // ---------------- 今日复盘（快刷） ----------------
    todayWords() {
      const t = SRS.todayStr();
      return Store.all()
        .filter(r => r.firstLearned === t)
        .map(r => this.bankMap[r.word.toLowerCase()])
        .filter(Boolean);
    },

    startFlip() {
      const words = this.todayWords();
      if (!words.length) { alert('今天还没学新词，先去「开始学新」吧～'); return; }
      Flip.start({ words: words, onDone: () => this.renderHome() });
    },

    // ---------------- 今日总结 ----------------
    renderSummary(batch, results) {
      this.show('screen-summary');
      let k = 0, v = 0, f = 0;
      const rows = batch.map(w => {
        const r = results[w.word.toLowerCase()];
        const st = r ? r.status : 'known';
        if (st === 'known') k++; else if (st === 'vague') v++; else f++;
        const icon = st === 'known' ? '✅' : st === 'vague' ? '⚠️' : '❌';
        return `<div class="sum-row ${st}"><span>${icon} ${w.word}</span>
          <span class="muted">${w.meaning.replace(/\n/g, ' ').slice(0, 16)}</span></div>`;
      }).join('');
      const rate = Math.round(k / batch.length * 100);
      const weak = batch.filter(w => {
        const r = results[w.word.toLowerCase()];
        return r && r.status !== 'known';
      });

      document.getElementById('summary-body').innerHTML = `
        <div class="group-done">🎉 今日 ${batch.length} 词完成！</div>
        <div class="sum-rate big">掌握率 ${rate}%</div>
        <div class="sum-rate">✅ 认识 ${k}　⚠️ 模糊 ${v}　❌ 忘记 ${f}</div>
        <div class="sum-list">${rows}</div>
        <div class="controls">
          <button class="btn warn block" id="btn-flip2">⚡ 今日复盘 · 快刷一遍</button>
          ${weak.length ? `<button class="btn ghost block" id="btn-reweak">🔁 只再背模糊/忘记的 ${weak.length} 词</button>` : ''}
          <button class="btn primary block" id="btn-home">🏠 返回首页</button>
        </div>`;
      document.getElementById('btn-home').onclick = () => this.renderHome();
      document.getElementById('btn-flip2').onclick = () => this.startFlip();
      if (weak.length) {
        document.getElementById('btn-reweak').onclick = () => {
          Study.start({
            words: weak,
            title: '再背弱项',
            onDone: () => this.renderHome()
          });
        };
      }
    },

    // ---------------- 已学单词 ----------------
    // 记忆程度：结合掌握阶段 level 与健康分 ease
    wordStrength(rec) {
      if (rec.mastered) return { pct: 100, label: '已掌握', cls: 't-mastered' };
      const base = rec.level / SRS.MAX_LEVEL;               // 0~1
      const ea = ((rec.ease || 1) - 0.6) / (1.6 - 0.6);      // 0~1
      const pct = Math.max(6, Math.round((base * 0.75 + ea * 0.25) * 100));
      let label, cls;
      if (rec.level >= 4) { label = '熟悉'; cls = 't-familiar'; }
      else if (rec.level >= 2) { label = '巩固中'; cls = 't-mid'; }
      else { label = '生疏'; cls = 't-weak'; }
      return { pct, label, cls };
    },

    renderLearned() {
      this.show('screen-learned');
      if (this._learnedSort === undefined) this._learnedSort = 'weak';
      const recs = Store.all();

      if (!recs.length) {
        document.getElementById('learned-body').innerHTML =
          '<div class="empty">还没有学过的单词。<br>回首页「开始学新」吧～</div>';
        return;
      }

      const strengthVal = r => r.mastered ? 999 : r.level * 100 + Math.round((r.ease || 1) * 10);
      const sort = this._learnedSort;
      const sorted = recs.slice().sort((a, b) => {
        if (sort === 'weak') return strengthVal(a) - strengthVal(b);
        if (sort === 'strong') return strengthVal(b) - strengthVal(a);
        if (sort === 'recent') return (b.firstLearned || '').localeCompare(a.firstLearned || '');
        return a.word.toLowerCase().localeCompare(b.word.toLowerCase()); // alpha
      });

      const rows = sorted.map(r => {
        const w = this.bankMap[r.word.toLowerCase()] || { word: r.word, meaning: '', tier: 0 };
        const s = this.wordStrength(r);
        const next = r.mastered ? '已掌握' : (r.nextReview ? ('下次 ' + r.nextReview.slice(5)) : '');
        return `<div class="lw-row" data-word="${r.word}">
          <div class="lw-main">
            <div class="lw-top">
              <span class="lw-word">${w.word}</span>
              ${w.tier ? `<span class="tier-badge ${TIER_CLASS[w.tier]}">${TIER_LABEL[w.tier]}</span>` : ''}
            </div>
            <div class="lw-mean muted hidden">${(w.meaning || '').replace(/\n/g, ' / ')}</div>
          </div>
          <div class="lw-strength">
            <div class="strength-bar"><div class="strength-fill ${s.cls}" style="width:${s.pct}%"></div></div>
            <span class="lw-label ${s.cls}">${s.label}</span>
            <span class="lw-next muted">${next}</span>
          </div>
        </div>`;
      }).join('');

      document.getElementById('learned-body').innerHTML = `
        <div class="lw-toolbar">
          <span class="muted">共 ${recs.length} 词 · 👆点行看释义/发音</span>
          <select id="learned-sort">
            <option value="weak" ${sort === 'weak' ? 'selected' : ''}>记忆最弱优先</option>
            <option value="strong" ${sort === 'strong' ? 'selected' : ''}>最熟练优先</option>
            <option value="recent" ${sort === 'recent' ? 'selected' : ''}>最近学的</option>
            <option value="alpha" ${sort === 'alpha' ? 'selected' : ''}>字母顺序</option>
          </select>
        </div>
        <div class="lw-list">${rows}</div>`;

      document.getElementById('learned-sort').onchange = (e) => {
        this._learnedSort = e.target.value;
        this.renderLearned();
      };
      document.querySelectorAll('.lw-row').forEach(el => {
        el.onclick = () => {
          const m = el.querySelector('.lw-mean');
          if (m) m.classList.toggle('hidden');
          Speech.speak(el.dataset.word);
        };
      });
    },

    // ---------------- 统计 / 学习日历 ----------------
    renderStats() {
      this.show('screen-stats');
      const learned = Store.count();
      const mastered = Store.masteredCount();
      const streak = Store.streak();
      let totalReviewed = 0, activeDays = 0;
      Object.keys(Store.activity).forEach(d => {
        const a = Store.activity[d];
        totalReviewed += (a.reviewed || 0);
        if ((a.learned || 0) + (a.reviewed || 0) > 0) activeDays++;
      });

      // 分级掌握情况（已学词按 tier 统计）
      const tierStat = { 1: [0, 0], 2: [0, 0], 3: [0, 0], 4: [0, 0] }; // tier -> [已学, 已掌握]
      Store.all().forEach(r => {
        const w = this.bankMap[r.word.toLowerCase()];
        const t = (w && w.tier) || 4;
        tierStat[t][0]++;
        if (r.mastered) tierStat[t][1]++;
      });
      const tierRows = [1, 2, 3, 4].map(t => {
        const [ln, ms] = tierStat[t];
        const pct = ln ? Math.round(ms / ln * 100) : 0;
        return `<div class="tier-row">
          <span class="tier-badge ${TIER_CLASS[t]}">${TIER_LABEL[t]}</span>
          <div class="tier-bar"><div class="tier-fill ${TIER_CLASS[t]}" style="width:${pct}%"></div></div>
          <span class="muted">${ms}/${ln}</span>
        </div>`;
      }).join('');

      document.getElementById('stats-body').innerHTML = `
        <div class="stat-bar">
          <div><b>🔥 ${streak}</b><span>连续天数</span></div>
          <div><b>${learned}</b><span>累计学习</span></div>
          <div><b>${mastered}</b><span>已掌握</span></div>
          <div><b>${totalReviewed}</b><span>累计复习</span></div>
        </div>

        <div class="card">
          <div class="hc-title">学习日历</div>
          <div class="hc-sub muted">最近 18 周 · 共 ${activeDays} 天有学习</div>
          <div class="cal-wrap"><div class="cal-grid">${this.calendarCells()}</div></div>
          <div class="cal-legend"><span>少</span>
            <i class="cal-cell lvl0"></i><i class="cal-cell lvl1"></i><i class="cal-cell lvl2"></i><i class="cal-cell lvl3"></i><i class="cal-cell lvl4"></i>
            <span>多</span></div>
        </div>

        <div class="card">
          <div class="hc-title">分级掌握度</div>
          ${tierRows}
        </div>`;
    },

    calendarCells() {
      const pad = x => String(x).padStart(2, '0');
      const fmt = dt => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
      const dayMs = 86400000;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const weeks = 18;
      // 结束于本周六，起点回退到 weeks 周前的周日
      const end = new Date(today.getTime() + (6 - today.getDay()) * dayMs);
      const start = new Date(end.getTime() - (weeks * 7 - 1) * dayMs);
      let cells = '';
      for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
        const dt = new Date(t);
        const key = fmt(dt);
        const a = Store.activity[key];
        const total = a ? (a.learned || 0) + (a.reviewed || 0) : 0;
        const future = dt.getTime() > today.getTime();
        let lvl = 0;
        if (total >= 20) lvl = 4; else if (total >= 10) lvl = 3; else if (total >= 4) lvl = 2; else if (total >= 1) lvl = 1;
        const title = future ? key : `${key}　学${a ? a.learned || 0 : 0} / 复${a ? a.reviewed || 0 : 0}`;
        cells += `<span class="cal-cell lvl${lvl}${future ? ' future' : ''}" title="${title}"></span>`;
      }
      return cells;
    },

    // ---------------- 设置 ----------------
    renderSettings() {
      this.show('screen-settings');
      const s = Store.settings;
      document.getElementById('settings-body').innerHTML = `
        <div class="card">
          <div class="row"><label>发音口音</label>
            <select id="set-accent">
              <option value="us" ${s.accent === 'us' ? 'selected' : ''}>美式 (en-US)</option>
              <option value="uk" ${s.accent === 'uk' ? 'selected' : ''}>英式 (en-GB)</option>
            </select>
          </div>
          <div class="row"><label>每日复习上限（0=不限）</label>
            <input type="number" id="set-cap" min="0" value="${s.dailyReviewCap}" />
          </div>
          <div class="row"><label>学习顺序</label>
            <select id="set-order">
              <option value="smart" ${s.orderMode === 'smart' ? 'selected' : ''}>核心优先（高频词先学）</option>
              <option value="shuffle" ${s.orderMode === 'shuffle' ? 'selected' : ''}>完全乱序</option>
              <option value="alpha" ${s.orderMode === 'alpha' ? 'selected' : ''}>字母顺序</option>
            </select>
          </div>
          <button class="btn tiny ghost" id="set-test">🔊 试听发音</button>
        </div>

        <div class="card">
          <div class="hc-title">数据备份</div>
          <div class="hc-sub muted">记录存在本机浏览器里，清缓存会丢。建议定期导出保存。</div>
          <button class="btn ok block" id="btn-export">⬇️ 导出备份文件</button>
          <label class="btn ghost block" style="text-align:center;cursor:pointer;">
            ⬆️ 导入备份文件
            <input type="file" id="file-import" accept="application/json" style="display:none;" />
          </label>
        </div>

        <div class="card">
          <button class="btn bad block" id="btn-reset">⚠️ 清空所有学习记录</button>
        </div>

        <button class="btn primary block" id="btn-back">← 返回首页</button>`;

      const save = () => {
        s.accent = document.getElementById('set-accent').value;
        s.dailyReviewCap = Math.max(0, parseInt(document.getElementById('set-cap').value) || 0);
        s.orderMode = document.getElementById('set-order').value;
        Store.saveSettings();
      };
      document.getElementById('set-accent').onchange = save;
      document.getElementById('set-cap').onchange = save;
      document.getElementById('set-order').onchange = save;
      document.getElementById('set-test').onclick = () => { save(); Speech.speak('abandon'); };
      document.getElementById('btn-export').onclick = () => Store.exportBackup();
      document.getElementById('btn-back').onclick = () => { save(); this.renderHome(); };
      document.getElementById('btn-reset').onclick = () => {
        if (confirm('确定清空全部学习记录？此操作不可撤销（建议先导出备份）。')) {
          Store.records = {}; Store.activity = {};
          Store.saveRecords(); Store.saveActivity();
          this.renderHome();
        }
      };
      document.getElementById('file-import').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            Store.importBackup(JSON.parse(reader.result));
            alert('导入成功！');
            this.renderHome();
          } catch (err) { alert('导入失败：' + err.message); }
        };
        reader.readAsText(file);
      };
    },

    // 学新/复习页的返回键
    backHome() {
      Speech.cancel();
      if (confirm('确定退出？本次未完成的进度不会保存。')) this.renderHome();
    }
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => {
    App.init();
    const lb = document.getElementById('learn-back');
    if (lb) lb.onclick = () => App.backHome();
    const sb = document.getElementById('stats-back');
    if (sb) sb.onclick = () => App.renderHome();
    const lwb = document.getElementById('learned-back');
    if (lwb) lwb.onclick = () => App.renderHome();
  });
})();
