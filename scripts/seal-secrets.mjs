// Gera src/engine/_sealed.ts com os segredos do .env já ofuscados (XOR+base64),
// de modo que o bundle final NÃO contenha a URL em texto claro.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const env = {};
for (const f of [".env", ".env.local"]) if (existsSync(f)) for (const line of readFileSync(f, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const url = process.env.VITE_ZAPIER_URL || env.VITE_ZAPIER_URL || "";
const K = 0x5a;
const seal = (s) => { const b = Buffer.from(s, "utf8"); let o = ""; for (let i = 0; i < b.length; i++) o += String.fromCharCode(b[i] ^ ((K + i) & 0xff)); return Buffer.from(o, "latin1").toString("base64"); };
writeFileSync("src/engine/_sealed.ts", `// GERADO AUTOMATICAMENTE por scripts/seal-secrets.mjs — não editar, não versionar.\nexport const ZAPIER_BLOB = ${JSON.stringify(url ? seal(url) : "")};\n`);
console.log(url ? "✔ segredos selados (Zapier configurado)" : "⚠ VITE_ZAPIER_URL ausente — Zapier desativado");
