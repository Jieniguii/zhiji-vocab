// 今日复盘（列表式快刷）：把今天学的词一屏铺开，逐行扫。
// 点词行 = 显示/隐藏中文 + 发音；点右侧按钮 = 标记「没记住」。
// 完成时：所有词计一次接触；被标「没记住」的降 ease、计 lapse（后续刷得更勤）。不推进 SRS 阶段（保留明天复习）。
(function () {
  const Flip = {
    start(opts) {
      this.words = opts.words || [];
      this.onDone = opts.onDone || function () {};
      this.forgot = {}; // word(lowercase) -> true
      App.show('screen-learn');
      document.getElementById('learn-title').textContent = '今日复盘 · 快刷';
      this.render();
    },

    render() {
      document.getElementById('learn-progress').textContent = `${this.words.length} 词`;
      const rows = this.words.map((w, i) => {
        const flagged = this.forgot[w.word.toLowerCase()];
        return `<div class="lw-row qf-row ${flagged ? 'forgot' : ''}" data-i="${i}">
          <div class="lw-main">
            <div class="lw-top">
              <span class="lw-word">${w.word}</span>
              <span class="qf-ph muted">${w.phonetic ? '/' + w.phonetic + '/' : ''}</span>
              ${w.tier ? `<span class="tier-badge ${TIER_CLASS[w.tier]}">${TIER_LABEL[w.tier]}</span>` : ''}
            </div>
            <div class="lw-mean muted hidden">${(w.meaning || '').replace(/\n/g, ' / ')}</div>
          </div>
          <button class="qf-mark ${flagged ? 'forgot' : ''}" data-mark="${i}">${flagged ? '没记住' : '记得'}</button>
        </div>`;
      }).join('');

      document.getElementById('learn-body').innerHTML = `
        <div class="content summary">
          <div class="qf-tip muted">👆 点单词看中文/发音 · 想不起来的点右边「记得」标成「没记住」</div>
          <div class="lw-list">${rows}</div>
        </div>
        <div class="action-bar">
          <button class="btn primary block" data-a="done">完成复盘 →</button>
        </div>`;

      // 点整行：翻中文 + 发音
      document.querySelectorAll('.qf-row').forEach(row => {
        row.onclick = () => {
          const w = this.words[+row.dataset.i];
          const m = row.querySelector('.lw-mean');
          if (m) m.classList.toggle('hidden');
          Speech.speak(w.word);
        };
      });
      // 点标记按钮：切换「没记住」（阻止冒泡到整行）
      document.querySelectorAll('.qf-mark').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const w = this.words[+btn.dataset.mark];
          const k = w.word.toLowerCase();
          if (this.forgot[k]) delete this.forgot[k]; else this.forgot[k] = true;
          const flagged = !!this.forgot[k];
          btn.classList.toggle('forgot', flagged);
          btn.textContent = flagged ? '没记住' : '记得';
          btn.closest('.qf-row').classList.toggle('forgot', flagged);
        };
      });
      document.querySelector('[data-a="done"]').onclick = () => this.finish();
    },

    finish() {
      Speech.cancel();
      const forgotWords = Object.keys(this.forgot);
      // 没记住的词：降 ease、计 lapse（保留明天正常复习，不动 level/nextReview）
      forgotWords.forEach(k => {
        const rec = Store.records[k];
        if (rec && !rec.mastered) {
          rec.ease = Math.max(0.6, +(rec.ease - 0.1).toFixed(2));
          rec.lapses = (rec.lapses || 0) + 1;
        }
      });
      Store.saveRecords();
      Store.bumpActivity('reviewed', this.words.length);

      document.getElementById('learn-body').innerHTML = `
        <div class="content summary">
          <div class="group-done">✅ 今日复盘完成！</div>
          <div class="sum-rate">共 ${this.words.length} 词 · 没记住 ${forgotWords.length}</div>
          <div class="hint">${forgotWords.length ? '没记住的词已自动加密复习频率' : '全都记得，稳！'}</div>
        </div>
        <div class="action-bar">
          <button class="btn primary block" data-a="home">🏠 返回首页</button>
        </div>`;
      document.querySelector('[data-a="home"]').onclick = () => this.onDone();
    }
  };

  window.Flip = Flip;
})();
