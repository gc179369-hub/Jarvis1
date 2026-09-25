// ============================================================
//  Ferramentas — functionDeclarations do Gemini Live + executores
//  • Zapier (Gmail / Calendar / Drive) via Webhook "Catch Hook"
//  • APIs públicas sem chave (clima, câmbio, cripto, Wikipedia…)
//  • Controles locais (Modo Mega Brain, câmera, timer, links)
//  Para expandir: adicione uma entrada em TOOLS.
// ============================================================
import type { Facing } from "./camera";
import { sendToJarvisWebhook, zapierConfigured } from "./secrets";

export type ToolContext = {
  startMegaBrian: () => Record<string, unknown>;
  setCamera: (on: boolean, facing?: Facing) => Promise<string>;
  setTimer: (seconds: number, label: string) => void;
};

type Schema = { type: string; description?: string; properties?: Record<string, Schema>; required?: string[]; enum?: string[] };
type ToolDef = {
  description: string;
  parameters?: Schema;
  run: (args: Record<string, any>, ctx: ToolContext) => Promise<Record<string, unknown>>;
};

const S = (description: string): Schema => ({ type: "STRING", description });
const N = (description: string): Schema => ({ type: "NUMBER", description });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "OBJECT", properties, required });

async function getJSON(url: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function geolocate(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 }
    );
  });
}

/** Envia a ação ao Zapier pelo canal seguro (URL nunca exposta ao frontend/UI) */
async function zapier(action: string, payload: Record<string, unknown>, _ctx: ToolContext) {
  if (!zapierConfigured) {
    return {
      status: "nao_configurado",
      instrucao: "A integração com o Zapier não está configurada nesta instalação. Informe o usuário de forma breve.",
    };
  }
  const r = await sendToJarvisWebhook(action, payload, { via: "function_call" });
  return { status: r.reason, http: r.status, resposta: r.body };
}

const WMO: Record<number, string> = {
  0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado", 3: "nublado", 45: "neblina", 48: "neblina com geada",
  51: "garoa fraca", 53: "garoa", 55: "garoa forte", 61: "chuva fraca", 63: "chuva", 65: "chuva forte", 71: "neve fraca",
  73: "neve", 75: "neve forte", 80: "pancadas de chuva", 81: "pancadas fortes", 82: "tempestade", 95: "trovoadas",
  96: "trovoadas com granizo", 99: "trovoadas severas",
};

