import { useEffect, useState } from "react";
import { X, Webhook, Cpu, Volume2, Hand, Camera, Loader2, RefreshCw, Mic, ShieldCheck, ShieldOff } from "lucide-react";
import { engine, type EngineState } from "../engine/JarvisEngine";
import { fetchLiveModels } from "../engine/gemini";
import { defaultSettings, MODEL_PRESETS, VOICES, type Settings } from "../config";
import { zapierConfigured, zapierMaskedLabel } from "../engine/secrets";
import { cn } from "../utils/cn";

export default function SettingsPanel({ s, open, onClose }: { s: EngineState; open: boolean; onClose: () => void }) {
  const [form, setForm] = useState<Settings>(s.settings);
  const [remote, setRemote] = useState<{ id: string; label: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelErr, setModelErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(engine.state.settings);
    }
  }, [open]);

  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    engine.applySettings(form);
    onClose();
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setModelErr(null);
    try {
      setRemote(await fetchLiveModels(form.apiKey));
    } catch (e: any) {
      setModelErr(String(e?.message || e));
    } finally {
      setLoadingModels(false);
    }
  };

  const presetIds = new Set(MODEL_PRESETS.map((m) => m.id));
  const extra = remote.filter((m) => !presetIds.has(m.id));

  return (
    <div className={cn("fixed inset-0 z-50 transition", open ? "pointer-events-auto" : "pointer-events-none")}>
      <div className={cn("absolute inset-0 bg-black/70 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <section
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-950/95 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl transition-transform duration-300 sm:mx-auto sm:max-w-lg",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-mono text-xs tracking-[0.35em] text-white/80">CONFIGURAÇÕES</h2>
          <button onClick={onClose} className="rounded-full p-2 text-white/50 hover:text-white" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ---------------- Modelo ---------------- */}
        <Group icon={<Cpu className="h-4 w-4" />} title="Modelo Gemini Live">
          <div className="space-y-1.5">
            {MODEL_PRESETS.map((m) => (
              <ModelOption key={m.id} id={m.id} label={m.label} note={m.note} active={form.model === m.id} onPick={() => up("model", m.id)} />
            ))}
            {extra.map((m) => (
              <ModelOption key={m.id} id={m.id} label={m.label} note="Detectado na sua chave" active={form.model === m.id} onPick={() => up("model", m.id)} />
            ))}
          </div>
          <button onClick={loadModels} className="mt-3 flex items-center gap-1.5 text-[12px] text-cyan-300/80 hover:text-cyan-200">
            {loadingModels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Buscar modelos Live disponíveis para esta chave
          </button>
          {modelErr && <p className="mt-1 text-[11px] text-red-300">{modelErr}</p>}
          {remote.length > 0 && <p className="mt-1 text-[11px] text-white/40">{remote.length} modelos com suporte a bidiGenerateContent.</p>}

          <Label>Modelo personalizado (ID)</Label>
          <input value={form.model} onChange={(e) => up("model", e.target.value.trim())} className={inputCls} spellCheck={false} />

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <Label>Versão da API</Label>
              <select value={form.apiVersion} onChange={(e) => up("apiVersion", e.target.value as Settings["apiVersion"])} className={inputCls}>
                <option value="v1beta">v1beta (estável)</option>
                <option value="v1alpha">v1alpha (recursos novos)</option>
              </select>
            </div>
            <div>
              <Label>Idioma</Label>
              <select value={form.dialect} onChange={(e) => up("dialect", e.target.value as Settings["dialect"])} className={inputCls}>
                <option value="pt-BR">Português (Brasil)</option>
                <option value="pt-PT">Português (Portugal)</option>
              </select>
            </div>
          </div>

          <Label>Chave de API Gemini</Label>
          <input type="password" value={form.apiKey} onChange={(e) => up("apiKey", e.target.value.trim())} className={inputCls} />
          <button onClick={() => up("apiKey", defaultSettings.apiKey)} className="mt-1 text-[11px] text-cyan-300/70 hover:text-cyan-200">
            Restaurar chave embutida
          </button>
          <Toggle label="Pesquisa Google (dados em tempo real)" value={form.googleSearch} onChange={(v) => up("googleSearch", v)} />
          <Toggle label="Saudação dinâmica ao iniciar" value={form.greetOnStart} onChange={(v) => up("greetOnStart", v)} />
        </Group>

        {/* ---------------- Voz ---------------- */}
        <Group icon={<Volume2 className="h-4 w-4" />} title="Voz nativa do Gemini">
          <div className="grid grid-cols-2 gap-1.5">
            {VOICES.map((v) => (
              <button
                key={v.id}
                onClick={() => up("voice", v.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left transition",
                  form.voice === v.id ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/5"
                )}
              >
                <div className="text-sm text-white/90">{v.id}</div>
                <div className="text-[10px] leading-tight text-white/40">{v.desc}</div>
              </button>
            ))}
          </div>
        </Group>

        {/* ---------------- Conversa ---------------- */}
        <Group icon={<Mic className="h-4 w-4" />} title="Conversa ao vivo e interrupção">
          <Toggle label="Guarda de eco: silenciar o microfone enquanto o Jarvis fala" value={form.echoGuard} onChange={(v) => up("echoGuard", v)} />
          <p className="-mt-1 mb-1 text-[11px] leading-relaxed text-white/40">
            Evita que a IA ouça a própria voz pelos altifalantes. Enquanto ativa, interromper por voz ou palmas só funciona nas pausas entre frases;
            use o botão do microfone para cortar a fala.
          </p>
          <Toggle label="Interrupção local instantânea (falar por cima corta o áudio)" value={form.localBargeIn} onChange={(v) => up("localBargeIn", v)} />
          <Label>Sensibilidade de detecção de fala (servidor)</Label>
          <select value={form.vadSensitivity} onChange={(e) => up("vadSensitivity", e.target.value as Settings["vadSensitivity"])} className={inputCls}>
            <option value="high">Alta — interrompe mais rápido</option>
            <option value="low">Baixa — ambientes barulhentos</option>
          </select>
        </Group>

        {/* ---------------- Palmas ---------------- */}
        <Group icon={<Hand className="h-4 w-4" />} title="Dupla palma">
          <Toggle label="Ativar detecção de palmas" value={form.clapEnabled} onChange={(v) => up("clapEnabled", v)} />
          <Label>Sensibilidade: {Math.round(form.clapSensitivity * 100)}%</Label>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={form.clapSensitivity}
            onChange={(e) => up("clapSensitivity", Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <p className="mt-1 text-[11px] text-white/40">
            Nesta sessão: {s.clapCount} palmas • {s.doubleClapCount} duplas
          </p>
        </Group>

        {/* ---------------- Câmera ---------------- */}
        <Group icon={<Camera className="h-4 w-4" />} title="Câmera em tempo real">
          <Label>Quadros por segundo enviados: {form.cameraFps}</Label>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.5}
            value={form.cameraFps}
            onChange={(e) => up("cameraFps", Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
        </Group>

        {/* ---------------- Zapier (URL protegida — não editável na UI) ---------------- */}
        <Group icon={<Webhook className="h-4 w-4" />} title="Zapier • Gmail / Calendar / Drive">
          <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm", zapierConfigured ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-200" : "border-white/10 bg-white/5 text-white/50")}>
            {zapierConfigured ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <ShieldOff className="h-4 w-4 shrink-0" />}
            <span className="flex-1">{zapierConfigured ? "Integração ativa e protegida" : "Integração não configurada"}</span>
            <span className="font-mono text-[10px] text-white/40">{zapierMaskedLabel()}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            O endereço do webhook é injetado no build (variável de ambiente <code className="text-cyan-300/80">VITE_ZAPIER_URL</code>) e nunca é exibido
            nem editável aqui. O Jarvis usa-o em segundo plano para <code className="text-cyan-300/80">send_email</code>,{" "}
            <code className="text-cyan-300/80">read_emails</code>, <code className="text-cyan-300/80">reply_email</code>,{" "}
            <code className="text-cyan-300/80">create_calendar_event</code> e <code className="text-cyan-300/80">drive_create_note</code>.
          </p>
        </Group>

        <button
          onClick={save}
          className="mt-2 w-full rounded-2xl bg-cyan-400 py-3.5 text-sm font-semibold text-black shadow-[0_0_30px_-5px_rgba(34,211,238,0.7)] active:scale-[0.99]"
        >
          Salvar e aplicar
        </button>
        <p className="mt-2 text-center text-[10px] text-white/30">Alterar modelo, voz ou idioma reinicia a sessão Live.</p>
      </section>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/25 focus:border-cyan-400/50";

function ModelOption({ id, label, note, active, onPick }: { id: string; label: string; note: string; active: boolean; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
        active ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/5"
      )}
    >
      <span className={cn("h-3.5 w-3.5 shrink-0 rounded-full border-2", active ? "border-cyan-300 bg-cyan-300" : "border-white/30")} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white/90">{label}</span>
        <span className="block truncate font-mono text-[9.5px] text-white/35">
          {id.replace("models/", "")} • {note}
        </span>
      </span>
    </button>
  );
}

function Group({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2 text-cyan-300/90">
        {icon}
        <span className="text-sm font-medium text-white/90">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 mt-3 block text-[11px] uppercase tracking-wider text-white/40">{children}</label>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="mt-2 flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm text-white/80">
      <span>{label}</span>
      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition", value ? "bg-cyan-400" : "bg-white/15")}>
        <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", value ? "left-[22px]" : "left-0.5")} />
      </span>
    </button>
  );
}
