import { Mic, MicOff, Camera, CameraOff, Zap, Settings, Keyboard, Hand, Square, Loader2, Music2 } from "lucide-react";
import type { EngineState } from "../engine/JarvisEngine";
import { cn } from "../utils/cn";

type Props = {
  s: EngineState;
  onMic: () => void;
  onCamera: () => void;
  onMega: () => void;
  onSettings: () => void;
  onKeyboard: () => void;
  keyboardOpen: boolean;
  clapPulse: boolean;
};

export default function ControlBar({ s, onMic, onCamera, onMega, onSettings, onKeyboard, keyboardOpen, clapPulse }: Props) {
  const speaking = s.phase === "speaking" || s.phase === "mega";
  const thinking = s.phase === "thinking";
  const listening = s.phase === "listening";
  const charging = s.mega === "charging";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[max(14px,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] p-1.5 shadow-[0_0_40px_-10px_rgba(34,211,238,0.35)] backdrop-blur-xl sm:gap-2 sm:p-2">
        {/* Indicador / gatilho do Modo Mega Brain */}
        <button
          onClick={onMega}
          title='Ativar Modo Mega Brain (ou diga "ativar o modo mega brain")'
          className={cn(
            "relative flex h-12 items-center gap-2 overflow-hidden rounded-full pl-3 pr-3.5 transition-all",
            charging ? "bg-amber-400/15 text-amber-200" : s.mega === "max" ? "bg-amber-300/10 text-amber-100/90" : "bg-white/5 text-white/50"
          )}
        >
          <span
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500/35 to-amber-300/10 transition-[width] duration-150"
            style={{ width: charging ? `${s.megaPower}%` : "0%" }}
          />
          <Zap className={cn("relative h-4 w-4", charging && "animate-pulse fill-amber-300", s.mega === "max" && "fill-amber-200/40")} />
          <span className="relative flex flex-col items-start leading-none">
            <span className="text-[10px] font-semibold tracking-[0.18em]">MEGA</span>
            <span className="mt-0.5 font-mono text-[9px] tracking-wider opacity-80">
              {charging ? `${s.megaPower}%` : s.mega === "max" ? "BRAIN ✦" : "BRAIN"}
            </span>
          </span>
          {s.music && <Music2 className="relative h-3.5 w-3.5 animate-bounce opacity-80" />}
        </button>

        {/* Sensor de palmas */}
        <div
          title={s.micReady && s.settings.clapEnabled ? "Sensor de palmas ativo — 2 palmas interrompem" : "Sensor de palmas inativo"}
          className={cn(
            "hidden h-10 w-10 items-center justify-center rounded-full transition-all duration-200 min-[380px]:flex",
            clapPulse ? "scale-110 bg-cyan-300/30 text-white" : s.micReady && s.settings.clapEnabled ? "text-cyan-300/80" : "text-white/25"
          )}
        >
          <Hand className="h-4 w-4" />
        </div>

        {/* Microfone */}
        <button
          onClick={onMic}
          aria-label="Microfone"
          className={cn(
            "relative flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300",
            listening
              ? "bg-cyan-400 text-black shadow-[0_0_30px_rgba(34,211,238,0.8)]"
              : speaking || thinking
                ? "bg-white/10 text-white"
                : s.micOn && !s.silent
                  ? "bg-white/10 text-white/80"
                  : "bg-red-500/15 text-red-300"
          )}
        >
          {s.micGated && (speaking || thinking) && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-black" title="Microfone silenciado (guarda de eco)">
              ∅
            </span>
          )}
          {listening && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/40" />
              <span className="absolute -inset-1.5 rounded-full border border-cyan-300/40" />
            </>
          )}
          {thinking ? (
            <Loader2 className="relative h-6 w-6 animate-spin text-violet-300" />
          ) : speaking ? (
            <Square className="relative h-5 w-5 fill-current" />
          ) : s.micOn && !s.silent ? (
            <Mic className="relative h-6 w-6" />
          ) : (
            <MicOff className="relative h-6 w-6" />
          )}
        </button>

        {/* Câmera em tempo real */}
        <button
          onClick={onCamera}
          aria-label="Câmera em tempo real"
          className={cn(
            "relative flex h-12 w-12 items-center justify-center rounded-full transition active:scale-95",
            s.cameraOn ? "bg-cyan-400/20 text-cyan-200" : "bg-white/5 text-white/80 hover:bg-white/10"
          )}
        >
          {s.cameraOn ? <CameraOff className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          {s.cameraOn && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-red-500" />}
        </button>

        <button
          onClick={onKeyboard}
          aria-label="Teclado"
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition hover:text-white active:scale-95",
            keyboardOpen && "bg-white/10 text-white"
          )}
        >
          <Keyboard className="h-4 w-4" />
        </button>
        <button
          onClick={onSettings}
          aria-label="Configurações"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/60 transition hover:text-white active:scale-95"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
