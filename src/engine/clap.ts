// ============================================================
//  Detector de Palmas Duplas — Web Audio API + AnalyserNode
//  Acopla-se ao MESMO stream de microfone usado pelo Gemini Live
//  (evita conflito de microfone em Android).
//  Heurística: transiente abrupto + energia em agudos + decaimento
//  rápido. Duas palmas no intervalo [minGap, maxGap] => evento.
// ============================================================
import { CLAP } from "../config";

export class ClapDetector {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(0));
  private freqBuf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
  private timer: number | null = null;
  private lastTransient = 0;
  private lastClap = 0;
  private lastDouble = 0;
  private candidate: { t: number; rms: number } | null = null;

  noise = 0.01;
  sensitivity = 0.6;
  enabled = true;
  /** Multiplica o limiar (ex.: enquanto o Jarvis fala ou a música toca) */
  thresholdBoost = 1;
  /** Nível do microfone suavizado 0..1 (visual) */
  level = 0;

  onClap?: () => void;
  onDoubleClap?: () => void;
  /** Chamado a cada ~16ms com RMS e ruído de fundo (usado no barge-in local) */
  onTick?: (rms: number, noise: number) => void;

  attach(ctx: AudioContext, source: AudioNode) {
    this.detach();
    this.ctx = ctx;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.2;
    source.connect(an);
    this.analyser = an;
    this.timeBuf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
    this.freqBuf = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
    // setInterval continua ativo mesmo quando o rAF é limitado
    this.timer = window.setInterval(() => this.analyse(), 16);
  }

  detach() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.analyser?.disconnect();
    } catch {
      /* */
    }
    this.analyser = null;
    this.level = 0;
  }

  private analyse() {
    const an = this.analyser;
    if (!an || !this.ctx) return;
    an.getFloatTimeDomainData(this.timeBuf);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = this.timeBuf[i];
      const a = v < 0 ? -v : v;
      if (a > peak) peak = a;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeBuf.length);
    const target = Math.min(1, rms * 9);
    this.level += (target - this.level) * (target > this.level ? 0.5 : 0.12);
    this.onTick?.(rms, this.noise);

    const now = performance.now();

    // Confirma candidato: a palma decai rápido (< ~100ms); a voz não
    if (this.candidate && now - this.candidate.t > 90) {
      const c = this.candidate;
      this.candidate = null;
      if (rms < c.rms * 0.45) this.registerClap(c.t);
    }

    if (!this.enabled) {
      this.noise = this.noise * 0.98 + rms * 0.02;
      return;
    }

    const s = Math.min(1, Math.max(0, this.sensitivity));
    const absThreshold = (0.55 - s * 0.4) * this.thresholdBoost; // 0.15..0.55
    const ratioThreshold = (7 - s * 3.5) * this.thresholdBoost; // 3.5..7
    const isTransient = peak > absThreshold && rms > this.noise * ratioThreshold && now - this.lastTransient > 110;

    if (isTransient) {
      an.getByteFrequencyData(this.freqBuf);
      const nyq = this.ctx.sampleRate / 2;
      const cut = Math.floor((2500 / nyq) * this.freqBuf.length);
      let hi = 0;
      let tot = 0;
      for (let i = 2; i < this.freqBuf.length; i++) {
        tot += this.freqBuf[i];
        if (i >= cut) hi += this.freqBuf[i];
      }
      this.lastTransient = now;
      if (tot > 0 && hi / tot > 0.28) this.candidate = { t: now, rms };
    } else {
      this.noise = Math.max(0.002, this.noise * 0.985 + rms * 0.015);
    }
  }

  private registerClap(t: number) {
    this.onClap?.();
    const gap = t - this.lastClap;
    if (gap >= CLAP.minGapMs && gap <= CLAP.maxGapMs && t - this.lastDouble > CLAP.cooldownMs) {
      this.lastDouble = t;
      this.lastClap = 0;
      this.onDoubleClap?.();
      return;
    }
    this.lastClap = t;
  }
}
