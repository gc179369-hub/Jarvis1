// ============================================================
//  Cliente Gemini Multimodal Live API (WebSocket BidiGenerateContent)
//  Correções aplicadas:
//   • frames binários (Blob/ArrayBuffer) decodificados corretamente
//   • partes de "pensamento" (thought) ignoradas — só áudio é tocado
//   • `interrupted` propagado para limpar a fila de áudio na hora
//   • retomada de sessão (sessionResumption) + goAway + backoff
//   • compressão de contexto => sessões longas com vídeo
//   • erros fatais (cota, chave, modelo) exibidos sem loop infinito
// ============================================================
import { GEMINI } from "../config";

export type FunctionCall = { id: string; name: string; args?: Record<string, unknown> };
export type FunctionResponse = { id: string; name: string; response: Record<string, unknown> };

export type LiveStatus = "offline" | "connecting" | "online" | "reconnecting" | "error";

export type LiveConfig = {
  apiKey: string;
  apiVersion: "v1beta" | "v1alpha";
  model: string;
  voice: string;
  systemInstruction: string;
  functionDeclarations: unknown[];
  googleSearch: boolean;
  vadSensitivity: "high" | "low";
};

export type LiveHandlers = {
  onStatus?: (s: LiveStatus, detail?: string) => void;
  onSetupComplete?: (resumed: boolean) => void;
  onAudio?: (b64: string) => void;
  onInputTranscript?: (t: string) => void;
  onOutputTranscript?: (t: string) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onGenerationComplete?: () => void;
  onToolCall?: (calls: FunctionCall[]) => void;
  onToolCancel?: (ids: string[]) => void;
  onError?: (msg: string, fatal: boolean) => void;
};

const FATAL_HINTS = ["quota", "api key", "api_key", "permission", "not found", "not supported", "invalid", "billing", "unregistered"];

export class GeminiLive {
  private ws: WebSocket | null = null;
  private cfg: LiveConfig | null = null;
  private handle: string | null = null;
  private manual = false;
  private retries = 0;
  private retryTimer: number | null = null;
  private decoder = new TextDecoder();
  ready = false;
  status: LiveStatus = "offline";
  h: LiveHandlers = {};

