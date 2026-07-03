// 学新引擎：状态机 + 链式回顾 + 错词捆绑
// 用法：Study.start({ words:[...], title:'学新', onDone: fn(resultsMap) })
(function () {
  // 链式回顾序列（组内 1-based 位置），第5词按设计特殊处理
  const CHAINS = {
    1: [1],
    2: [2, 1],
    3: [3, 2, 1, 2, 3],
    4: [4, 3, 2, 1, 2, 3, 4],
    5: [5, 4, 5, 1, 2, 3, 2, 1]
  };
  const GROUP_SIZE = 5;
  const MAX_TRIES = 6; // 安全上限：模糊/忘记最多重学这么多次，防止一直卡在一个词

  const Study = {
    start(opts) {
      this.words = opts.words || [];
      this.title = opts.title || '学新';
      this.onDone = opts.onDone || function () {};
      this.results = {}; // word -> 'known' | 'vague' | 'forgot'

      // 分组，每组最多5个
      this.groups = [];
      for (let i = 0; i < this.words.length; i += GROUP_SIZE) {
        this.groups.push(this.words.slice(i, i + GROUP_SIZE));
      }
      this.gi = 0;
      this.snapshot = null;

      App.show('screen-learn');
      document.getElementById('learn-title').textContent = this.title;
      this.startGroup(0);
    },

    startGroup(gi) {
      this.gi = gi;
      this.group = this.groups[gi];
      this.learnedCount = 0;   // 本组已学完的词数（驱动链式回顾）
      this.phase = 'learn';
      this.step = 'show';
      this.tries = 0;
      this.worst = 'known';
      this.relearning = false;
      this.renderLearn();
    },

    curWord() { return this.group[this.learnedCount]; },

    // ---------- 快照/撤销（防手滑） ----------
    takeSnapshot() {
      this.snapshot = JSON.stringify({
        gi: this.gi, learnedCount: this.learnedCount, phase: this.phase,
        step: this.step, tries: this.tries, worst: this.worst,
        chain: this.chain, ci: this.ci, results: this.results
      });
    },
    undo() {
      if (!this.snapshot) return;
      const s = JSON.parse(this.snapshot);
      Object.assign(this, s);
      this.group = this.groups[this.gi];
      this.snapshot = null;
      Speech.cancel();
      if (this.phase === 'learn') this.renderLearn();
      else this.renderChain();
    },

    // ---------- 顶部：组进度 + 单词小卡片 ----------
    progressBar() {
      const total = this.words.length;
      let done = this.gi * GROUP_SIZE + this.learnedCount;
      document.getElementById('learn-progress').textContent =
        `组 ${this.gi + 1}/${this.groups.length}　${done}/${total}`;
    },

    // 竖排单词列表：当前词高亮放大展开，已学的缩小带状态，未学的用 ••• 遮住
    wordListHtml(activeIdx, showMeaning, withExample) {
      return this.group.map((w, i) => {
        if (i === activeIdx) {
          return `<div class="wl-item active" id="learn-card">
            <div class="word">${w.word}</div>
            <div class="phonetic">${w.phonetic ? '/' + w.phonetic + '/' : ''}
              ${w.tier ? `<span class="tier-badge ${TIER_CLASS[w.tier]}">${TIER_LABEL[w.tier]}</span>` : ''}</div>
            <div class="meaning ${showMeaning ? '' : 'hidden'}">
              <div class="mean-cn">${w.meaning}</div>
              ${withExample && w.example ? `<div class="example">${w.example}<br><span class="ex-cn">${w.exampleCn || ''}</span></div>` : ''}
            </div>
          </div>`;
        }
        if (i < this.learnedCount) {
          const r = this.results[w.word.toLowerCase()];
          const st = r ? r.status : 'known';
          const icon = st === 'known' ? '✅' : st === 'vague' ? '⚠️' : '❌';
          return `<div class="wl-item done"><span class="wl-word-sm">${w.word}</span><span class="wl-icon">${icon}</span></div>`;
        }
        return `<div class="wl-item upcoming"><span class="wl-word-sm">• • •</span></div>`;
      }).join('');
    },

    // ---------- 学新单词流程 ----------
    renderLearn() {
      this.progressBar();
      const w = this.curWord();
      const showMeaning = this.step === 'meaning';
      const body = document.getElementById('learn-body');

      let controls = '';
      if (this.step === 'show') {
        Speech.speakWordTwice(w.word);
        controls = `
          <button class="btn ghost" data-act="listen">🔊 再听一遍</button>
          <button class="btn primary" data-act="reveal">看释义 →</button>`;
      } else if (this.step === 'meaning') {
        if (this.relearning) Speech.speakWordTwice(w.word); else Speech.speak(w.word);
        controls = `
          ${this.relearning ? '<div class="hint">🔁 没记住，重学一遍：跟读【英文 ×2 + 中文】，再自测</div>' : ''}
          <button class="btn ghost" data-act="listen">🔊 再听</button>
          <button class="btn primary" data-act="toTest">关闭释义，自测 →</button>`;
      } else { // test
        controls = `
          <div class="hint">${this.relearning ? '再测一次：' : ''}默读出【英文 + 中文】，再判定：</div>
          <div class="judge">
            <button class="btn ok"   data-act="known">✅ 认识</button>
            <button class="btn warn" data-act="vague">⚠️ 模糊</button>
            <button class="btn bad"  data-act="forgot">❌ 忘记</button>
          </div>`;
      }

      body.innerHTML = `
        <div class="content">
          <div class="word-list">${this.wordListHtml(this.learnedCount, showMeaning, true)}</div>
        </div>
        <div class="action-bar">
          <div class="controls">${controls}</div>
          <div class="undo-row">${this.snapshot ? '<button class="btn tiny" data-act="undo">↩ 上一步（手滑撤销）</button>' : ''}</div>
        </div>
      `;
      this.bindLearn();
      this.attachSwipe();
    },

    bindLearn() {
      const body = document.getElementById('learn-body');
      body.querySelectorAll('[data-act]').forEach(el => {
        el.onclick = () => this.act(el.dataset.act);
      });
    },

    act(a) {
      const w = this.curWord();
      if (a === 'listen') { Speech.speakWordTwice(w.word); return; }
      if (a === 'undo') { this.undo(); return; }
      if (a === 'reveal') { this.step = 'meaning'; this.relearning = false; this.renderLearn(); return; }
      if (a === 'toTest') { this.step = 'test'; Speech.cancel(); this.renderLearn(); return; }

      if (a === 'known' || a === 'vague' || a === 'forgot') {
        this.takeSnapshot();
        if (a === 'known') {
          // 只有"认识"才放行；难度记为本词历史最差（挣扎过就算难词）
          this.finishWord(this.worst);
        } else {
          // 模糊/忘记：必须重学到"认识"才过（设安全上限防死循环）
          this.worst = (a === 'forgot') ? 'forgot' : (this.worst === 'forgot' ? 'forgot' : 'vague');
          this.tries++;
          if (this.tries >= MAX_TRIES) {
            this.finishWord(this.worst); // 反复记不住，先放行，交给复习/复盘
          } else {
            this.step = 'meaning';
            this.relearning = true;
            this.renderLearn();
          }
        }
      }
    },

    finishWord(status) {
      const w = this.curWord();
      // 取更差的结果
      const rank = { known: 0, vague: 1, forgot: 2 };
      const prev = this.results[w.word.toLowerCase()];
      if (!prev || rank[status] > rank[prev.status]) {
        this.results[w.word.toLowerCase()] = { word: w.word, status: status };
      }
      this.learnedCount++;
      this.startChain(this.learnedCount);
    },

    // ---------- 链式回顾 ----------
    startChain(n) {
      const seq = CHAINS[n] || [1];
      this.chain = seq.map(p => p - 1); // 转 0-based
      this.ci = 0;
      this.phase = 'chain';
      this.renderChain();
    },

    renderChain(bundleNote) {
      this.progressBar();
      const pos = this.chain[this.ci];
      const w = this.group[pos];
      const body = document.getElementById('learn-body');
      Speech.speak(w.word);

      body.innerHTML = `
        <div class="content">
          <div class="badge-chain">🔗 回顾链 ${this.ci + 1}/${this.chain.length}${bundleNote ? '　' + bundleNote : ''}</div>
          <div class="word-list">${this.wordListHtml(pos, false, false)}</div>
        </div>
        <div class="action-bar">
          <div class="hint">快速说出【英文 + 中文】</div>
          <div class="controls">
            <div class="judge">
              <button class="btn ok"  data-act="cKnown">✅ 记得</button>
              <button class="btn bad" data-act="cForgot">❌ 忘了</button>
            </div>
            <button class="btn tiny ghost" data-act="cPeek">👁 看一眼释义</button>
          </div>
        </div>
      `;
      const b = document.getElementById('learn-body');
      b.querySelectorAll('[data-act]').forEach(el => {
        el.onclick = () => this.chainAct(el.dataset.act);
      });
      this.attachSwipe(true);
    },

    chainAct(a) {
      if (a === 'cPeek') {
        const m = document.querySelector('#learn-card .meaning');
        if (m) m.classList.toggle('hidden');
        return;
      }
      if (a === 'cKnown') { this.advanceChain(); return; }
      if (a === 'cNext') { this.advanceChain(); return; }
      if (a === 'cForgot') {
        // 回顾链忘了：有前词就直接触发错词捆绑；第一个词无前词可绑，则亮中文看一眼继续
        const pos = this.chain[this.ci];
        const w = this.group[pos];
        Speech.cancel();
        if (pos > 0) {
          this.runBundle(pos, pos - 1); // 直接进捆绑
        } else {
          Speech.speak(w.word, { rate: 0.85 });
          const m = document.querySelector('#learn-card .meaning');
          if (m) m.classList.remove('hidden');
          const controls = document.querySelector('#learn-body .controls');
          if (controls) {
            controls.innerHTML = '<button class="btn primary block" data-act="cNext">看过了 · 继续 →</button>';
            controls.querySelector('[data-act="cNext"]').onclick = () => this.advanceChain();
          }
        }
      }
    },

    // 错词捆绑：本词 ↔ 前词 交替快记 [cur,prev]×3，自动过、可跳过；结束后回到回顾链继续
    runBundle(cur, prev) {
      const seq = [cur, prev, cur, prev, cur, prev];
      let i = 0;
      const body = document.getElementById('learn-body');
      const stopAndGo = () => { clearTimeout(this.bundleTimer); this.advanceChain(); };
      const tick = () => {
        if (i >= seq.length) { this.advanceChain(); return; }
        const w = this.group[seq[i]];
        body.innerHTML = `
          <div class="content">
            <div class="badge-chain warn-bg">🧩 错词捆绑 ${i + 1}/${seq.length}</div>
            <div class="card" id="word-card">
              <div class="word">${w.word}</div>
              <div class="phonetic">${w.phonetic ? '/' + w.phonetic + '/' : ''}</div>
              <div class="meaning"><div class="mean-cn">${w.meaning}</div></div>
            </div>
          </div>
          <div class="action-bar">
            <div class="hint">交替快记，把这两个词绑在一起</div>
            <div class="controls"><button class="btn tiny ghost" data-act="skip">跳过 →</button></div>
          </div>`;
        const sk = body.querySelector('[data-act="skip"]');
        if (sk) sk.onclick = stopAndGo;
        Speech.speak(w.word, { rate: 0.9 });
        i++;
        this.bundleTimer = setTimeout(tick, 1200);
      };
      tick();
    },

    advanceChain() {
      this.ci++;
      if (this.ci >= this.chain.length) {
        // 本词的回顾结束
        if (this.learnedCount >= this.group.length) {
          this.renderGroupSummary();
        } else {
          this.phase = 'learn';
          this.step = 'show';
          this.tries = 0;
          this.worst = 'known';
          this.relearning = false;
          this.renderLearn();
        }
      } else {
        this.renderChain();
      }
    },

    // ---------- 组内总结 ----------
    renderGroupSummary() {
      Speech.cancel();
      const body = document.getElementById('learn-body');
      const rows = this.group.map(w => {
        const r = this.results[w.word.toLowerCase()];
        const st = r ? r.status : 'known';
        const icon = st === 'known' ? '✅' : st === 'vague' ? '⚠️' : '❌';
        const label = st === 'known' ? '认识' : st === 'vague' ? '模糊' : '忘记';
        return `<div class="sum-row ${st}"><span>${icon} ${w.word}</span><span>${label}</span></div>`;
      }).join('');
      const known = this.group.filter(w => (this.results[w.word.toLowerCase()] || {}).status === 'known' || !this.results[w.word.toLowerCase()]).length;
      const rate = Math.round(known / this.group.length * 100);
      const isLast = this.gi >= this.groups.length - 1;

      body.innerHTML = `
        <div class="content summary">
          <div class="group-done">第 ${this.gi + 1} 组 完成 🎉</div>
          <div class="sum-list">${rows}</div>
          <div class="sum-rate">本组掌握率 ${rate}%</div>
        </div>
        <div class="action-bar">
          <button class="btn primary block" data-act="next">${isLast ? '查看今日总结 →' : '继续下一组 →'}</button>
        </div>`;
      body.querySelector('[data-act="next"]').onclick = () => {
        if (isLast) this.finish();
        else this.startGroup(this.gi + 1);
      };
    },

    finish() {
      Speech.cancel();
      this.onDone(this.results);
    },

    // ---------- 滑动手势（可选，桌面端也有按钮） ----------
    attachSwipe(isChain) {
      const card = document.getElementById('learn-card');
      if (!card) return;
      let sx = 0, sy = 0, dragging = false;
      const move = e => {
        if (!dragging) return;
        const p = e.touches ? e.touches[0] : e;
        card.style.transform = `translate(${p.clientX - sx}px, ${p.clientY - sy}px)`;
      };
      const end = e => {
        if (!dragging) return;
        dragging = false;
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', end);
        const p = e.changedTouches ? e.changedTouches[0] : e;
        const dx = p.clientX - sx, dy = p.clientY - sy;
        card.style.transform = '';
        const TH = 60;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > TH) {
          if (dy < 0) this[isChain ? 'chainAct' : 'act'](isChain ? 'cKnown' : 'known'); // 上滑=认识
          else this[isChain ? 'chainAct' : 'act'](isChain ? 'cForgot' : 'forgot');      // 下滑=忘记
        } else if (Math.abs(dx) > TH) {
          if (!isChain) this.act('vague'); // 左右=模糊（仅学新）
        }
      };
      const start = e => {
        const p = e.touches ? e.touches[0] : e;
        sx = p.clientX; sy = p.clientY; dragging = true;
        if (!e.touches) { // 鼠标：仅拖拽期间挂 window 监听，结束即移除，避免泄漏
          window.addEventListener('mousemove', move);
          window.addEventListener('mouseup', end);
        }
      };
      card.addEventListener('touchstart', start, { passive: true });
      card.addEventListener('touchmove', move, { passive: true });
      card.addEventListener('touchend', end);
      card.addEventListener('mousedown', start);
    }
  };

  window.Study = Study;
})();
