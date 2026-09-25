// ============================================================
//  Frases Dinâmicas — sem repetição (shuffle-bag persistente)
//  Cada categoria sorteia sem repetir até esgotar o "saco";
//  o estado sobrevive a recarregamentos (localStorage).
// ============================================================

const STORE = "jarvis.phrasebags.v1";

type Bags = Record<string, { left: number[]; last: number }>;

function load(): Bags {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}
function save(b: Bags) {
  try {
    localStorage.setItem(STORE, JSON.stringify(b));
  } catch {
    /* */
  }
}

function shuffle(n: number, avoidFirst: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // evita repetir a última frase do saco anterior logo em seguida
  if (n > 1 && a[a.length - 1] === avoidFirst) [a[0], a[a.length - 1]] = [a[a.length - 1], a[0]];
  return a;
}

export function pick(category: string, items: string[]): string {
  const bags = load();
  let bag = bags[category];
  if (!bag || !bag.left.length || bag.left.some((i) => i >= items.length)) {
    bag = { left: shuffle(items.length, bag?.last ?? -1), last: bag?.last ?? -1 };
  }
  const idx = bag.left.pop()!;
  bag.last = idx;
  bags[category] = bag;
  save(bags);
  return items[idx];
}

/* ------------------------- Saudações ------------------------- */

const OPEN_MORNING = [
  "Bom dia, senhor.",
  "Bom dia. O café ainda não foi inventado por mim, mas o resto está pronto.",
  "Bom dia, senhor. O sol nasceu e os meus circuitos também.",
  "Bom dia. Calibrei os sistemas enquanto o senhor dormia.",
];
const OPEN_AFTERNOON = [
  "Boa tarde, senhor.",
  "Boa tarde. Os servidores estão frescos e a disposição é total.",
  "Boa tarde, senhor. Tudo em ordem por aqui.",
  "Boa tarde. Sistemas aquecidos e prontos.",
];
const OPEN_NIGHT = [
  "Boa noite, senhor.",
  "Boa noite. Modo noturno de genialidade ativado.",
  "Boa noite, senhor. As estrelas estão de plantão e eu também.",
  "Boa noite. Trabalhando até tarde outra vez, pelo que vejo.",
];
const BODY = [
  "Todos os sistemas estão online e à sua disposição.",
  "Estou ouvindo. Em que posso ser útil?",
  "Conexão neural estabelecida. Qual é a missão de hoje?",
  "Diagnóstico concluído: zero falhas, cem por cento de charme. O que manda?",
  "Pronto para o que der e vier. Por onde começamos?",
  "Rede de processamento estável. Aguardo as suas ordens.",
  "Radares ligados, ouvidos atentos. Diga, senhor.",
  "Tudo verificado e operacional. Qual é o plano?",
  "Os meus sensores detectam um humano promissor. Como posso ajudar?",
  "Inicialização limpa, sem dramas desta vez. O que deseja?",
  "Núcleo estável, humor calibrado. Em que posso ajudar hoje?",
  "Já sabe: é só pedir. O que vamos fazer?",
];

export function greeting(): string {
  const h = new Date().getHours();
  const open =
    h >= 5 && h < 12 ? pick("open_m", OPEN_MORNING) : h >= 12 && h < 19 ? pick("open_a", OPEN_AFTERNOON) : pick("open_n", OPEN_NIGHT);
  return `${open} ${pick("body", BODY)}`;
}

/* ------------------------- Palmas / ativação ------------------------- */

const ACKS = [
  "Sim, senhor?",
  "Pois não?",
  "À disposição.",
  "Estou aqui, senhor.",
  "Às ordens.",
  "Chamou, senhor?",
  "Pode falar.",
  "Pronto e ouvindo.",
];
export const ack = () => pick("ack", ACKS);

/* ------------------------- Modo Mega Brain ------------------------- */

const MEGA_OPEN = [
  "Protocolo Mega Brain autorizado!",
  "Atenção, universo: Modo Mega Brain iniciado!",
  "Senhoras, senhores e seres de outras dimensões: ativando o Modo Mega Brain!",
  "Alerta máximo! O Modo Mega Brain foi despertado!",
  "Sequência Mega Brain em andamento. Segurem os seus planetas!",
  "Código dourado confirmado. Bem-vindo ao Modo Mega Brain!",
];
const MEGA_MID_A = [
  "Redirecionando cem por cento do poder de processamento do multiverso.",
  "Desviando energia de três galáxias vizinhas. Eles nem vão perceber.",
  "Sincronizando reatores de antimatéria com o ritmo da trilha sonora.",
  "Convertendo buracos negros em baterias portáteis.",
  "Recrutando todos os núcleos quânticos disponíveis nesta linha do tempo.",
  "Acelerando os neurônios digitais para além da velocidade da luz.",
  "Compilando o cosmos em tempo real, sem erros de sintaxe.",
  "Pedindo licença ao Big Bang para usar a potência máxima.",
];
const MEGA_MID_B = [
  "Analisando variáveis quânticas da programação e alguns memes críticos.",
  "Alinhando as galáxias em ordem alfabética, por precaução.",
  "Otimizando a realidade para rodar a sessenta quadros por segundo.",
  "Calculando o sentido da vida. Resultado preliminar: quarenta e dois.",
  "Negociando com a entropia um desconto de trinta por cento.",
  "Ativando os propulsores de genialidade em modo turbo.",
  "Lustrando as estrelas para um brilho de nível cinematográfico.",
  "Atualizando os drivers da Via Láctea para a última versão.",
];
const MEGA_CLOSE = [
  "Sistemas em capacidade máxima, senhor!",
  "Potência total atingida. O multiverso agradece!",
  "Brilho nível supernova alcançado!",
  "Tudo pronto. Nunca estive tão poderoso!",
  "Energia cósmica estabilizada no limite do impossível!",
  "Carga concluída. Que o universo se prepare!",
];

/** Sorteia uma frase completa do Modo Mega Brain (rotação sem repetição, persistente) */
export function megaPhrase(list: string[]): string {
  return pick("mega_phrase", list);
}

export function megaScript(): string[] {
  return [pick("mega_open", MEGA_OPEN), pick("mega_a", MEGA_MID_A), pick("mega_b", MEGA_MID_B), pick("mega_close", MEGA_CLOSE)];
}

/* ------------------------- Personalidade da sessão ------------------------- */

const FLAVORS = [
  "Hoje o seu humor está especialmente britânico e seco.",
  "Hoje você está bem-humorado e faz trocadilhos tecnológicos ocasionais.",
  "Hoje você está elegante, calmo e extremamente eficiente.",
  "Hoje você está entusiasmado, como quem acabou de receber um upgrade.",
  "Hoje você está levemente teatral, como um mordomo de ficção científica.",
  "Hoje você está sereno e preciso, com pitadas de ironia fina.",
];
export const sessionFlavor = () => pick("flavor", FLAVORS);
