// 复习引擎：答后即验。
// 流程：显示英文 → 先判定(认识/忘记，不给偷看) → 立刻亮出中文核对 → 确认或改判 → 下一个。
// SRS 只在最终确认时结算，戳破"眼熟假象"。× 的词最后当新词重学一遍。
(function () {
  const Review = {
    start(opts) {
      this.items = opts.items || []; // [{ rec, word(wordObj) }]
      this.onDone = opts.onDone || function () {};
      this.i = 0;
      this.phase = 'judge';   // judge(判定) | verify(核对)
      this.choice = null;     // 'known' | 'forgot' 暂定判断
      this.relearn = [];      // 忘记的 wordObj，稍后重学
      this.stats = { known: 0, forgot: 0 };
      this.undoState = null;

      App.show('screen-learn');
      document.getElementById('learn-title').textContent = '复习';
      this.render();
    },

    render() {
      if (this.i >= this.items.length) return this.afterList();
      const it = this.items[this.i];
      const w = it.word;
      Speech.speak(w.word);
      document.getElementById('learn-progress').textContent = `${this.i + 1}/${this.items.length}`;

      const body = document.getElementById('learn-body');
      const verify = this.phase === 'verify';

      const meaningBlock = `
        <div class="meaning ${verify ? '' : 'hidden'}">
          <div class="mean-cn">${w.meaning}</div>
          ${w.example ? `<div class="example">${w.example}<br><span class="ex-cn">${w.exampleCn || ''}</span></div>` : ''}
        </div>`;

      let hint, controls;
      if (!verify) {
        hint = '先在心里回忆中文，再判定（想不起来就点 ❌）';
        controls = `
          <div class="judge">
            <button class="btn ok"  data-act="known">✅ 认识</button>
            <button class="btn bad" data-act="forgot">❌ 忘记</button>
          </div>
          ${this.i > 0 ? '<div class="sub-actions"><button class="btn tiny" data-act="undo">↩ 上一个</button></div>' : ''}`;
      } else {
        // 核对：亮出答案，让学生确认或改判
        if (this.choice === 'known') {
          hint = '你选了「认识」——对上了吗？';
          controls = `
            <div class="judge">
              <button class="btn ok"  data-act="fin-known">✅ 确实记得 · 下一个</button>
              <button class="btn bad" data-act="fin-forgot">🤔 其实没想起 · 算忘记</button>
            </div>`;
        } else {
          hint = '你选了「忘记」——看一遍加深印象';
          controls = `
            <div class="judge">
              <button class="btn bad" data-act="fin-forgot">❌ 确实没记住 · 下一个</button>
              <button class="btn ok"  data-act="fin-known">😃 其实想起了 · 算认识</button>
            </div>`;
        }
      }

      body.innerHTML = `
        <div class="content">
          <div class="card" id="word-card">
            <div class="word">${w.word}</div>
            <div class="phonetic">${w.phonetic ? '/' + w.phonetic + '/' : ''}
              ${w.tier ? `<span class="tier-badge ${TIER_CLASS[w.tier]}">${TIER_LABEL[w.tier]}</span>` : ''}</div>
            ${meaningBlock}
          </div>
        </div>
        <div class="action-bar">
          <div class="hint">${hint}</div>
          <div class="controls">${controls}</div>
        </div>`;

      body.querySelectorAll('[data-act]').forEach(el => {
        el.onclick = () => this.act(el.dataset.act);
      });
      if (!verify) this.attachSwipe(); // 只有判定阶段能滑动
    },

    act(a) {
      if (a === 'undo') { this.doUndo(); return; }
      // 判定阶段：先暂定，进入核对
      if (a === 'known' || a === 'forgot') { this.choice = a; this.phase = 'verify'; this.render(); return; }
      // 核对阶段：最终结算
      if (a === 'fin-known') { this.finalize('known'); return; }
      if (a === 'fin-forgot') { this.finalize('forgot'); return; }
    },

    finalize(judgment) {
      const it = this.items[this.i];
      // 撤销点：保存这条记录的原始快照
      this.undoState = {
        i: this.i,
        recSnap: JSON.stringify(it.rec),
        stats: Object.assign({}, this.stats),
        relearnLen: this.relearn.length
      };
      if (judgment === 'known') {
        SRS.onKnow(it.rec);
        this.stats.known++;
      } else {
        SRS.onForget(it.rec);
        this.stats.forgot++;
        this.relearn.push(it.word);
      }
      Store.put(it.rec);
      Store.bumpActivity('reviewed', 1);
      this.i++;
      this.phase = 'judge';
      this.choice = null;
      this.render();
    },

    doUndo() {
      if (!this.undoState) return;
      const u = this.undoState;
      const it = this.items[u.i];
      it.rec = JSON.parse(u.recSnap);
      Store.put(it.rec);
      Store.bumpActivity('reviewed', -1); // 撤销上一次计数
      this.stats = u.stats;
      this.relearn.length = u.relearnLen;
      this.i = u.i;
      this.phase = 'judge';
      this.choice = null;
      this.undoState = null;
      this.render();
    },

    afterList() {
      Speech.cancel();
      const body = document.getElementById('learn-body');
      if (this.relearn.length === 0) {
        this.finish();
        return;
      }
      body.innerHTML = `
        <div class="content summary">
          <div class="group-done">这一轮复习完成！</div>
          <div class="sum-rate">认识 ${this.stats.known}　忘记 ${this.stats.forgot}</div>
          <div class="hint">有 ${this.relearn.length} 个忘记的词，现在像学新词一样重新过一遍 👇</div>
        </div>
        <div class="action-bar">
          <button class="btn primary block" data-act="relearn">开始重学 (${this.relearn.length}) →</button>
          <button class="btn ghost block" data-act="skip">跳过，直接结束</button>
        </div>`;
      body.querySelector('[data-act="relearn"]').onclick = () => {
        Study.start({
          words: this.relearn,
          title: '重学（复习忘记的词）',
          onDone: () => this.finish()
        });
      };
      body.querySelector('[data-act="skip"]').onclick = () => this.finish();
    },

    finish() {
      Speech.cancel();
      this.onDone(this.stats);
    },

    attachSwipe() {
      const card = document.getElementById('word-card');
      if (!card) return;
      let sx = 0, sy = 0, dragging = false;
      const move = e => { if (!dragging) return; const p = e.touches ? e.touches[0] : e; card.style.transform = `translate(${p.clientX - sx}px, ${p.clientY - sy}px)`; };
      const end = e => {
        if (!dragging) return; dragging = false;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', end);
        const p = e.changedTouches ? e.changedTouches[0] : e;
        const dx = p.clientX - sx, dy = p.clientY - sy;
        card.style.transform = '';
        if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) {
          this.act(dy < 0 ? 'known' : 'forgot');
        }
      };
      const start = e => {
        const p = e.touches ? e.touches[0] : e; sx = p.clientX; sy = p.clientY; dragging = true;
        if (!e.touches) { window.addEventListener('mousemove', move); window.addEventListener('mouseup', end); }
      };
      card.addEventListener('touchstart', start, { passive: true });
      card.addEventListener('touchmove', move, { passive: true });
      card.addEventListener('touchend', end);
      card.addEventListener('mousedown', start);
    }
  };

  window.Review = Review;
})();
