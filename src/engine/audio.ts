// ============================================================
//  AudioIO — pipeline de áudio bidirecional para o Gemini Live
//  • Captura: 1 stream de microfone → AudioWorklet → PCM16 16kHz (base64)
//             └→ ClapDetector (AnalyserNode) no mesmo stream
//  • Reprodução: PCM16 24kHz → fila sem lacunas (AudioBufferSourceNode)
//             com flush INSTANTÂNEO para interrupções (barge-in / palmas)
// ============================================================
import { GEMINI } from "../config";
import { ClapDetector } from "./clap";

const WORKLET_SRC = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(opts) {
    super();
    this.target = (opts.processorOptions && opts.processorOptions.target) || 16000;
    this.ratio = sampleRate / this.target;
    this.acc = 0; this.sum = 0; this.cnt = 0;
    this.size = Math.round(this.target * 0.064); // blocos de 64ms
    this.buf = new Int16Array(this.size); this.idx = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.cnt++; this.acc += 1;
      if (this.acc >= this.ratio) {
        this.acc -= this.ratio;
        let v = this.sum / this.cnt; this.sum = 0; this.cnt = 0;
        v = v > 1 ? 1 : v < -1 ? -1 : v;
        this.buf[this.idx++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        if (this.idx >= this.size) {
          this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
          this.buf = new Int16Array(this.size); this.idx = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

export function bytesToBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH) as unknown as number[]);
  }
  return btoa(bin);
}

function base64ToFloat32(b64: string) {
  const bin = atob(b64);
  const len = bin.length & ~1; // garante número par de bytes
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
  return f32;
}

export class AudioIO {
  ctx: AudioContext | null = null;
  clap = new ClapDetector();
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gate: GainNode | null = null; // porta anti-eco entre o mic e a captura/palmas
  private capture: AudioNode | null = null;
  private holders = new Set<string>();
  private releaseTimer: number | null = null;
  /** Atraso após o fim da fala antes de reabrir o mic (cauda de reverberação do alto-falante) */
  releaseMs = 250;
  /** true enquanto o microfone está silenciado pela guarda de eco */
  micMuted = false;
  onMicGate?: (muted: boolean) => void;
  private sink: GainNode | null = null;
  private outGain: GainNode | null = null;
  private outAnalyser: AnalyserNode | null = null;
  private outBuf: Float32Array<ArrayBuffer> = new Float32Array(new ArrayBuffer(0));
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  private starting: Promise<void> | null = null;
  playStartedAt = 0;

  /** PCM16 16kHz em base64 pronto para realtimeInput.audio */
  onChunk?: (b64: string) => void;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;

