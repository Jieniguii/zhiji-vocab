// 语音封装：默认美式发音，可在设置里切换英式
// 注意：Web Speech API 在不同系统/浏览器上语音可用性不同；iOS 首次需用户手势触发。
(function () {
  const Speech = {
    voices: [],
    ready: false,

    init() {
      if (!('speechSynthesis' in window)) {
        this.ready = false;
        return;
      }
      const load = () => {
        this.voices = window.speechSynthesis.getVoices() || [];
        this.ready = this.voices.length > 0;
      };
      load();
      // 语音表常常异步加载，监听一次
      window.speechSynthesis.onvoiceschanged = load;
    },

    supported() {
      return 'speechSynthesis' in window;
    },

    // 按文字自动判断语言：有假名或纯汉字 → 日语；否则英语
    detectLang(text) {
      if (/[぀-ヿㇰ-ㇿ]/.test(text)) return 'ja';                 // 平/片假名
      if (/[㐀-鿿豈-﫿]/.test(text) && !/[a-zA-Z]/.test(text)) return 'ja'; // 纯汉字（本应用无中文正面词库）
      return 'en';
    },

    // 按语言代码挑语音
    pickVoiceFor(langCode) {
      const base = langCode.split('-')[0];
      return this.voiceForBase(base);
    },
    voiceForBase(base) {
      if (!this.voices.length) this.voices = window.speechSynthesis.getVoices() || [];
      return this.voices.find(x => (x.lang || '').replace('_', '-').toLowerCase().startsWith(base)) || null;
    },
    // 系统是否装了某语言的语音
    hasVoiceFor(base) {
      return !!this.voiceForBase(base);
    },

    // ---- 日语内置音频兜底（系统无日语语音时用预生成的 mp3）----
    wordHash(s) { // 与 tools_gen_ja_audio.js 保持一致（djb2 + fnv1a 双哈希，36进制）
      let h1 = 5381, h2 = 2166136261;
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = ((h1 << 5) + h1 + c) >>> 0;
        h2 = ((h2 ^ c) * 16777619) >>> 0;
      }
      return h1.toString(36) + h2.toString(36);
    },
    hasJaAudio(word) {
      return !!(window.JA_AUDIO && window.JA_AUDIO[this.wordHash(word)]);
    },
    playJaAudio(word) {
      if (!this.hasJaAudio(word)) return false;
      try {
        if (this._audio) { this._audio.pause(); }
        this._audio = new Audio('audio/ja/h' + this.wordHash(word) + '.mp3');
        this._audio.play().catch(function () {});
        return true;
      } catch (e) { return false; }
    },

    // 朗读单词/句子（自动识别中英日语言）
    speak(text, opts) {
      if (!this.supported() || !text) return;
      opts = opts || {};
      try {
        let langCode, voice;
        if (this.detectLang(text) === 'ja') {
          voice = this.voiceForBase('ja');
          if (!voice) {
            // 没装日语语音：先试内置音频；再不行宁可不发声，也不用中文嗓音乱读
            this.playJaAudio(text);
            return;
          }
          langCode = 'ja-JP';
        } else {
          const accent = (window.Store && Store.settings.accent) || 'us';
          langCode = accent === 'uk' ? 'en-GB' : 'en-US';
          voice = this.pickVoiceFor(langCode);
        }
        const u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.lang = langCode;
        u.rate = opts.rate || 0.9;
        u.pitch = 1;
        window.speechSynthesis.speak(u);
      } catch (e) {
        console.warn('speak failed', e);
      }
    },

    // 读单词两遍（学新时用）
    speakWordTwice(word) {
      if (!this.supported()) return;
      window.speechSynthesis.cancel();
      this.speak(word, { rate: 0.85 });
      setTimeout(() => this.speak(word, { rate: 0.8 }), 900);
    },

    cancel() {
      if (this.supported()) window.speechSynthesis.cancel();
      if (this._audio) { try { this._audio.pause(); } catch (e) {} this._audio = null; }
    }
  };

  window.Speech = Speech;
})();
