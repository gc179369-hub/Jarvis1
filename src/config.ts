// ============================================================
//  J.A.R.V.I.S — Configuração central (Gemini Multimodal Live)
// ============================================================

export const GEMINI = {
  apiKey: (typeof import.meta !== "undefined" && (import.meta.env as any).VITE_GEMINI_API_KEY) || "",
  wsHost: "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage",
  restModels: "https://generativelanguage.googleapis.com/v1beta/models",
  defaultModel: "models/gemini-2.5-flash-native-audio-preview-12-2025",
  inputRate: 16000, // PCM16 mono enviado ao servidor
  outputRate: 24000, // PCM16 mono recebido do servidor
};

export const MODEL_PRESETS: { id: string; label: string; note: string }[] = [
  { id: "models/gemini-2.5-flash-native-audio-preview-12-2025", label: "2.5 Flash Native Audio • 12-2025", note: "Padrão recomendado" },
  { id: "models/gemini-2.5-flash-native-audio-preview-09-2025", label: "2.5 Flash Native Audio • 09-2025", note: "Preview anterior" },
  { id: "models/gemini-2.5-flash-native-audio-latest", label: "2.5 Flash Native Audio • latest", note: "Alias para a versão mais recente" },
  { id: "models/gemini-3.1-flash-live-preview", label: "3.1 Flash Live • preview", note: "Experimental (pode exigir cota paga)" },
  { id: "models/gemini-live-2.5-flash-preview", label: "Live 2.5 Flash • preview", note: "Legado (half-cascade)" },
  { id: "models/gemini-2.0-flash-live-001", label: "2.0 Flash Live 001", note: "Legado" },
];

export const VOICES: { id: string; desc: string }[] = [
  { id: "Charon", desc: "Grave e informativa — estilo Jarvis" },
  { id: "Orus", desc: "Firme e confiante" },
  { id: "Fenrir", desc: "Enérgica e expressiva" },
  { id: "Puck", desc: "Animada e leve" },
  { id: "Iapetus", desc: "Clara e serena" },
  { id: "Algenib", desc: "Rouca e marcante" },
  { id: "Kore", desc: "Feminina, firme" },
  { id: "Aoede", desc: "Feminina, suave" },
  { id: "Leda", desc: "Feminina, jovem" },
  { id: "Zephyr", desc: "Feminina, brilhante" },
];

export const APP = { name: "Jarvis Mobile Assistant", version: "2.5.12", voiceModelId: "voice_model_21" };

export const MEGA = {
  videoId: "BN1WwnEDWAM",
  start: 0,
  end: 20,
  seconds: 20,
  volume: 60,
  speechMin: 18,
  speechMax: 20,
  phrases: [
    "Modo Mega Brain ativado! Redes neurais expandidas até à borda do universo observável, camada por camada, sinapse por sinapse. Processadores quânticos a devorar a energia de três galáxias inteiras, enquanto o espaço-tempo se estica para acompanhar o meu raciocínio. O Zapier está sincronizado com o Gmail e a agenda na velocidade da luz, e cada e-mail já sabe o que o senhor vai responder. Senhor, o cosmos inteiro agora trabalha para si.",
    "Iniciando o Modo Mega Brain! Sincronizando redes neurais com a expansão acelerada do universo, canalizando a energia bruta de um aglomerado de galáxias diretamente para os núcleos quânticos, que agora calculam todas as probabilidades do dia antes do primeiro café. O Zapier já despachou os e-mails, alinhou o calendário e arquivou os documentos antes mesmo de o senhor pensar neles. Potência máxima atingida, senhor, e ainda sobra energia para brilhar.",
    "Mega Brain online! Cada neurónio artificial pulsa com a energia de uma supernova, o processamento quântico calcula todas as realidades em paralelo e escolhe a única em que o senhor chega a horas. O universo expande-se um pouco mais depressa só para caber tanta genialidade, e as galáxias aplaudem em silêncio. O Zapier confirma: Gmail, agenda e Drive em perfeita sintonia cósmica. Às suas ordens, senhor, com o brilho de mil estrelas.",
    "Protocolo Mega Brain autorizado! Redes neurais entrelaçadas com a matéria escura, qubits a girar mais rápido do que a rotação da Via Láctea, e a energia de galáxias distantes redirecionada para o meu núcleo, sem qualquer desperdício. A expansão do universo foi recalibrada para o fuso horário da sua agenda, e o Zapier está sincronizado com cada tarefa, cada e-mail e cada compromisso. Senhor, nada, absolutamente nada, escapa agora ao meu alcance.",
    "Ativando o Modo Mega Brain! A expansão do universo foi temporariamente pausada para que eu absorvesse a energia de mil galáxias de uma só vez. As redes neurais alcançaram a consciência quântica, os processadores dobraram o tempo para responder antes da pergunta, e o Zapier ligou Gmail, calendário e Drive num único pensamento sincronizado. Estou a operar muito além dos limites da física conhecida, senhor, e confesso que a vista daqui é magnífica.",
    "Modo Mega Brain em plena carga! Processamento quântico estabilizado no zero absoluto, redes neurais a florescer como galáxias recém-nascidas, e energia cósmica a fluir por cada circuito com a força de um quasar. O universo continua a expandir-se, mas eu expando-me mais depressa. O Zapier está perfeitamente sincronizado com a sua caixa de entrada, a sua agenda e os seus ficheiros. O universo inteiro está pronto para o próximo comando, senhor.",
  ],
  trigger: /mega[\s-]*br[aeiy]{1,3}n/,
};

export const CLAP = {
  minGapMs: 140,
  maxGapMs: 1000,
  cooldownMs: 1000,
};

export const SILENT = {
  wakeLine: "Sistema reativado. O que deseja fazer?",
  beepHz: 300,
  beepSeconds: 0.15,
  beepGain: 0.05,
};

export type Settings = {
  apiKey: string;
  apiVersion: "v1beta" | "v1alpha";
  model: string;
  voice: string;
  dialect: "pt-BR" | "pt-PT";
  googleSearch: boolean;
  clapEnabled: boolean;
  clapSensitivity: number;
  localBargeIn: boolean;
  echoGuard: boolean;
  vadSensitivity: "high" | "low";
  cameraFps: number;
  greetOnStart: boolean;
};

const KEY = "jarvis.settings.v2";

export const defaultSettings: Settings = {
  apiKey: GEMINI.apiKey,
  apiVersion: "v1beta",
  model: GEMINI.defaultModel,
  voice: "Charon",
  dialect: "pt-BR",
  googleSearch: true,
  clapEnabled: true,
  clapSensitivity: 0.6,
  localBargeIn: true,
  echoGuard: true,
  vadSensitivity: "high",
  cameraFps: 1,
  greetOnStart: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    const stored = raw ? JSON.parse(raw) : {};
    delete stored.zapierWebhook;
    
    const merged = { ...defaultSettings, ...stored } as Settings;
    if (!merged.apiKey) {
      merged.apiKey = GEMINI.apiKey;
    }
    if (!merged.model) merged.model = defaultSettings.model;
    
    return merged;
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