  ensureCtx() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: "interactive" });
      const out = this.ctx.createGain();
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      out.connect(an).connect(this.ctx.destination);
      this.outGain = out;
      this.outAnalyser = an;
      this.outBuf = new Float32Array(new ArrayBuffer(an.fftSize * 4));
      // iOS 17+: permite gravar e reproduzir simultaneamente
      try {
        const nav = navigator as any;
        if (nav.audioSession) nav.audioSession.type = "play-and-record";
      } catch {
        /* */
      }
    }
    return this.ctx;
  }

  get running() {
    return this.ctx?.state === "running";
  }

  async resume() {
    const ctx = this.ensureCtx();
    if (ctx.state !== "running") {
      try {
        await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 500))]);
      } catch {
        /* */
      }
    }
    return ctx.state === "running";
  }

  get micActive() {
    return !!this.stream;
  }

  startMic() {
    if (this.stream) return Promise.resolve();
    if (!this.starting) this.starting = this.doStartMic().finally(() => (this.starting = null));
    return this.starting;
  }

  private async doStartMic() {
    const ctx = this.ensureCtx();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true, // remove a voz do próprio Jarvis
        noiseSuppression: false, // manter transientes das palmas
        autoGainControl: false,
      },
    });
    this.stream = stream;
    const src = ctx.createMediaStreamSource(stream);
    this.source = src;
    this.sink = ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(ctx.destination);

    let node: AudioNode;
    try {
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      const w = new AudioWorkletNode(ctx, "pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        processorOptions: { target: GEMINI.inputRate },
      });
      w.port.onmessage = (e) => this.onChunk?.(bytesToBase64(e.data as ArrayBuffer));
      node = w;
    } catch {
      node = this.scriptProcessorFallback(ctx);
    }
    // mic → gate → (captura PCM, detector de palmas)
    const gate = ctx.createGain();
    gate.gain.value = this.micMuted ? 0 : 1;
    src.connect(gate);
    gate.connect(node);
    node.connect(this.sink); // precisa estar no grafo para ser processado
    this.gate = gate;
    this.capture = node;
    this.clap.attach(ctx, gate);
  }

  /** Fallback para navegadores sem AudioWorklet */
  private scriptProcessorFallback(ctx: AudioContext) {
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    const ratio = ctx.sampleRate / GEMINI.inputRate;
    let acc = 0;
    let sum = 0;
    let cnt = 0;
    sp.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0);
      const out = new Int16Array(Math.ceil(ch.length / ratio) + 2);
      let o = 0;
      for (let i = 0; i < ch.length; i++) {
        sum += ch[i];
        cnt++;
        acc += 1;
        if (acc >= ratio) {
          acc -= ratio;
          let v = sum / cnt;
          sum = 0;
          cnt = 0;
          v = Math.max(-1, Math.min(1, v));
          out[o++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        }
      }
      this.onChunk?.(bytesToBase64(out.slice(0, o).buffer));
    };
    return sp;
  }

  stopMic() {
    this.clap.detach();
    this.stream?.getTracks().forEach((t) => t.stop());
    try {
      this.source?.disconnect();
      this.gate?.disconnect();
      this.capture?.disconnect();
      this.sink?.disconnect();
    } catch {
      /* */
    }
    this.stream = null;
    this.source = null;
    this.capture = null;
  }

  /* ------------------------- Guarda de eco (half-duplex) ------------------------- */

  /**
   * Silencia a captura do microfone enquanto `who` estiver falando
   * (voz Gemini, speechSynthesis, música). Vários emissores podem segurar
   * a porta ao mesmo tempo; ela só reabre quando todos soltarem.
   */
  holdMic(who: string) {
    if (this.releaseTimer) {
      clearTimeout(this.releaseTimer);
      this.releaseTimer = null;
    }
    this.holders.add(who);
    this.setGate(true);
  }

  /** Solta a porta; reabre o mic após `releaseMs` (ou já, se `immediate`) se ninguém mais estiver falando */
  releaseMic(who: string, immediate = false) {
    this.holders.delete(who);
    if (this.holders.size) return;
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    if (immediate) {
      this.releaseTimer = null;
      this.setGate(false);
      return;
    }
    this.releaseTimer = window.setTimeout(() => {
      this.releaseTimer = null;
      if (!this.holders.size) this.setGate(false);
    }, this.releaseMs);
  }

  /** Solta TODOS os emissores e reabre o microfone de imediato */
  releaseAll() {
    this.holders.clear();
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.setGate(false);
  }

  private setGate(muted: boolean) {
    if (this.micMuted === muted) return;
    this.micMuted = muted;
    const ctx = this.ctx;
    if (this.gate && ctx) {
      const g = this.gate.gain;
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      // rampa curta evita cliques; 0 = mic desconectado do grafo de captura
      g.linearRampToValueAtTime(muted ? 0 : 1, now + 0.02);
    }
    if (muted) this.clap.level = 0;
    this.onMicGate?.(muted);
  }

  /* ------------------------- Reprodução ------------------------- */

  get playing() {
    return this.sources.size > 0;
  }

  playPcm(b64: string) {
    const ctx = this.ensureCtx();
    if (!this.outGain) return;
    const f32 = base64ToFloat32(b64);
    if (!f32.length) return;
    const buf = ctx.createBuffer(1, f32.length, GEMINI.outputRate);
    buf.getChannelData(0).set(f32);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.outGain);

    const now = ctx.currentTime;
    const wasIdle = this.sources.size === 0;
    // pequeno jitter-buffer no início de cada fala; sem lacunas depois
    if (wasIdle || this.nextTime < now) this.nextTime = now + 0.06;
    src.start(this.nextTime);
    this.nextTime += buf.duration;

    this.sources.add(src);
    src.onended = () => {
      this.sources.delete(src);
      if (this.sources.size === 0) this.onPlaybackEnd?.();
    };
    if (wasIdle) {
      this.playStartedAt = performance.now();
      this.onPlaybackStart?.();
    }
  }

  /** Interrompe TODA a fala do assistente imediatamente (fade de 15ms anti-clique) */
  flush() {
    const ctx = this.ctx;
    if (!ctx || !this.outGain || this.sources.size === 0) {
      this.nextTime = 0;
      return;
    }
    const g = this.outGain.gain;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.015);
    this.sources.forEach((s) => {
      s.onended = null;
      try {
        s.stop(now + 0.02);
      } catch {
        /* */
      }
    });
    this.sources.clear();
    g.setValueAtTime(1, now + 0.04);
    this.nextTime = 0;
    this.onPlaybackEnd?.();
  }

  /** Nível RMS da voz do assistente (0..1) para o orbe */
  outputLevel() {
    if (!this.outAnalyser || !this.playing) return 0;
    this.outAnalyser.getFloatTimeDomainData(this.outBuf);
    let s = 0;
    for (let i = 0; i < this.outBuf.length; i++) s += this.outBuf[i] * this.outBuf[i];
    return Math.min(1, Math.sqrt(s / this.outBuf.length) * 5);
  }
}
