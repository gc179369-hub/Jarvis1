// ============================================================
//  TTS local de reserva (Web Speech API)
//  Usado apenas quando o Gemini Live está offline (ex.: Modo Mega
//  Brian sem conexão). A voz principal vem do Gemini (áudio nativo).
// ============================================================

export class Speaker {
  private voice: SpeechSynthesisVoice | null = null;
  lang = "pt-BR";
  private active = 0;
  /** Disparado quando a síntese começa / quando termina (onend) */
  onStart?: () => void;
  onEnd?: () => void;

  get supported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  constructor() {
    if (!this.supported) return;
    const load = () => {
      const all = speechSynthesis.getVoices();
      const pt = all.filter((v) => v.lang?.toLowerCase().startsWith(this.lang.toLowerCase().slice(0, 2)));
      this.voice =
        pt.find((v) => /natural|neural|online/i.test(v.name) && v.lang.toLowerCase().includes(this.lang.toLowerCase().slice(3))) ||
        pt.find((v) => /natural|neural|google/i.test(v.name)) ||
        pt[0] ||
        null;
    };
    load();
    speechSynthesis.addEventListener?.("voiceschanged", load);
  }

  setLang(lang: string) {
    this.lang = lang;
  }

  speak(text: string): Promise<void> {
    if (!this.supported || !text.trim()) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.voice?.lang || this.lang;
      if (this.voice) u.voice = this.voice;
      u.rate = 1.1;
      u.pitch = 0.9;
      let done = false;
      const fin = () => {
        if (!done) {
          done = true;
          this.active = Math.max(0, this.active - 1);
          if (this.active === 0) this.onEnd?.();
          resolve();
        }
      };
      this.active++;
      if (this.active === 1) this.onStart?.();
      u.onend = fin;
      u.onerror = fin;
      speechSynthesis.speak(u);
      setTimeout(fin, 3000 + text.length * 110);
    });
  }

  cancel() {
    if (!this.supported) return;
    speechSynthesis.cancel();
    if (this.active) {
      this.active = 0;
      this.onEnd?.();
    }
  }

  unlock() {
    if (!this.supported) return;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}
