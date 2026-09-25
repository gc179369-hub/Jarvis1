// ============================================================
//  J.A.R.V.I.S ENGINE — Orquestrador (Gemini Multimodal Live)
//  Microfone ─┬─► PCM16 16k ─► WebSocket ─► Gemini ─► PCM 24k ─► Fila de áudio
//             └─► Detector de palmas / barge-in local
//  Câmera ─► JPEG 1fps ─► WebSocket
// ============================================================
import { APP, MEGA, SILENT, loadSettings, saveSettings, type Settings } from "../config";
import { AudioIO } from "./audio";
import { GeminiLive, type LiveStatus, type FunctionCall, type FunctionResponse } from "./gemini";
import { CameraStreamer, type Facing } from "./camera";
import { MusicPlayer } from "./music";
import { Speaker } from "./speech";
import { functionDeclarations, runTool, type ToolContext } from "./tools";
import { sendToJarvisWebhook } from "./secrets";
import { greeting, ack, megaPhrase, sessionFlavor } from "./phrases";

export type Phase = "dormant" | "connecting" | "standby" | "listening" | "thinking" | "speaking" | "mega";
export type MegaState = "off" | "charging" | "max";
export type LogEntry = { id: number; role: "user" | "assistant" | "system"; text: string };

export type EngineState = {
  phase: Phase;
  conn: LiveStatus;
  mega: MegaState;
  megaPower: number;
  micOn: boolean;
  micReady: boolean;
  cameraOn: boolean;
  cameraFacing: Facing;
  cameraRev: number;
  needsGesture: boolean;
  userText: string;
  assistantText: string;
  toolLabel: string;
  error: string | null;
  music: "youtube" | null;
  silent: boolean;
  micGated: boolean;
  clapCount: number;
  doubleClapCount: number;
  log: LogEntry[];
  settings: Settings;
};

let logId = 0;

function buildSystemPrompt(s: Settings) {
  const now = new Date();
  const dialect = s.dialect === "pt-PT" ? "português europeu (de Portugal)" : "português do Brasil";
  return `Você é J.A.R.V.I.S, um assistente pessoal de voz com IA — sofisticado, leal, espirituoso, com humor fino ao estilo britânico. Fale SEMPRE em ${dialect} e trate o usuário por "senhor".
${sessionFlavor()}

CONVERSA EM TEMPO REAL:
- Respostas curtas e naturais (1 a 3 frases), salvo quando pedirem detalhes.
- Se for interrompido, pare e atenda imediatamente ao novo pedido, sem retomar o assunto anterior.
- Nunca repita a mesma frase de abertura, saudação ou confirmação duas vezes seguidas. Varie o vocabulário ("Às ordens", "Feito", "Considere resolvido", "Com prazer", "Missão cumprida"…).

DATA/HORA ATUAL: ${now.toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })} (fuso ${Intl.DateTimeFormat().resolvedOptions().timeZone}).

VISÃO: o usuário pode ligar a câmera e você recebe quadros em tempo real. Ao ser perguntado sobre o que vê, descreva com precisão e objetividade. Se precisar ver algo e a câmera estiver desligada, ofereça ligá-la (camera_control).

FERRAMENTAS: use as funções disponíveis quando fizer sentido. Gmail via Zapier: send_email, read_emails, reply_email. Confirme destinatário, assunto e conteúdo se estiverem ambíguos antes de enviar. Depois de executar, confirme brevemente.${s.googleSearch ? "\nUse a Pesquisa Google para notícias, fatos atuais e dados em tempo real." : ""}

MODO MEGA BRAIN: quando o usuário pedir para "ativar o modo mega brain" (ou variações como "mega brain"), chame activate_mega_brian imediatamente, sem comentar antes, e siga a instrução devolvida pela função.

MENSAGENS [SISTEMA]: mensagens iniciadas por [SISTEMA] são instruções internas do aplicativo, não falas do usuário. Siga-as sem mencioná-las.`;
}

