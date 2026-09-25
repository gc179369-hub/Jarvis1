import { useEffect, useRef } from "react";
import { engine, type Phase, type MegaState } from "../engine/JarvisEngine";

type Props = { onTap: () => void };

type P = { x: number; y: number; z: number; r: number; ph: number; sz: number; white: boolean };
type Halo = { a: number; r: number; tilt: number; spd: number; sz: number; ph: number };
type Star = { x: number; y: number; sz: number; ph: number; depth: number };

const MODE_STYLE: Record<string, { hue: number; sat: number; energy: number; spin: number }> = {
  dormant: { hue: 212, sat: 70, energy: 0.35, spin: 0.25 },
  standby: { hue: 200, sat: 85, energy: 0.55, spin: 0.45 },
  listening: { hue: 188, sat: 100, energy: 0.85, spin: 0.7 },
  thinking: { hue: 268, sat: 95, energy: 0.9, spin: 2.2 },
  speaking: { hue: 182, sat: 100, energy: 1, spin: 0.9 },
  mega: { hue: 44, sat: 100, energy: 1.25, spin: 1.6 },
};

function styleKey(phase: Phase, mega: MegaState) {
  if (phase === "mega" || mega === "charging") return "mega";
  if (phase === "connecting") return "standby";
  return phase;
}

