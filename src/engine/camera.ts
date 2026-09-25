// ============================================================
//  CameraStreamer — feed de vídeo em tempo real para o Gemini Live
//  getUserMedia → <video> oculto → canvas → JPEG base64 (N fps)
// ============================================================

export type Facing = "user" | "environment";

export class CameraStreamer {
  stream: MediaStream | null = null;
  facing: Facing = "environment";
  fps = 1;
  onFrame?: (b64: string) => void;
  private video: HTMLVideoElement;
  private canvas = document.createElement("canvas");
  private timer: number | null = null;

  constructor() {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("muted", "");
    this.video = v;
  }

  get active() {
    return !!this.stream;
  }

  async start(facing: Facing = this.facing) {
    this.stopTracks();
    this.facing = facing;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24 } },
      audio: false,
    });
    this.stream = stream;
    this.video.srcObject = stream;
    await this.video.play().catch(() => {});
    this.restartTimer();
    return stream;
  }

  setFps(fps: number) {
    this.fps = Math.max(0.2, Math.min(4, fps));
    if (this.stream) this.restartTimer();
  }

  private restartTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = window.setInterval(() => this.capture(), 1000 / this.fps);
    window.setTimeout(() => this.capture(), 350);
  }

  private capture() {
    const v = this.video;
    if (!this.stream || !v.videoWidth) return;
    const max = 768;
    const k = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * k);
    const h = Math.round(v.videoHeight * k);
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    const url = this.canvas.toDataURL("image/jpeg", 0.6);
    const b64 = url.slice(url.indexOf(",") + 1);
    if (b64) this.onFrame?.(b64);
  }

  private stopTracks() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stopTracks();
    this.video.srcObject = null;
  }
}
