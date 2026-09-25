import { useEffect, useRef, useState } from "react";
import { SwitchCamera, X, Maximize2, Minimize2 } from "lucide-react";
import { engine, type EngineState } from "../engine/JarvisEngine";
import { cn } from "../utils/cn";

/** Pré-visualização do feed ao vivo que está sendo transmitido ao Gemini */
export default function CameraPreview({ s }: { s: EngineState }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [big, setBig] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = s.cameraOn ? engine.camera.stream : null;
    if (s.cameraOn) v.play().catch(() => {});
  }, [s.cameraOn, s.cameraRev]);

  if (!s.cameraOn) return null;

  return (
    <div
      className={cn(
        "fixed right-4 z-20 overflow-hidden rounded-2xl border border-cyan-300/30 bg-black shadow-[0_0_30px_-8px_rgba(34,211,238,0.6)] transition-all duration-300",
        big ? "top-[max(76px,calc(env(safe-area-inset-top)+64px))] h-[46vh] w-[calc(100vw-2rem)] max-w-md" : "top-[max(76px,calc(env(safe-area-inset-top)+64px))] h-40 w-28 sm:h-48 sm:w-36"
      )}
    >
      <video
        ref={ref}
        muted
        playsInline
        autoPlay
        className={cn("h-full w-full object-cover", s.cameraFacing === "user" && "-scale-x-100")}
      />
      {/* moldura HUD */}
      <div className="pointer-events-none absolute inset-1.5">
        {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-l-2 border-b-2", "right-0 bottom-0 border-r-2 border-b-2"].map((c) => (
          <span key={c} className={`absolute h-4 w-4 border-cyan-300/80 ${c}`} />
        ))}
      </div>
      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 font-mono text-[8px] tracking-widest text-red-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> AO VIVO
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/80 to-transparent p-1.5">
        <button onClick={() => engine.flipCamera()} className="rounded-full bg-black/50 p-1.5 text-white" aria-label="Trocar câmera">
          <SwitchCamera className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setBig((b) => !b)} className="rounded-full bg-black/50 p-1.5 text-white" aria-label="Expandir">
          {big ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => engine.setCamera(false)} className="rounded-full bg-black/50 p-1.5 text-white" aria-label="Desligar câmera">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
