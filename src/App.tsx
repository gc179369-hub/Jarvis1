import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Send } from "lucide-react";
import { engine } from "./engine/JarvisEngine";
import ParticleOrb from "./components/ParticleOrb";
import ControlBar from "./components/ControlBar";
import CameraPreview from "./components/CameraPreview";
import SettingsPanel from "./components/SettingsPanel";
import { TopBar, Subtitles, HistoryDrawer } from "./components/Hud";

let initialized = false;

export default function App() {
  const s = useSyncExternalStore(engine.subscribe, engine.getState);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [text, setText] = useState("");
  const [clapPulse, setClapPulse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Arranque normal ao carregar (sem música): conecta ao Gemini Live
  useEffect(() => {
    if (initialized) return;
    initialized = true;
    const go = () => engine.init();
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);

  useEffect(() => {
    if (!s.clapCount) return;
    setClapPulse(true);
    const t = setTimeout(() => setClapPulse(false), 260);
    return () => clearTimeout(t);
  }, [s.clapCount]);

  useEffect(() => {
    if (kbOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [kbOpen]);

  const onOrbTap = () => {
    if (s.needsGesture) engine.wake();
    else engine.micButton();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    engine.sendUserText(t);
    setText("");
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white antialiased select-none">
      {/* player oculto da trilha do Modo Mega Brain */}
      <div className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px overflow-hidden opacity-0" aria-hidden>
        <div id="yt-holder" />
      </div>

      <ParticleOrb onTap={onOrbTap} />

      <TopBar s={s} onHistory={() => setHistoryOpen(true)} />
      <CameraPreview s={s} />

      {!s.needsGesture && <Subtitles s={s} onRetry={() => engine.retry()} />}

      {s.needsGesture && (
        <button onClick={() => engine.wake()} className="fixed inset-0 z-40 flex flex-col items-center justify-end bg-transparent pb-[20vh] text-center">
          <span className="animate-pulse font-mono text-[10px] tracking-[0.5em] text-cyan-200/70">
            {s.conn === "online" ? "NÚCLEO GEMINI LIVE CONECTADO" : "CONECTANDO AO NÚCLEO…"}
          </span>
          <span className="mt-3 text-lg font-light text-white/85">Toque para ativar o J.A.R.V.I.S</span>
          <span className="mt-2 max-w-xs text-xs text-white/35">O navegador exige um toque para liberar o microfone e o áudio.</span>
        </button>
      )}

      {kbOpen && !s.needsGesture && (
        <form onSubmit={submit} className="fixed inset-x-0 bottom-[104px] z-30 flex justify-center px-4">
          <div className="flex w-full max-w-md items-center gap-2 rounded-full border border-white/10 bg-black/70 p-1.5 pl-4 backdrop-blur-xl">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Digite um comando, senhor…"
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30"
            />
            <button type="submit" className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-400 text-black" aria-label="Enviar">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {!s.needsGesture && (
        <ControlBar
          s={s}
          clapPulse={clapPulse}
          keyboardOpen={kbOpen}
          onMic={() => engine.micButton()}
          onCamera={() => engine.toggleCamera()}
          onMega={() => engine.startMegaBrian("button")}
          onSettings={() => setSettingsOpen(true)}
          onKeyboard={() => setKbOpen((v) => !v)}
        />
      )}

      <SettingsPanel s={s} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryDrawer s={s} open={historyOpen} onClose={() => setHistoryOpen(false)} onClear={() => engine.clearLog()} />
    </main>
  );
}