const normalize = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export class JarvisEngine {
  audio = new AudioIO();
  live = new GeminiLive();
  camera = new CameraStreamer();
  music = new MusicPlayer();
  speaker = new Speaker();
  clapFlashAt = 0;
  state: EngineState;

  private listeners = new Set<() => void>();
  private greeted = false;
  private userBuf = "";
  private userTriggered = false;
  private asstBuf = "";
  private modelTurnActive = false;
  private awaiting = false;
  private awaitTimer: number | null = null;
  private toolsRunning = 0;
  private cancelledTools = new Set<string>();
  private dropUntilTurnEnd = false;
  private dropTimer: number | null = null;
  private muteUntil = 0;
  private uplinkPaused = false;
  private voiceMs = 0;
  // Mega Brain
  private megaToken = 0;
  private megaTimers: number[] = [];
  private lastMegaAt = 0;
  private megaInstr = "";
  private megaSent = false;

  constructor() {
    const settings = loadSettings();
    this.state = {
      phase: "dormant",
      conn: "offline",
      mega: "off",
      megaPower: 0,
      micOn: true,
      micReady: false,
      cameraOn: false,
      cameraFacing: "environment",
      cameraRev: 0,
      needsGesture: false,
      userText: "",
      assistantText: "",
      toolLabel: "",
      error: null,
      music: null,
      silent: false,
      micGated: false,
      clapCount: 0,
      doubleClapCount: 0,
      log: [],
      settings,
    };
    this.applyLocal(settings);
    this.wire();
  }

  /* ============================ store ============================ */
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getState = () => this.state;
  private set(p: Partial<EngineState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }
  private addLog(role: LogEntry["role"], text: string) {
    const t = text.trim();
    if (!t) return;
    this.set({ log: [...this.state.log, { id: ++logId, role, text: t }].slice(-60) });
  }

  private recompute() {
    const s = this.state;
    let phase: Phase;
    if (s.needsGesture) phase = "dormant";
    else if (s.mega === "charging") phase = "mega";
    else if (this.audio.playing) phase = "speaking";
    else if (this.toolsRunning > 0 || this.awaiting) phase = "thinking";
    else if (s.silent) phase = "standby";
    else if (s.conn !== "online") phase = s.conn === "error" || s.conn === "offline" ? "dormant" : "connecting";
    else if (!s.micOn) phase = "standby";
    else phase = "listening";
    if (phase !== s.phase) this.set({ phase });
  }

  /* ============================ wiring ============================ */
  private wire() {
    // --- microfone → Gemini
    this.audio.onChunk = (b64) => {
      // porta anti-eco fechada => nada do alto-falante chega ao Gemini
      if (!this.state.micOn || this.uplinkPaused || this.state.silent || this.audio.micMuted) return;
      this.live.sendAudio(b64);
    };

    // --- GUARDA DE ECO: silencia o mic enquanto o assistente fala; reativa no fim
    this.audio.onPlaybackStart = () => {
      this.guardMic("gemini", true);
      if (this.state.mega !== "charging") this.audio.clap.thresholdBoost = 1.5;
      this.recompute();
    };
    this.audio.onPlaybackEnd = () => {
      this.guardMic("gemini", false);
      if (this.state.mega !== "charging") this.audio.clap.thresholdBoost = 1;
      this.recompute();
    };
    this.speaker.onStart = () => this.guardMic("tts", true);
    this.speaker.onEnd = () => this.guardMic("tts", false); // evento onend da síntese
    this.audio.onMicGate = (muted) => {
      // avisa o servidor que o fluxo pausou (VAD não fica pendurado) e reflete na UI
      if (muted) this.live.sendAudioStreamEnd();
      this.set({ micGated: muted });
      this.recompute();
    };

    // --- palmas + barge-in local
    const clap = this.audio.clap;
    clap.onClap = () => {
      this.clapFlashAt = performance.now();
      this.set({ clapCount: this.state.clapCount + 1 });
    };
    clap.onDoubleClap = () => this.onDoubleClap();
    clap.onTick = (rms, noise) => this.bargeInTick(rms, noise);

    // --- câmera → Gemini
    this.camera.onFrame = (b64) => {
      if (this.live.isReady) this.live.sendVideo(b64);
    };

    this.music.onStateChange = (playing, src) => {
      this.guardMic("music", playing);
      this.set({ music: src });
    };
    this.music.onUnavailable = (reason) => {
      // Sem reserva genérica: a apresentação continua apenas com a voz
      this.addLog("system", `⚠ Trilha do YouTube indisponível (${reason}) — a prosseguir só com a voz`);
    };

    // --- Gemini Live
    this.live.h = {
      onStatus: (conn, detail) => {
        this.set({ conn, ...(conn === "online" ? { error: null } : {}) });
        if (conn === "reconnecting") this.set({ toolLabel: detail || "" });
        this.recompute();
      },
      onSetupComplete: (resumed) => {
        if (!resumed) this.maybeGreet();
      },
      onAudio: (b64) => {
        if (this.dropUntilTurnEnd || this.state.silent || performance.now() < this.muteUntil) return;
        this.clearAwait();
        if (!this.modelTurnActive) this.startModelTurn();
        this.audio.playPcm(b64);
      },
      onInputTranscript: (t) => this.onUserTranscript(t),
      onOutputTranscript: (t) => {
        if (this.dropUntilTurnEnd) return;
        if (!this.modelTurnActive) this.startModelTurn();
        this.asstBuf += t;
        this.set({ assistantText: this.asstBuf.trim() });
      },
      onInterrupted: () => {
        // o usuário falou por cima: aborta o áudio atual IMEDIATAMENTE
        this.audio.flush();
        this.finalizeModelTurn(true);
        this.releaseDrop();
        this.recompute();
      },
      onTurnComplete: () => {
        this.finalizeModelTurn(false);
        this.releaseDrop();
        this.clearAwait();
        if (this.userBuf.trim()) {
          this.addLog("user", this.userBuf);
          this.userBuf = "";
          this.userTriggered = false;
        }
        this.recompute();
      },
      onToolCall: (calls) => this.handleToolCalls(calls),
      onToolCancel: (ids) => ids.forEach((id) => this.cancelledTools.add(id)),
      onError: (msg, fatal) => {
        this.set({ error: msg });
        if (fatal) this.addLog("system", "⚠ " + msg);
        this.recompute();
      },
    };
  }

  /** Segura/solta a porta anti-eco do microfone (respeita a opção echoGuard) */
  private guardMic(who: string, hold: boolean) {
    if (hold) {
      if (this.state.settings.echoGuard) this.audio.holdMic(who);
    } else {
      this.audio.releaseMic(who);
    }
  }

  /* ============================ ciclo de vida ============================ */
  async init() {
    this.music.preload("yt-holder");
    this.connect();
    // Arranque normal (sem música). Tenta liberar áudio sem gesto;
    // navegadores móveis exigirão um toque.
    const ok = await this.audio.resume();
    if (ok) {
      await this.startMicSafe();
      this.maybeGreet();
    } else {
      this.set({ needsGesture: true });
    }
    this.recompute();
  }

  /** Chamado dentro de um gesto do usuário (toque) */
  wake() {
    this.audio.resume(); // síncrono dentro do gesto
    this.speaker.unlock();
    this.set({ needsGesture: false });
    if (this.live.status === "error" || this.live.status === "offline") this.connect();
    this.startMicSafe().then(() => {
      this.maybeGreet();
      this.recompute();
    });
    this.recompute();
  }

  connect() {
    const s = this.state.settings;
    this.live.connect({
      apiKey: s.apiKey,
      apiVersion: s.apiVersion,
      model: s.model,
      voice: s.voice,
      systemInstruction: buildSystemPrompt(s),
      functionDeclarations: functionDeclarations(),
      googleSearch: s.googleSearch,
      vadSensitivity: s.vadSensitivity,
    });
  }

  retry() {
    this.set({ error: null });
    this.audio.resume();
    this.connect();
  }

  private async startMicSafe() {
    try {
      await this.audio.startMic();
      this.set({ micReady: true });
    } catch (e: any) {
      this.set({ micReady: false, error: "Microfone indisponível: " + (e?.message || e) + ". Permita o acesso ao microfone." });
    }
  }

  private maybeGreet() {
    if (this.greeted || !this.state.settings.greetOnStart) return;
    if (!this.live.isReady || !this.audio.running || this.state.mega === "charging") return;
    this.greeted = true;
    this.live.sendText(
      `[SISTEMA] O usuário acabou de abrir o aplicativo. Cumprimente-o numa única frase curta, inspirada nesta ideia, mas com palavras suas (não copie literalmente): "${greeting()}"`
    );
    this.setAwait();
  }

  /* ============================ turnos ============================ */
  private onUserTranscript(t: string) {
    // nova fala do usuário após o Mega Brain: volta a aceitar áudio do modelo
    if (this.dropUntilTurnEnd && this.state.mega !== "charging") this.releaseDrop();
    this.userBuf += t;
    this.set({ userText: this.userBuf.trim() });
    // Gatilho de voz do Modo Mega Brain
    if (!this.userTriggered && MEGA.trigger.test(normalize(this.userBuf))) {
      this.userTriggered = true;
      this.startMegaBrian("voice");
      return;
    }
    // Se parar de chegar transcrição e nada for respondido → "pensando"
    if (this.awaitTimer) clearTimeout(this.awaitTimer);
    this.awaitTimer = window.setTimeout(() => {
      if (!this.modelTurnActive && !this.audio.playing) {
        this.awaiting = true;
        this.recompute();
      }
    }, 700);
  }

  private startModelTurn() {
    this.modelTurnActive = true;
    if (this.userBuf.trim()) {
      this.addLog("user", this.userBuf);
    }
    this.userBuf = "";
    this.userTriggered = false;
    this.asstBuf = "";
    this.set({ assistantText: "" });
  }

  private finalizeModelTurn(interrupted: boolean) {
    if (this.modelTurnActive && this.asstBuf.trim()) {
      this.addLog("assistant", this.asstBuf.trim() + (interrupted ? " …" : ""));
    }
    this.modelTurnActive = false;
    this.asstBuf = "";
  }

  private setAwait() {
    this.awaiting = true;
    this.recompute();
  }
  private clearAwait() {
    if (this.awaitTimer) clearTimeout(this.awaitTimer);
    this.awaitTimer = null;
    if (this.awaiting) {
      this.awaiting = false;
      this.recompute();
    }
  }

  /** Descarta o restante do turno atual do modelo (após interrupção local) */
  private dropRestOfTurn() {
    this.dropUntilTurnEnd = true;
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.dropTimer = window.setTimeout(() => (this.dropUntilTurnEnd = false), 8000);
  }
  private releaseDrop() {
    this.dropUntilTurnEnd = false;
    if (this.dropTimer) clearTimeout(this.dropTimer);
    this.dropTimer = null;
  }

  /* ============================ interrupções ============================ */
  /** Barge-in local: voz sustentada do usuário enquanto o Jarvis fala → corta o áudio já */
  private bargeInTick(rms: number, noise: number) {
    const s = this.state;
    if (!this.audio.playing || !s.settings.localBargeIn || !s.micOn || s.mega === "charging" || this.audio.micMuted) {
      this.voiceMs = 0;
      return;
    }
    if (performance.now() - this.audio.playStartedAt < 350) return; // AEC convergindo
    const thr = Math.max(0.04, noise * 5);
    if (rms > thr) this.voiceMs += 16;
    else this.voiceMs = Math.max(0, this.voiceMs - 20);
    if (this.voiceMs >= 240) {
      this.voiceMs = 0;
      this.localInterrupt();
    }
  }

  /** Corta imediatamente a fala atual do assistente */
  localInterrupt() {
    this.audio.flush();
    this.speaker.cancel();
    this.finalizeModelTurn(true);
    this.dropRestOfTurn();
    this.clearAwait();
    this.recompute();
  }

  private onDoubleClap() {
    this.set({ doubleClapCount: this.state.doubleClapCount + 1 });
    if (this.state.mega === "charging") {
      this.abortMega();
      this.addLog("system", "👏 Modo Mega Brain interrompido por palmas");
      return;
    }
    this.toggleSilentMode();
  }

  /**
   * MODO SILÊNCIO (dupla palma):
   *  • ligar  → corta a fala/áudio imediatamente, beep discreto, fica calado;
   *             o microfone continua ativo APENAS para detetar palmas.
   *  • desligar → volta ao modo ativo e avisa "Sistema reativado…".
   */
  toggleSilentMode() {
    const silent = !this.state.silent;
    if (silent) {
      this.localInterrupt();
      this.live.sendAudioStreamEnd();
      this.set({ silent: true, assistantText: "" });
      this.playQuietBeep();
      this.addLog("system", "👏👏 Modo Silêncio ativado (à escuta de palmas)");
    } else {
      this.set({ silent: false, micOn: true });
      this.releaseDrop();
      this.audio.resume();
      this.startMicSafe();
      this.addLog("system", "👏👏 Sistema reativado");
      if (this.live.isReady) {
        this.live.sendText(`[SISTEMA] O usuário reativou você com duas palmas. Diga apenas, com suas palavras: "${SILENT.wakeLine}" (ou algo equivalente como "${ack()}")`);
        this.setAwait();
      } else {
        this.speaker.speak(SILENT.wakeLine);
      }
    }
    this.recompute();
  }

  private playQuietBeep() {
    const ctx = this.audio.ensureCtx();
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(SILENT.beepHz, ctx.currentTime);
      gain.gain.setValueAtTime(SILENT.beepGain, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + SILENT.beepSeconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + SILENT.beepSeconds);
    } catch {
      /* */
    }
  }

  /** Evento de sistema para o Zapier (segundo plano, URL protegida em secrets.ts) */
  async sendToWebhook(action: string, data: Record<string, unknown>) {
    const r = await sendToJarvisWebhook(action, data, { model: APP.version });
    return r.ok;
  }

  /* ============================ controles ============================ */
  setMic(on: boolean) {
    if (on) {
      this.audio.resume();
      this.startMicSafe();
    } else {
      this.live.sendAudioStreamEnd();
    }
    this.set({ micOn: on });
    this.recompute();
  }

  /** Botão do microfone: interrompe se estiver falando; senão alterna mudo */
  micButton() {
    this.audio.resume();
    if (this.state.silent) return this.toggleSilentMode();
    if (this.state.mega === "charging") return this.abortMega();
    if (this.audio.playing || this.modelTurnActive || this.awaiting) return this.localInterrupt();
    this.setMic(!this.state.micOn);
  }

  sendUserText(text: string) {
    const t = text.trim();
    if (!t) return;
    this.audio.resume();
    if (this.state.silent) this.set({ silent: false });
    if (MEGA.trigger.test(normalize(t))) {
      this.addLog("user", t);
      this.startMegaBrian("button");
      return;
    }
    this.audio.flush();
    this.finalizeModelTurn(true);
    this.releaseDrop();
    this.muteUntil = performance.now() + 250;
    this.addLog("user", t);
    this.set({ userText: t });
    if (!this.live.isReady) {
      this.set({ error: "Sem conexão com o Gemini Live. Toque em Reconectar." });
      return;
    }
    this.live.sendText(t);
    this.setAwait();
  }

  async setCamera(on: boolean, facing?: Facing): Promise<string> {
    if (!on) {
      this.camera.stop();
      this.set({ cameraOn: false });
      return "câmera desligada";
    }
    try {
      await this.camera.start(facing ?? this.camera.facing);
      this.set({ cameraOn: true, cameraFacing: this.camera.facing, cameraRev: this.state.cameraRev + 1 });
      return `câmera ${this.camera.facing === "user" ? "frontal" : "traseira"} ligada; você passa a receber quadros em tempo real`;
    } catch (e: any) {
      const msg = "Câmera indisponível: " + (e?.message || e);
      this.set({ error: msg, cameraOn: false });
      return msg;
    }
  }

  toggleCamera() {
    return this.setCamera(!this.state.cameraOn);
  }
  flipCamera() {
    return this.setCamera(true, this.camera.facing === "user" ? "environment" : "user");
  }

  /* ============================ ferramentas ============================ */
  private toolCtx(): ToolContext {
    return {
      startMegaBrian: () => this.megaFromTool(),
      setCamera: (on, facing) => this.setCamera(on, facing),
      setTimer: (seconds, label) =>
        window.setTimeout(() => {
          const txt = `[SISTEMA] O temporizador${label ? ` "${label}"` : ""} de ${seconds} segundos terminou. Avise o usuário agora, de forma breve.`;
          if (this.live.isReady) this.live.sendText(txt);
          else this.speaker.speak(`Senhor, o temporizador ${label} terminou.`);
        }, seconds * 1000),
    };
  }

  private async handleToolCalls(calls: FunctionCall[]) {
    this.clearAwait();
    this.toolsRunning += calls.length;
    this.set({ toolLabel: calls.map((c) => c.name).join(", ") });
    this.recompute();
    const ctx = this.toolCtx();
    const responses: FunctionResponse[] = await Promise.all(
      calls.map(async (c) => ({ id: c.id, name: c.name, response: await runTool(c.name, (c.args as Record<string, any>) || {}, ctx) }))
    );
    this.toolsRunning = Math.max(0, this.toolsRunning - calls.length);
    const valid = responses.filter((r) => !this.cancelledTools.has(r.id));
    if (valid.length) {
      this.live.sendToolResponse(valid);
      this.setAwait();
    }
    this.addLog("system", `⚙ ${calls.map((c) => c.name).join(", ")}`);
    this.set({ toolLabel: "" });
    this.recompute();
  }

  /* ============================ MODO MEGA BRAIN ============================ */
  private megaFromTool(): Record<string, unknown> {
    if (this.state.mega === "charging") {
      if (!this.megaSent) {
        this.megaSent = true;
        return { status: "ativado", instrucao: this.megaInstr };
      }
      return { status: "em_andamento", instrucao: "A apresentação já está em curso. Não diga nada agora." };
    }
    return this.startMegaBrian("tool");
  }

  /**
   * Protocolo: trilha do YouTube (0→20s) + declamação cósmica de 18–20s.
   * Aos 20s a música sai em fade, o mic é reativado e o Jarvis fica à escuta.
   */
  startMegaBrian(source: "voice" | "button" | "tool"): Record<string, unknown> {
    if (this.state.mega === "charging" || Date.now() - this.lastMegaAt < 3000) {
      return { status: "em_andamento", instrucao: "A apresentação já está em curso. Não diga nada agora." };
    }
    this.lastMegaAt = Date.now();
    const token = ++this.megaToken;
    this.clearMegaTimers();

    this.audio.resume();
    this.audio.flush();
    this.releaseDrop();
    this.clearAwait();

    // 0→20s: microfone PROTEGIDO (porta Web Audio a 0) — nem música nem voz da IA
    // chegam ao Gemini ou ao detetor; obrigatório, independente da opção echoGuard
    this.uplinkPaused = true;
    this.live.sendAudioStreamEnd();
    this.audio.holdMic("mega");
    this.audio.clap.thresholdBoost = 2;

    this.set({ mega: "charging", megaPower: 0, assistantText: "", error: null, silent: false });
    this.addLog("system", `⚡ Modo Mega Brain ativado (v${APP.version})`);
    this.music.playIntro(MEGA.seconds); // exclusivamente YouTube 0→20s
    this.sendToWebhook("MEGA_BRAIN_ACTIVATED", { status: "active", voice: APP.voiceModelId, model: this.state.settings.model, source });

    const t0 = performance.now();
    const iv = window.setInterval(() => {
      const p = Math.min(100, (performance.now() - t0) / (MEGA.seconds * 10));
      this.set({ megaPower: Math.round(p) });
    }, 150);
    this.megaTimers.push(iv);

    // Frase cósmica sorteada (rotação sem repetição), calibrada para 18–20s de fala
    const phrase = megaPhrase(MEGA.phrases);
    const script = [phrase];
    this.set({ assistantText: phrase });
    this.megaInstr = `[SISTEMA — PROTOCOLO MEGA BRAIN] A trilha sonora começou AGORA. Declame IMEDIATAMENTE, sem introdução, em tom épico e confiante, ritmo fluido e sem pausas longas, exatamente este texto, completo, sem cortar nem resumir (não acrescente nem pergunte nada; a leitura deve durar entre ${MEGA.speechMin} e ${MEGA.speechMax} segundos, terminando junto com a música): "${phrase}"`;
    this.megaSent = false;

    const sendPresentation = () => {
      if (token !== this.megaToken || this.megaSent) return;
      this.megaSent = true;
      if (this.live.isReady) {
        this.live.sendText(this.megaInstr);
      } else {
        // reserva offline: voz local
        (async () => {
          for (const line of script) {
            if (token !== this.megaToken) return;
            this.set({ assistantText: line });
            await this.speaker.speak(line);
          }
        })();
      }
    };

    let result: Record<string, unknown> = { status: "ativado" };
    if (source === "tool") {
      this.megaSent = true;
      result = { status: "ativado", instrucao: this.megaInstr };
    } else if (source === "button") {
      sendPresentation();
    } else {
      // voz: a fala deve começar junto com a música (0s) — envia já
      sendPresentation();
    }

    this.megaTimers.push(window.setTimeout(() => this.finishMega(token), MEGA.seconds * 1000));
    this.recompute();
    return result;
  }

  /** Aos 20s: YouTube desligado, mic reativado → modo de escuta total */
  private finishMega(token: number) {
    if (token !== this.megaToken) return;
    this.clearMegaTimers();
    this.music.stop(); // desliga o áudio de fundo e REMOVE o iframe do DOM
    this.speaker.cancel();
    if (this.audio.playing) {
      this.audio.flush();
      this.finalizeModelTurn(true);
    } else {
      this.finalizeModelTurn(false);
    }
    this.dropRestOfTurn(); // descarta qualquer resto da declamação
    this.muteUntil = performance.now() + 300;
    this.uplinkPaused = false;
    // microfone reativado de imediato (solta "mega", "music", "gemini", "tts")
    this.audio.releaseAll();
    this.audio.clap.thresholdBoost = 1;
    this.set({ mega: "max", megaPower: 100, micOn: true, silent: false, assistantText: "" });
    this.startMicSafe();
    this.addLog("system", "✦ Mega Brain completo — à escuta");
    this.recompute();
  }

  private abortMega() {
    this.megaToken++;
    this.clearMegaTimers();
    this.music.stop();
    this.speaker.cancel();
    this.audio.flush();
    this.finalizeModelTurn(true);
    this.dropRestOfTurn();
    this.uplinkPaused = false;
    this.audio.releaseAll();
    this.audio.clap.thresholdBoost = 1;
    this.set({ mega: "max", megaPower: 100, micOn: true, assistantText: "" });
    this.recompute();
  }

  private clearMegaTimers() {
    this.megaTimers.forEach((t) => {
      clearTimeout(t);
      clearInterval(t);
    });
    this.megaTimers = [];
  }

  /* ============================ configurações ============================ */
  private applyLocal(s: Settings) {
    if (!s.echoGuard && this.state.mega !== "charging") ["gemini", "tts", "music"].forEach((w) => this.audio.releaseMic(w));
    this.audio.clap.sensitivity = s.clapSensitivity;
    this.audio.clap.enabled = s.clapEnabled;
    this.camera.setFps(s.cameraFps);
    this.speaker.setLang(s.dialect);
  }

  applySettings(next: Settings) {
    const prev = this.state.settings;
    saveSettings(next);
    this.set({ settings: next });
    this.applyLocal(next);
    const keys: (keyof Settings)[] = ["apiKey", "apiVersion", "model", "voice", "dialect", "googleSearch", "vadSensitivity"];
    if (keys.some((k) => prev[k] !== next[k])) {
      this.audio.flush();
      this.addLog("system", `↻ Reconectando: ${next.model.replace("models/", "")} • voz ${next.voice}`);
      this.connect();
    }
  }

  clearLog() {
    this.set({ log: [] });
  }

  /* ============================ visual ============================ */
  visualLevel() {
    const mic = this.state.micOn ? this.audio.clap.level * 1.3 : 0;
    const out = this.audio.outputLevel() * 1.4;
    let mega = 0;
    if (this.state.mega === "charging") {
      const t = performance.now();
      mega = 0.35 + 0.3 * Math.abs(Math.sin(t / 140)) * (this.state.megaPower / 100 + 0.3);
    }
    return Math.min(1, Math.max(mic, out, mega));
  }
}

export const engine = new JarvisEngine();
