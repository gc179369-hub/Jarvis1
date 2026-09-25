import { History, X, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import type { EngineState } from "../engine/JarvisEngine";
import { cn } from "../utils/cn";

const PHASE_LABEL: Record<string, string> = {
  dormant: "EM REPOUSO",
  connecting: "CONECTANDO AO NÚCLEO",
  standby: "MICROFONE EM MUDO",
  silent: "MODO SILÊNCIO • 👏👏 PARA REATIVAR",
  listening: "AO VIVO • OUVINDO",
  thinking: "PROCESSANDO",
  speaking: "FALANDO • FALE OU 👏👏 P/ INTERROMPER",
  speakingGated: "FALANDO • MIC PROTEGIDO CONTRA ECO",
  mega: "PROTOCOLO MEGA BRAIN",
};

const PHASE_COLOR: Record<string, string> = {
  dormant: "bg-white/40",
  connecting: "bg-sky-400",
  standby: "bg-red-400",
  listening: "bg-cyan-300",
  thinking: "bg-violet-400",
  speaking: "bg-emerald-300",
  mega: "bg-amber-300",
};

const CONN_LABEL: Record<string, string> = {
  offline: "offline",
  connecting: "conectando",
  reconnecting: "reconectando",
  online: "online",
  error: "erro",
};

export function TopBar({ s, onHistory }: { s: EngineState; onHistory: () => void }) {
  const model = s.settings.model.replace("models/", "").replace("gemini-", "");
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between px-5 pt-[max(16px,env(safe-area-inset-top))]">
      <div>
        <div className="font-mono text-[11px] font-semibold tracking-[0.5em] text-white/80">J.A.R.V.I.S</div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", PHASE_COLOR[s.phase], s.phase !== "dormant" && "animate-pulse")} />
          <span className="font-mono text-[9px] tracking-[0.22em] text-white/45">
            {s.silent ? PHASE_LABEL.silent : s.micGated && (s.phase === "speaking" || s.phase === "mega") ? PHASE_LABEL.speakingGated : s.phase === "thinking" && s.toolLabel ? `EXECUTANDO ${s.toolLabel.toUpperCase()}` : PHASE_LABEL[s.phase]}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 font-mono text-[8.5px] tracking-wider text-white/25">
          <span
            className={cn(
              "h-1 w-1 rounded-full",
              s.conn === "online" ? "bg-emerald-400" : s.conn === "error" ? "bg-red-400" : "bg-amber-300 animate-pulse"
            )}
          />
          GEMINI LIVE • {CONN_LABEL[s.conn]} • {model} • {s.settings.voice}
        </div>
      </div>
      <button
        onClick={onHistory}
        className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-white/60 backdrop-blur transition hover:text-white"
        aria-label="Histórico"
      >
        <History className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Subtitles({ s, onRetry }: { s: EngineState; onRetry: () => void }) {
  const text = s.assistantText;
  const tail = text.length > 240 ? "…" + text.slice(-240) : text;
  const showUser = s.userText && (s.phase === "listening" || s.phase === "thinking");
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[118px] z-10 flex flex-col items-center gap-2 px-6 text-center">
      {s.error && (
        <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-left text-xs text-red-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{s.error}</span>
          {(s.conn === "error" || s.conn === "offline") && (
            <button onClick={onRetry} className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white">
              <RefreshCw className="h-3 w-3" /> Reconectar
            </button>
          )}
        </div>
      )}
      {showUser && <p className="max-w-xl text-sm italic text-cyan-200/70">“{s.userText}”</p>}
      {!showUser && s.phase === "listening" && !tail && <p className="text-sm italic text-cyan-200/50">Estou ouvindo, senhor…</p>}
      {tail && s.phase !== "listening" && (
        <p
          className={cn(
            "max-w-xl text-balance text-base font-light leading-relaxed sm:text-lg",
            s.phase === "mega" ? "text-amber-100/90" : "text-white/85"
          )}
        >
          {tail}
        </p>
      )}
      {tail && s.phase === "listening" && !showUser && <p className="max-w-xl text-sm font-light text-white/40">{tail}</p>}
    </div>
  );
}

export function HistoryDrawer({ s, open, onClose, onClear }: { s: EngineState; open: boolean; onClose: () => void; onClear: () => void }) {
  return (
    <div className={cn("fixed inset-0 z-40 transition", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div className={cn("absolute inset-0 bg-black/60 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <aside
        className={cn(
          "absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-black/90 backdrop-blur-xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 pb-4 pt-[max(16px,env(safe-area-inset-top))]">
          <span className="font-mono text-xs tracking-[0.3em] text-white/70">REGISTRO</span>
          <div className="flex gap-1">
            <button onClick={onClear} className="rounded-full p-2 text-white/50 hover:text-white" aria-label="Limpar">
              <Trash2 className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="rounded-full p-2 text-white/50 hover:text-white" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4 select-text">
          {s.log.length === 0 && <p className="text-center text-sm text-white/30">Nenhuma interação ainda.</p>}
          {s.log.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "user" && "bg-cyan-400/15 text-cyan-50",
                  m.role === "assistant" && "bg-white/[0.06] text-white/85",
                  m.role === "system" && "bg-transparent font-mono text-[11px] text-white/35"
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
