"use client";

import { useEffect, useRef } from "react";

/**
 * 3D-фон сайта — чистый canvas, без сторонних библиотек:
 *  - звёздное поле с перспективой, мерцанием и редкими падающими звёздами;
 *  - вращающийся каркасный глобус-сеть с орбитами и спутниками;
 *  - параллакс от курсора; при скролле глобус уходит вверх и гаснет.
 */
export function Scene3D() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let w = window.innerWidth;
    let h = window.innerHeight;
    let raf = 0;
    let scrollY = window.scrollY;
    let mx = 0; // мышь -0.5..0.5 (сглаженная)
    let my = 0;
    let tmx = 0;
    let tmy = 0;

    // ---------------- звёзды ----------------
    const COLORS = ["#ffffff", "#cfe6ff", "#2fa8ff", "#7c5cff", "#23e6c3"];
    type Star = { x: number; y: number; z: number; tw: number; c: string };
    const stars: Star[] = [];
    const starRespawn = (s: Star, far = false) => {
      s.x = (Math.random() - 0.5) * 2.6;
      s.y = (Math.random() - 0.5) * 2.6;
      s.z = far ? 1 : Math.random() * 0.75 + 0.25;
      s.tw = Math.random() * Math.PI * 2;
      s.c = COLORS[(Math.random() * COLORS.length) | 0];
    };
    const STAR_N = w < 760 ? 80 : 150;
    for (let i = 0; i < STAR_N; i++) {
      const s: Star = { x: 0, y: 0, z: 0, tw: 0, c: "#fff" };
      starRespawn(s);
      stars.push(s);
    }

    // ---------------- глобус (сфера Фибоначчи) ----------------
    type Node3 = { x: number; y: number; z: number };
    const NODE_N = w < 760 ? 120 : 230;
    const nodes: Node3[] = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < NODE_N; i++) {
      const y = 1 - (i / (NODE_N - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = golden * i;
      nodes.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r });
    }
    // рёбра сети: сосед по спирали + «дальний сосед» для фактуры
    const arcs: Array<[number, number]> = [];
    for (let i = 0; i < NODE_N; i++) {
      arcs.push([i, (i + 1) % NODE_N]);
      arcs.push([i, (i + 9) % NODE_N]);
    }
    // большие круги (меридианы/экватор) — каркас глобуса
    const RINGS: Array<Array<[number, number, number]>> = [];
    const ringCount = 3;
    const ringSeg = 72;
    for (let rIdx = 0; rIdx < ringCount; rIdx++) {
      const tilt = (rIdx * Math.PI) / ringCount;
      const ring: Array<[number, number, number]> = [];
      for (let i = 0; i <= ringSeg; i++) {
        const a = (i / ringSeg) * Math.PI * 2;
        const x = Math.cos(a);
        const z = Math.sin(a);
        // наклон плоскости кольца
        ring.push([x, z * Math.sin(tilt), z * Math.cos(tilt)]);
      }
      RINGS.push(ring);
    }

    // ---------------- падающие звёзды ----------------
    type Comet = { x: number; y: number; vx: number; vy: number; life: number } | null;
    let comet: Comet = null;
    let nextComet = 3000;

    // ---------------- размер холста ----------------
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // ---------------- отрисовка кадра ----------------
    const drawGlobe = (
      t: number,
      cx: number,
      cy: number,
      R: number,
      alphaMul: number,
      ay: number,
      ax: number
    ) => {
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);

      // мягкая перспектива
      const persp = 3.1;

      const project = (nx: number, ny: number, nz: number) => {
        const x1 = nx * cosY + nz * sinY;
        const z1 = -nx * sinY + nz * cosY;
        const y2 = ny * cosX - z1 * sinX;
        const z2 = ny * sinX + z1 * cosX;
        const f = persp / (persp + z2);
        return {
          sx: cx + x1 * R * f,
          sy: cy + y2 * R * f,
          d: (z2 + 1) / 2, // 0 — дальняя точка, 1 — ближняя
        };
      };

      // подсветка в центре глобуса
      const glow = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.7);
      glow.addColorStop(0, `rgba(47, 168, 255, ${0.1 * alphaMul})`);
      glow.addColorStop(0.55, `rgba(124, 92, 255, ${0.05 * alphaMul})`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.7, 0, Math.PI * 2);
      ctx.fill();

      // каркасные кольца
      ctx.lineWidth = 1;
      for (const ring of RINGS) {
        ctx.beginPath();
        let started = false;
        for (const [rx, ry, rz] of ring) {
          const p = project(rx, ry, rz);
          if (!started) {
            ctx.moveTo(p.sx, p.sy);
            started = true;
          } else ctx.lineTo(p.sx, p.sy);
        }
        ctx.strokeStyle = `rgba(124, 160, 255, ${0.1 * alphaMul})`;
        ctx.stroke();
      }

      // рёбра сети
      for (const [i, j] of arcs) {
        const a = nodes[i];
        const b = nodes[j];
        const p1 = project(a.x, a.y, a.z);
        const p2 = project(b.x, b.y, b.z);
        const d = Math.min(p1.d, p2.d);
        ctx.strokeStyle = `rgba(47, 168, 255, ${(0.03 + 0.1 * d * d) * alphaMul})`;
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }

      // узлы
      for (let i = 0; i < NODE_N; i++) {
        const n = nodes[i];
        const p = project(n.x, n.y, n.z);
        const a = (0.12 + 0.75 * p.d * p.d) * alphaMul;
        const size = 0.7 + p.d * 1.7;
        ctx.fillStyle = `rgba(190, 224, 255, ${a})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
        ctx.fill();
        // редкие «горящие» узлы
        if (i % 23 === 0) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 0.003 + i);
          ctx.fillStyle = `rgba(35, 230, 195, ${(0.25 + 0.5 * pulse) * alphaMul})`;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, size + 1.6 + pulse, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // орбиты со спутниками
      for (let o = 0; o < 2; o++) {
        const orbA = t * 0.00035 * (o === 0 ? 1 : -0.8) + o * Math.PI;
        const rad = R * (1.38 + o * 0.22);
        const tilt = 0.42 - o * 0.75;
        const ecc = 0.34 + o * 0.1;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, rad, rad * (1 - ecc), 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(124, 92, 255, ${0.13 * alphaMul})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        // спутник + хвост
        for (let k = 5; k >= 0; k--) {
          const a = orbA - k * 0.09;
          const sx = Math.cos(a) * rad;
          const sy = Math.sin(a) * rad * (1 - ecc);
          const fade = 1 - k / 6;
          ctx.fillStyle =
            k === 0
              ? `rgba(35, 230, 195, ${0.95 * alphaMul})`
              : `rgba(47, 168, 255, ${0.28 * fade * alphaMul})`;
          ctx.beginPath();
          ctx.arc(sx, sy, k === 0 ? 2.6 : 1.6 * fade, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);

      // фоновые звёзды
      for (const s of stars) {
        if (!reduced) {
          s.z -= 0.00045 * (0.5 + (1 - s.z));
          if (s.z < 0.22) starRespawn(s, true);
        }
        const f = 1 / s.z;
        const sx = w / 2 + (s.x + mx * (1 - s.z) * -0.55) * f * w * 0.36;
        const sy = h / 2 + (s.y + my * (1 - s.z) * -0.4) * f * h * 0.42;
        if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * 0.0022 + s.tw);
        const a = (1 - s.z) * 0.85 * tw;
        const r = (1.05 - s.z) * 1.9 + 0.25;
        ctx.fillStyle = s.c;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // глобус: справа в героe, уходит вверх при скролле
      const wide = w > 920;
      const cx = wide ? w * 0.74 : w * 0.5;
      const cy = h * 0.46 - scrollY * 0.32;
      const R = Math.min(w, h) * (wide ? 0.21 : 0.26);
      const fade = Math.max(0, Math.min(1, 1 - scrollY / (h * 0.85)));
      if (fade > 0.01 && cy > -R * 2) {
        const ay = t * 0.00019 + mx * 0.6;
        const ax = -0.34 + my * 0.35;
        drawGlobe(t, cx, cy, R, fade, ay, ax);
      }

      // падающая звезда
      if (!reduced) {
        if (!comet && t > nextComet) {
          const fromLeft = Math.random() > 0.5;
          comet = {
            x: fromLeft ? -60 : w + 60,
            y: Math.random() * h * 0.4,
            vx: (fromLeft ? 1 : -1) * (7 + Math.random() * 5),
            vy: 2.5 + Math.random() * 2.5,
            life: 1,
          };
          nextComet = t + 6000 + Math.random() * 7000;
        }
        if (comet) {
          comet.x += comet.vx;
          comet.y += comet.vy;
          comet.life -= 0.012;
          const grad = ctx.createLinearGradient(
            comet.x,
            comet.y,
            comet.x - comet.vx * 14,
            comet.y - comet.vy * 14
          );
          grad.addColorStop(0, `rgba(255, 255, 255, ${0.8 * comet.life})`);
          grad.addColorStop(1, "rgba(124, 92, 255, 0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(comet.x, comet.y);
          ctx.lineTo(comet.x - comet.vx * 14, comet.y - comet.vy * 14);
          ctx.stroke();
          if (comet.life <= 0 || comet.x < -140 || comet.x > w + 140) comet = null;
        }
      }
    };

    // ---------------- цикл и события ----------------
    const frame = (t: number) => {
      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;
      draw(t);
      raf = requestAnimationFrame(frame);
    };

    const onScroll = () => {
      scrollY = window.scrollY;
    };
    const onPointer = (e: PointerEvent) => {
      tmx = e.clientX / w - 0.5;
      tmy = e.clientY / h - 0.5;
    };
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !reduced) {
        raf = requestAnimationFrame(frame);
      }
    };

    if (reduced) {
      draw(0); // статичный кадр для тех, кто просил меньше движения
    } else {
      raf = requestAnimationFrame(frame);
      window.addEventListener("pointermove", onPointer, { passive: true });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className="scene3d" aria-hidden="true" />;
}