function makeSprite(hue: number, sat: number) {
  const s = document.createElement("canvas");
  s.width = s.height = 64;
  const g = s.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, `hsla(${hue},${sat}%,97%,1)`);
  grd.addColorStop(0.12, `hsla(${hue},${sat}%,80%,0.9)`);
  grd.addColorStop(0.35, `hsla(${hue},${sat}%,60%,0.28)`);
  grd.addColorStop(1, `hsla(${hue},${sat}%,50%,0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return s;
}

export default function ParticleOrb({ onTap }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { alpha: false })!;
    let W = 0, H = 0, DPR = 1, R = 150;
    const pos = { x: 0, y: 0, vx: 0, vy: 0, init: false };

    let parts: P[] = [];
    let halo: Halo[] = [];
    let stars: Star[] = [];
    let pairs: [number, number][] = [];

    const whiteSprite = makeSprite(200, 20);
    let sprite = makeSprite(188, 100);
    let spriteHue = 188;

    const cur = { hue: 212, sat: 70, energy: 0.35, spin: 0.25, level: 0 };

    function build() {
      const mobile = W < 640;
      const N = mobile ? 460 : 760;
      parts = [];
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const rad = Math.sqrt(1 - y * y);
        const th = golden * i;
        parts.push({
          x: Math.cos(th) * rad,
          y,
          z: Math.sin(th) * rad,
          r: 0.9 + Math.random() * 0.14,
          ph: Math.random() * Math.PI * 2,
          sz: 0.5 + Math.random() * 1.3,
          white: Math.random() < 0.28,
        });
      }
      // pares da constelação (distâncias preservadas pela rotação)
      pairs = [];
      const M = mobile ? 150 : 230;
      const idx = Array.from({ length: N }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, M);
      const count = new Map<number, number>();
      for (let a = 0; a < idx.length; a++) {
        for (let b = a + 1; b < idx.length; b++) {
          const p = parts[idx[a]], q = parts[idx[b]];
          const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
          if (d < 0.36 && (count.get(a) ?? 0) < 3 && (count.get(b) ?? 0) < 3) {
            pairs.push([idx[a], idx[b]]);
            count.set(a, (count.get(a) ?? 0) + 1);
            count.set(b, (count.get(b) ?? 0) + 1);
          }
        }
      }
      halo = Array.from({ length: mobile ? 90 : 150 }, () => ({
        a: Math.random() * Math.PI * 2,
        r: 1.25 + Math.random() * 0.75,
        tilt: (Math.random() - 0.5) * 1.4,
        spd: (0.15 + Math.random() * 0.5) * (Math.random() < 0.5 ? 1 : -1),
        sz: 0.4 + Math.random() * 1.1,
        ph: Math.random() * 6.28,
      }));
      stars = Array.from({ length: mobile ? 110 : 200 }, () => ({
        x: Math.random(),
        y: Math.random(),
        sz: Math.random() * 1.2 + 0.2,
        ph: Math.random() * 6.28,
        depth: 0.2 + Math.random() * 0.8,
      }));
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * DPR;
      canvas.height = H * DPR;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      R = Math.max(85, Math.min(210, Math.min(W, H) * 0.27));
      if (!pos.init) {
        pos.x = W / 2;
        pos.y = H * 0.44;
        pos.init = true;
      }
      pos.x = Math.min(Math.max(pos.x, R * 0.6), W - R * 0.6);
      pos.y = Math.min(Math.max(pos.y, R * 0.6), H - R * 0.6);
      build();
    }
    resize();
    window.addEventListener("resize", resize);

    /* ---------------- Drag / fling ---------------- */
    let drag: { id: number; ox: number; oy: number; sx: number; sy: number; t: number; lx: number; ly: number; lt: number; moved: boolean } | null = null;

    const onDown = (e: PointerEvent) => {
      const d = Math.hypot(e.clientX - pos.x, e.clientY - pos.y);
      if (d > R * 1.35) return;
      canvas.setPointerCapture(e.pointerId);
      const now = performance.now();
      drag = { id: e.pointerId, ox: e.clientX - pos.x, oy: e.clientY - pos.y, sx: e.clientX, sy: e.clientY, t: now, lx: e.clientX, ly: e.clientY, lt: now, moved: false };
      pos.vx = pos.vy = 0;
    };
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const now = performance.now();
      const dt = Math.max(1, now - drag.lt);
      pos.vx = ((e.clientX - drag.lx) / dt) * 16;
      pos.vy = ((e.clientY - drag.ly) / dt) * 16;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      drag.lt = now;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 8) drag.moved = true;
      pos.x = e.clientX - drag.ox;
      pos.y = e.clientY - drag.oy;
    };
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = !drag.moved && performance.now() - drag.t < 350;
      if (performance.now() - drag.lt > 80) pos.vx = pos.vy = 0;
      drag = null;
      if (tap) tapRef.current();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    /* ---------------- Render loop ---------------- */
    let rotY = 0, rotX = 0.35;
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      const t = now / 1000;
      const st = engine.state;
      const key = styleKey(st.phase, st.mega);
      const target = MODE_STYLE[key] ?? MODE_STYLE.standby;
      const k = 1 - Math.pow(0.02, dt);
      // interpola hue pelo caminho mais curto
      let dh = target.hue - cur.hue;
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      cur.hue = (cur.hue + dh * k + 360) % 360;
      cur.sat += (target.sat - cur.sat) * k;
      cur.energy += (target.energy - cur.energy) * k;
      cur.spin += (target.spin - cur.spin) * k;
      const lvl = engine.visualLevel();
      cur.level += (lvl - cur.level) * (lvl > cur.level ? 0.45 : 0.1);
      const L = cur.level;

      if (Math.abs(cur.hue - spriteHue) > 3) {
        sprite = makeSprite(cur.hue, cur.sat);
        spriteHue = cur.hue;
      }

      // física do fling
      if (!drag) {
        pos.x += pos.vx;
        pos.y += pos.vy;
        pos.vx *= 0.93;
        pos.vy *= 0.93;
        const pad = R * 0.55;
        if (pos.x < pad) { pos.x = pad; pos.vx = Math.abs(pos.vx) * 0.6; }
        if (pos.x > W - pad) { pos.x = W - pad; pos.vx = -Math.abs(pos.vx) * 0.6; }
        if (pos.y < pad) { pos.y = pad; pos.vy = Math.abs(pos.vy) * 0.6; }
        if (pos.y > H - pad) { pos.y = H - pad; pos.vy = -Math.abs(pos.vy) * 0.6; }
      }

      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);

      // estrelas de fundo (parallax)
      ctx.globalCompositeOperation = "lighter";
      const px = (pos.x - W / 2) / W, py = (pos.y - H / 2) / H;
      for (const s of stars) {
        const a = 0.25 + 0.35 * Math.sin(t * 1.3 + s.ph);
        ctx.fillStyle = `rgba(200,225,255,${a * s.depth})`;
        const x = (s.x * W - px * 30 * s.depth + W) % W;
        const y = (s.y * H - py * 30 * s.depth + H) % H;
        ctx.fillRect(x, y, s.sz, s.sz);
      }

      rotY += dt * cur.spin * (1 + L * 1.5);
      rotX = 0.35 + Math.sin(t * 0.3) * 0.25;
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      const breathe = 1 + Math.sin(t * (key === "mega" ? 4 : 1.4)) * 0.025 * cur.energy;
      const Rb = R * breathe * (1 + L * 0.12);
      const f = 2.6;

      // núcleo luminoso
      const coreR = Rb * (1.05 + L * 0.5);
      const cg = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, coreR * 1.6);
      cg.addColorStop(0, `hsla(${cur.hue},${cur.sat}%,70%,${0.22 * cur.energy + L * 0.25})`);
      cg.addColorStop(0.35, `hsla(${cur.hue},${cur.sat}%,50%,${0.08 * cur.energy + L * 0.08})`);
      cg.addColorStop(1, "hsla(0,0%,0%,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, coreR * 1.6, 0, Math.PI * 2);
      ctx.fill();

      // projeção
      const proj = new Float32Array(parts.length * 4);
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const wob = 1 + Math.sin(t * 3 + p.ph * 3 + p.y * 4) * 0.06 * L + Math.sin(t * 7 + p.ph) * 0.03 * L;
        const rr = p.r * wob;
        let x = p.x * rr, y = p.y * rr, z = p.z * rr;
        const x1 = x * cy - z * sy;
        const z1 = x * sy + z * cy;
        const y1 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;
        x = x1; y = y1; z = z2;
        const s = f / (f + z);
        proj[i * 4] = pos.x + x * Rb * s;
        proj[i * 4 + 1] = pos.y + y * Rb * s;
        proj[i * 4 + 2] = z;
        proj[i * 4 + 3] = s;
      }

      // linhas da constelação
      ctx.lineWidth = 0.6;
      ctx.strokeStyle = `hsla(${cur.hue},${cur.sat}%,75%,${0.1 + 0.18 * cur.energy + L * 0.2})`;
      ctx.beginPath();
      for (const [a, b] of pairs) {
        if (proj[a * 4 + 2] > 0.25 && proj[b * 4 + 2] > 0.25) continue; // omite fundo
        ctx.moveTo(proj[a * 4], proj[a * 4 + 1]);
        ctx.lineTo(proj[b * 4], proj[b * 4 + 1]);
      }
      ctx.stroke();

      // partículas
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const z = proj[i * 4 + 2], s = proj[i * 4 + 3];
        const depth = (1 - z) * 0.5; // 0 fundo → 1 frente
        const tw = 0.6 + 0.4 * Math.sin(t * 2.2 + p.ph * 5);
        const alpha = Math.min(1, (0.18 + depth * 0.82) * tw * (0.55 + cur.energy * 0.45 + L * 0.4));
        const size = p.sz * s * (2.6 + L * 3.2) * (R / 150) * (p.white ? 1.25 : 1);
        ctx.globalAlpha = alpha;
        ctx.drawImage(p.white ? whiteSprite : sprite, proj[i * 4] - size * 2, proj[i * 4 + 1] - size * 2, size * 4, size * 4);
      }

      // halo orbital
      for (const h of halo) {
        const a = h.a + t * h.spd * (0.6 + cur.spin * 0.5);
        const r = h.r * (1 + L * 0.35);
        const hx = Math.cos(a) * r;
        const hz = Math.sin(a) * r;
        const hy = hz * Math.sin(h.tilt);
        const zz = hz * Math.cos(h.tilt);
        const s = f / (f + zz * 0.5);
        const x = pos.x + hx * Rb * s;
        const y = pos.y + hy * Rb * s;
        const size = h.sz * s * 3 * (R / 150);
        ctx.globalAlpha = (0.25 + 0.4 * Math.sin(t * 2 + h.ph) ** 2) * cur.energy;
        ctx.drawImage(sprite, x - size * 2, y - size * 2, size * 4, size * 4);
      }
      ctx.globalAlpha = 1;

      // anéis de energia
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        ctx.strokeStyle = `hsla(${cur.hue},${cur.sat}%,70%,${0.12 + L * 0.25})`;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y, Rb * (1.18 + i * 0.12 + L * 0.1), Rb * (0.28 + i * 0.1), rotY * (i ? -0.6 : 0.4) + i, 0, Math.PI * 2);
        ctx.stroke();
      }

      // raios do Modo Mega
      if (key === "mega") {
        const n = 28;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + t * 0.4;
          const len = Rb * (0.4 + 0.5 * Math.abs(Math.sin(t * 3 + i * 1.7))) * (st.megaPower / 100 + 0.3);
          const g = ctx.createLinearGradient(
            pos.x + Math.cos(ang) * Rb * 1.05, pos.y + Math.sin(ang) * Rb * 1.05,
            pos.x + Math.cos(ang) * (Rb * 1.05 + len), pos.y + Math.sin(ang) * (Rb * 1.05 + len)
          );
          g.addColorStop(0, `hsla(${cur.hue},100%,75%,0.5)`);
          g.addColorStop(1, "hsla(0,0%,0%,0)");
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(pos.x + Math.cos(ang) * Rb * 1.05, pos.y + Math.sin(ang) * Rb * 1.05);
          ctx.lineTo(pos.x + Math.cos(ang) * (Rb * 1.05 + len), pos.y + Math.sin(ang) * (Rb * 1.05 + len));
          ctx.stroke();
        }
      }

      // onda de choque da palma
      const sinceClap = now - engine.clapFlashAt;
      if (sinceClap < 700) {
        const pr = sinceClap / 700;
        ctx.strokeStyle = `hsla(${cur.hue},100%,85%,${(1 - pr) * 0.7})`;
        ctx.lineWidth = 2 * (1 - pr) + 0.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Rb * (1 + pr * 1.2), 0, Math.PI * 2);
        ctx.stroke();
      }

      // expõe posição para a UI (legendas acompanham o orbe)
      canvas.dataset.ox = String(Math.round(pos.x));
      canvas.dataset.oy = String(Math.round(pos.y));
      canvas.dataset.or = String(Math.round(Rb));
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 block touch-none select-none" style={{ touchAction: "none" }} />;
}
