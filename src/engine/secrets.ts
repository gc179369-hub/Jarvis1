// ============================================================
//  Segredos injetados no BUILD (import.meta.env.VITE_*)
//  • A URL do Zapier NÃO existe em texto claro nas fontes do app: vem do
//    ficheiro .env (fora do bundle de código) e é embutida pelo Vite na
//    compilação, guardada aqui de forma ofuscada (XOR + base64) e só
//    decodificada em memória no instante do fetch.
//  • Nunca é exposta na UI, no estado React nem no localStorage.
//  Nota honesta: código que corre no navegador nunca é 100% secreto —
//  isto evita exposição óbvia/inspeção casual. Para sigilo real, encaminhe
//  o webhook por um proxy/serverless seu.
// ============================================================

const K = 0x5a;

function scramble(s: string) {
  const bytes = new TextEncoder().encode(s);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] ^ ((K + i) & 0xff));
  return btoa(out);
}

function unscramble(b: string) {
  const raw = atob(b);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) ^ ((K + i) & 0xff);
  return new TextDecoder().decode(bytes);
}

// Selado em tempo de build (scripts/seal-secrets.mjs lê VITE_ZAPIER_URL do .env
// e grava já ofuscado em _sealed.ts) => o bundle nunca contém a URL em claro.
import { ZAPIER_BLOB } from "./_sealed";
void scramble; // mantido para gerar blobs manualmente se necessário

/** true se o webhook do Zapier foi configurado no build */
export const zapierConfigured = ZAPIER_BLOB.length > 0;

/** Devolve a URL apenas no momento do uso (nunca a mantenha em estado/UI) */
export function zapierUrl(): string {
  return ZAPIER_BLOB ? unscramble(ZAPIER_BLOB) : "";
}

/** Rótulo seguro para exibir na UI (sem revelar a URL) */
export function zapierMaskedLabel(): string {
  if (!ZAPIER_BLOB) return "não configurado";
  try {
    const u = new URL(zapierUrl());
    return `${u.hostname} • ••••${u.pathname.replace(/\/$/, "").slice(-4)}`;
  } catch {
    return "configurado";
  }
}

/**
 * Envia um evento ao Zapier em segundo plano (transparente para o utilizador).
 * Sem Content-Type customizado => requisição "simples", sem preflight CORS.
 */
export async function sendToJarvisWebhook(action: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const url = zapierUrl();
  if (!url) return { ok: false, status: 0, body: null as unknown, reason: "nao_configurado" };
  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify({ action, timestamp: new Date().toISOString(), source: "jarvis-live", ...extra, data }),
      keepalive: true,
    });
    let body: unknown = null;
    const txt = await res.text().catch(() => "");
    try {
      body = JSON.parse(txt);
    } catch {
      body = txt.slice(0, 1500);
    }
    return { ok: res.ok, status: res.status, body, reason: res.ok ? "enviado" : "falhou" };
  } catch (e: any) {
    return { ok: false, status: 0, body: null as unknown, reason: String(e?.message || e) };
  }
}