  get isReady() {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  get modelIsV3() {
    return /gemini-3/.test(this.cfg?.model ?? "");
  }

  connect(cfg: LiveConfig, fresh = true) {
    this.cfg = cfg;
    if (fresh) this.handle = null;
    this.retries = 0;
    this.open();
  }

  private setStatus(s: LiveStatus, detail?: string) {
    this.status = s;
    this.h.onStatus?.(s, detail);
  }

  private open() {
    if (!this.cfg) return;
    this.teardown();
    this.manual = false;
    this.ready = false;
    this.setStatus(this.handle ? "reconnecting" : "connecting");
    const url = `${GEMINI.wsHost}.${this.cfg.apiVersion}.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(this.cfg.apiKey)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (e: any) {
      this.h.onError?.("Falha ao abrir WebSocket: " + (e?.message || e), true);
      this.setStatus("error");
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify(this.buildSetup()));
    ws.onmessage = (ev) => this.onMessage(ev.data);
    ws.onerror = () => {
      /* detalhes chegam no onclose */
    };
    ws.onclose = (ev) => this.onClose(ws, ev.code, ev.reason);
  }

  private buildSetup() {
    const c = this.cfg!;
    const tools: unknown[] = [];
    if (c.functionDeclarations.length) tools.push({ functionDeclarations: c.functionDeclarations });
    if (c.googleSearch) tools.push({ googleSearch: {} });
    const high = c.vadSensitivity === "high";
    return {
      setup: {
        model: c.model.startsWith("models/") ? c.model : `models/${c.model}`,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } } },
        },
        systemInstruction: { parts: [{ text: c.systemInstruction }] },
        tools,
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            startOfSpeechSensitivity: high ? "START_SENSITIVITY_HIGH" : "START_SENSITIVITY_LOW",
            endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
            prefixPaddingMs: high ? 20 : 120,
            silenceDurationMs: 550,
          },
          // falar por cima do Jarvis interrompe a resposta (barge-in)
          activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: this.handle ? { handle: this.handle } : {},
      },
    };
  }

  private onMessage(data: unknown) {
    let msg: any;
    try {
      const text = typeof data === "string" ? data : this.decoder.decode(data as ArrayBuffer);
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (msg.setupComplete) {
      const resumed = !!this.handle;
      this.ready = true;
      this.retries = 0;
      this.setStatus("online");
      this.h.onSetupComplete?.(resumed);
      return;
    }

    if (msg.serverContent) {
      const sc = msg.serverContent;
      if (sc.interrupted) this.h.onInterrupted?.();
      if (sc.inputTranscription?.text) this.h.onInputTranscript?.(sc.inputTranscription.text);
      if (sc.modelTurn?.parts) {
        for (const p of sc.modelTurn.parts) {
          // ignora "pensamentos" e texto; só toca áudio
          if (p.inlineData?.data && String(p.inlineData.mimeType || "").startsWith("audio/")) {
            this.h.onAudio?.(p.inlineData.data);
          }
        }
      }
      if (sc.outputTranscription?.text) this.h.onOutputTranscript?.(sc.outputTranscription.text);
      if (sc.generationComplete) this.h.onGenerationComplete?.();
      if (sc.turnComplete) this.h.onTurnComplete?.();
      return;
    }

    if (msg.toolCall?.functionCalls) {
      this.h.onToolCall?.(msg.toolCall.functionCalls);
      return;
    }
    if (msg.toolCallCancellation?.ids) {
      this.h.onToolCancel?.(msg.toolCallCancellation.ids);
      return;
    }
    if (msg.sessionResumptionUpdate) {
      const u = msg.sessionResumptionUpdate;
      if (u.resumable && u.newHandle) this.handle = u.newHandle;
      return;
    }
    if (msg.goAway) {
      // o servidor vai encerrar: reconecta já com o handle de retomada
      window.setTimeout(() => this.open(), 200);
      return;
    }
    if (msg.error) {
      this.h.onError?.(msg.error.message || "Erro do servidor", false);
    }
  }

  private onClose(ws: WebSocket, code: number, reason: string) {
    if (ws !== this.ws) return; // conexão antiga substituída
    this.ready = false;
    this.ws = null;
    if (this.manual) {
      this.setStatus("offline");
      return;
    }
    const r = (reason || "").toLowerCase();
    const fatal = code === 1007 || code === 1008 || FATAL_HINTS.some((k) => r.includes(k));
    if (fatal) {
      this.handle = null;
      this.h.onError?.(translateClose(code, reason), true);
      this.setStatus("error", reason);
      return;
    }
    // handle inválido/expirado? tenta sem ele na próxima
    if (this.retries >= 2) this.handle = null;
    this.retries++;
    if (this.retries > 6) {
      this.h.onError?.(translateClose(code, reason), true);
      this.setStatus("error", reason);
      return;
    }
    const delay = Math.min(8000, 400 * 2 ** (this.retries - 1));
    this.setStatus("reconnecting", `tentativa ${this.retries}`);
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }

  private teardown() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close(1000);
      } catch {
        /* */
      }
    }
  }

  close() {
    this.manual = true;
    this.teardown();
    this.ready = false;
    this.setStatus("offline");
  }

  retry() {
    if (!this.cfg) return;
    this.retries = 0;
    this.open();
  }

  private send(obj: unknown) {
    if (!this.isReady) return false;
    this.ws!.send(JSON.stringify(obj));
    return true;
  }

  sendAudio(b64: string) {
    return this.send({ realtimeInput: { audio: { data: b64, mimeType: `audio/pcm;rate=${GEMINI.inputRate}` } } });
  }

  sendAudioStreamEnd() {
    return this.send({ realtimeInput: { audioStreamEnd: true } });
  }

  sendVideo(b64: string) {
    // evita congestionar o socket em redes móveis lentas
    if (this.ws && this.ws.bufferedAmount > 512 * 1024) return false;
    return this.send({ realtimeInput: { video: { data: b64, mimeType: "image/jpeg" } } });
  }

  /** Texto do usuário (ou instrução interna). Interrompe a geração atual. */
  sendText(text: string) {
    if (this.modelIsV3) return this.send({ realtimeInput: { text } });
    return this.send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true } });
  }

  sendToolResponse(functionResponses: FunctionResponse[]) {
    return this.send({ toolResponse: { functionResponses } });
  }
}

function translateClose(code: number, reason: string) {
  const r = reason.toLowerCase();
  if (r.includes("quota") || r.includes("billing")) return "Cota da API Gemini excedida para este modelo. Escolha outro modelo nas Configurações ou verifique o faturamento.";
  if (r.includes("api key") || r.includes("api_key")) return "Chave de API Gemini inválida. Verifique nas Configurações.";
  if (r.includes("not found") || r.includes("not supported")) return `Modelo indisponível para Live API: ${reason}`;
  return `Conexão encerrada (${code})${reason ? ": " + reason : ""}`;
}

/** Lista modelos que suportam bidiGenerateContent (Live) para esta chave */
export async function fetchLiveModels(apiKey: string): Promise<{ id: string; label: string }[]> {
  const r = await fetch(`${GEMINI.restModels}?pageSize=300&key=${encodeURIComponent(apiKey)}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return (j.models || [])
    .filter((m: any) => (m.supportedGenerationMethods || []).includes("bidiGenerateContent"))
    .filter((m: any) => !/transcribe|translate|robotics/i.test(m.name))
    .map((m: any) => ({ id: m.name as string, label: (m.displayName as string) || m.name }));
}
