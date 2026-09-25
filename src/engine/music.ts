// ============================================================
//  Trilha do Modo Mega Brain — EXCLUSIVAMENTE YouTube
//  https://youtu.be/BN1WwnEDWAM  →  iframe embed com
//  ?autoplay=1&start=0&end=20&enablejsapi=1
//  • Sem áudio local, sem ficheiros .mp3, sem sintetizador de reserva.
//  • O iframe é criado no instante da ativação (dentro do gesto do utilizador)
//    e destruído aos 20s ou quando o player reporta ENDED.
// ============================================================
import { MEGA } from "../config";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_ORIGIN = "https://www.youtube.com";

let apiPromise: Promise<any> | null = null;
function loadYouTubeAPI(): Promise<any> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = `${YT_ORIGIN}/iframe_api`;
    s.async = true;
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
    setTimeout(() => resolve(window.YT ?? null), 8000);
  });
  return apiPromise;
}

/** URL oficial do embed com os parâmetros de corte obrigatórios */
export function megaEmbedUrl() {
  const p = new URLSearchParams({
    autoplay: "1",
    start: String(MEGA.start),
    end: String(MEGA.end),
    enablejsapi: "1",
    controls: "0",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
    origin: location.origin,
  });
  return `${YT_ORIGIN}/embed/${MEGA.videoId}?${p.toString()}`;
}

export class MusicPlayer {
  private host: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private player: any = null;
  private playing = false;
  private stopTimer: number | null = null;
  private fadeTimer: number | null = null;
  private volume = MEGA.volume;
  onStateChange?: (playing: boolean, source: "youtube" | null) => void;
  /** Disparado quando o player reporta que o clipe realmente começou a tocar */
  onStarted?: () => void;
  /** Disparado se o YouTube não conseguir reproduzir (bloqueio/sem rede) */
  onUnavailable?: (reason: string) => void;

  /** Apenas pré-carrega a API JS (sem criar player nem tocar nada) */
  preload(containerId: string) {
    this.host = document.getElementById(containerId);
    loadYouTubeAPI();
  }

  get isPlaying() {
    return this.playing;
  }

  /**
   * Toca o trecho 0→20s de https://youtu.be/BN1WwnEDWAM e para aos 20s.
   * Deve ser chamado dentro de um gesto do utilizador em navegadores móveis.
   */
  playIntro(seconds: number = MEGA.seconds) {
    this.stop();
    this.playing = true;
    this.volume = MEGA.volume;

    // 1) iframe com os parâmetros exatos — o autoplay arranca já dentro do gesto
    const host = this.host ?? document.body;
    document.getElementById("mega-brain-yt")?.remove(); // nunca dois players
    const iframe = document.createElement("iframe");
    iframe.id = "mega-brain-yt";
    iframe.src = megaEmbedUrl();
    iframe.width = "1";
    iframe.height = "1";
    iframe.allow = "autoplay; encrypted-media";
    iframe.setAttribute("playsinline", "1");
    iframe.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
    host.appendChild(iframe);
    this.iframe = iframe;
    this.onStateChange?.(true, "youtube");

    // 2) liga a API JS ao iframe para volume/fade/estado (enablejsapi=1)
    loadYouTubeAPI().then((YT) => {
      if (!YT?.Player || this.iframe !== iframe) return;
      try {
        this.player = new YT.Player(iframe, {
          events: {
            onReady: (e: any) => {
              if (this.iframe !== iframe) return;
              e.target.unMute?.();
              e.target.setVolume?.(this.volume);
              e.target.playVideo?.();
            },
            onStateChange: (e: any) => {
              if (this.iframe !== iframe) return;
              if (e.data === 1) this.onStarted?.(); // PLAYING
              if (e.data === 0) this.stop(); // ENDED em end=20
            },
            onError: (e: any) => {
              if (this.iframe !== iframe) return;
              this.onUnavailable?.(`YouTube erro ${e?.data ?? ""}`.trim());
            },
          },
        });
      } catch {
        /* a API JS é opcional: o iframe já toca sozinho */
      }
    });

    // 3) fade suave nos últimos 2s
    this.fadeTimer = window.setTimeout(() => {
      const iv = window.setInterval(() => {
        if (this.iframe !== iframe) return clearInterval(iv);
        this.volume = Math.max(0, this.volume - 6);
        try {
          this.player?.setVolume?.(this.volume);
        } catch {
          /* */
        }
        if (this.volume <= 0) clearInterval(iv);
      }, 180);
    }, Math.max(0, (seconds - 2) * 1000));

    // 4) fecho garantido exatamente aos 20s
    this.stopTimer = window.setTimeout(() => this.stop(), seconds * 1000);
  }

  /** Para o áudio e destrói o player/iframe */
  stop() {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    this.stopTimer = this.fadeTimer = null;
    try {
      this.player?.stopVideo?.();
      this.player?.destroy?.();
    } catch {
      /* */
    }
    this.player = null;
    if (this.iframe) {
      // postMessage direto (funciona mesmo sem a API JS carregada)
      try {
        this.iframe.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "stopVideo", args: [] }), YT_ORIGIN);
      } catch {
        /* */
      }
      this.iframe.src = "about:blank"; // corta o áudio mesmo antes do GC
      this.iframe.remove();
      this.iframe = null;
    }
    document.getElementById("mega-brain-yt")?.remove();
    if (this.playing) {
      this.playing = false;
      this.onStateChange?.(false, null);
    }
  }
}
