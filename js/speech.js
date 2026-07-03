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

    // 朗读单词/句子（自动识别中英日语言）
    speak(text, opts) {
      if (!this.supported() || !text) return;
      opts = opts || {};
      try {
        let langCode, voice;
        if (this.detectLang(text) === 'ja') {
          voice = this.voiceForBase('ja');
          // 没装日语语音时宁可不发声，也不要用中文嗓音把汉字读成中文
          if (!voice) return;
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
    }
  };

  window.Speech = Speech;
})();