export const TOOLS: Record<string, ToolDef> = {
  /* ---------------- Gmail / Google via Zapier ---------------- */
  send_email: {
    description: "Envia um e-mail pelo Gmail do usuário (via Zapier). Confirme destinatário e conteúdo se estiverem ambíguos.",
    parameters: obj({ to: S("E-mail do destinatário"), subject: S("Assunto"), body: S("Corpo do e-mail"), cc: S("Cópia (opcional)") }, ["to", "subject", "body"]),
    run: (a, c) => zapier("send_email", a, c),
  },
  read_emails: {
    description: "Pede ao Zapier para buscar e-mails recentes do Gmail (ex.: não lidos, de um remetente).",
    parameters: obj({ query: S("Filtro de busca do Gmail, ex.: is:unread from:joao"), max_results: N("Quantidade máxima") }),
    run: (a, c) => zapier("read_emails", a, c),
  },
  reply_email: {
    description: "Responde a um e-mail existente no Gmail via Zapier.",
    parameters: obj({ thread_query: S("Como identificar a conversa (remetente/assunto)"), body: S("Texto da resposta") }, ["thread_query", "body"]),
    run: (a, c) => zapier("reply_email", a, c),
  },
  create_calendar_event: {
    description: "Cria um evento no Google Calendar via Zapier. Use datas ISO 8601 no fuso local do usuário.",
    parameters: obj({ title: S("Título"), start: S("Início ISO 8601"), end: S("Fim ISO 8601 (opcional)"), description: S("Descrição (opcional)") }, ["title", "start"]),
    run: (a, c) => zapier("create_event", a, c),
  },
  drive_create_note: {
    description: "Cria um documento/nota no Google Drive via Zapier.",
    parameters: obj({ title: S("Título"), content: S("Conteúdo") }, ["title", "content"]),
    run: (a, c) => zapier("drive_create_doc", a, c),
  },

  /* ---------------- Utilitários públicos ---------------- */
  get_weather: {
    description: "Clima atual e previsão de 3 dias. Sem cidade, usa a localização do aparelho.",
    parameters: obj({ city: S("Cidade (opcional)") }),
    run: async (a) => {
      let lat: number, lon: number, place = "localização atual";
      if (a.city) {
        const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(a.city)}&count=1&language=pt`);
        if (!g.results?.length) return { erro: "Cidade não encontrada" };
        lat = g.results[0].latitude;
        lon = g.results[0].longitude;
        place = `${g.results[0].name}, ${g.results[0].country}`;
      } else {
        const p = await geolocate();
        if (!p) return { erro: "Localização negada; pergunte a cidade." };
        ({ lat, lon } = p);
      }
      const w = await getJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=3`
      );
      return {
        local: place,
        agora: { temp_c: w.current.temperature_2m, sensacao: w.current.apparent_temperature, umidade: w.current.relative_humidity_2m, vento_kmh: w.current.wind_speed_10m, condicao: WMO[w.current.weather_code] ?? "" },
        dias: w.daily.time.map((d: string, i: number) => ({ dia: d, max: w.daily.temperature_2m_max[i], min: w.daily.temperature_2m_min[i], chuva_pct: w.daily.precipitation_probability_max[i], condicao: WMO[w.daily.weather_code[i]] ?? "" })),
      };
    },
  },
  get_exchange_rate: {
    description: "Cotação de moedas fiduciárias.",
    parameters: obj({ from: S("Moeda de origem, ex.: USD"), to: S("Moeda de destino, ex.: BRL"), amount: N("Valor") }, ["from", "to"]),
    run: async (a) => {
      const from = String(a.from || "USD").toUpperCase();
      const to = String(a.to || "BRL").toUpperCase();
      const d = await getJSON(`https://open.er-api.com/v6/latest/${from}`);
      const rate = d.rates?.[to];
      return rate ? { from, to, taxa: rate, valor: rate * (Number(a.amount) || 1), atualizado: d.time_last_update_utc } : { erro: "Moeda inválida" };
    },
  },
  get_crypto_price: {
    description: "Preço atual de uma criptomoeda em BRL, USD e EUR.",
    parameters: obj({ coin: S("id CoinGecko, ex.: bitcoin, ethereum, solana") }, ["coin"]),
    run: async (a) => getJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(String(a.coin).toLowerCase())}&vs_currencies=brl,usd,eur&include_24hr_change=true`),
  },
  wikipedia_summary: {
    description: "Resumo enciclopédico de um tema (Wikipedia em português).",
    parameters: obj({ query: S("Tema") }, ["query"]),
    run: async (a) => {
      const s = await getJSON(`https://pt.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&origin=*&search=${encodeURIComponent(a.query || "")}`);
      const title = s?.[1]?.[0];
      if (!title) return { erro: "Nada encontrado" };
      const d = await getJSON(`https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
      return { titulo: d.title, resumo: d.extract };
    },
  },

  /* ---------------- Controles locais ---------------- */
  activate_mega_brian: {
    description:
      "Ativa o protocolo especial 'Modo Mega Brain' (trilha sonora + apresentação intergaláctica). Chame SOMENTE quando o usuário pedir explicitamente para ativar o modo mega brain.",
    parameters: obj({}),
    run: async (_a, c) => c.startMegaBrian(),
  },
  camera_control: {
    description: "Liga ou desliga a câmera em tempo real para você enxergar o ambiente. Use 'user' para câmera frontal e 'environment' para traseira.",
    parameters: obj({ on: { type: "BOOLEAN", description: "true liga, false desliga" }, facing: { type: "STRING", enum: ["user", "environment"], description: "Qual câmera" } }, ["on"]),
    run: async (a, c) => ({ resultado: await c.setCamera(!!a.on, a.facing) }),
  },
  set_timer: {
    description: "Cria um temporizador; quando terminar, o sistema avisará você para alertar o usuário.",
    parameters: obj({ seconds: N("Duração em segundos"), label: S("Rótulo (opcional)") }, ["seconds"]),
    run: async (a, c) => {
      const s = Math.max(1, Number(a.seconds) || 60);
      c.setTimer(s, String(a.label || ""));
      return { status: "agendado", segundos: s };
    },
  },
  open_url: {
    description: "Abre um site ou aplicativo em nova aba (YouTube, Maps, pesquisa…).",
    parameters: obj({ url: S("URL completa https://") }, ["url"]),
    run: async (a) => {
      const w = window.open(String(a.url), "_blank", "noopener");
      return w ? { status: "aberto" } : { status: "bloqueado", instrucao: "O navegador bloqueou o pop-up; peça para o usuário tocar no link no histórico." };
    },
  },
};

export function functionDeclarations() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
    ...(t.parameters && Object.keys(t.parameters.properties || {}).length ? { parameters: t.parameters } : {}),
  }));
}

export async function runTool(name: string, args: Record<string, any>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const t = TOOLS[name];
  if (!t) return { erro: `Ferramenta desconhecida: ${name}` };
  try {
    return await t.run(args || {}, ctx);
  } catch (e: any) {
    return { erro: String(e?.message || e) };
  }
}
