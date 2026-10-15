"use client";

import { useEffect, useRef } from "react";

/**
 * Глобальные эффекты страницы:
 *  - подсветка навигации при скролле + активный раздел
 *  - плавное появление блоков с классом .reveal (со стаггером)
 *  - полоса прогресса скролла
 *  - мягкое свечение, следящее за курсором
 *  - магнитные кнопки
 *  - 3D-наклон карточек от курсора + блик
 *  - параллакс мокапа приложения
 *  - счётчики в статистике героя
 *  - зернистость поверх всей страницы
 */
export function Effects() {
  const barRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = document.querySelector(".nav");
    const glow = glowRef.current;
    const fine =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: fine)").matches;

    // ================= скролл: шапка + прогресс =================
    const onScroll = () => {
      if (nav) {
        if (window.scrollY > 12) nav.classList.add("scrolled");
        else nav.classList.remove("scrolled");
      }
      const bar = barRef.current;
      if (bar) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const p = max > 0 ? window.scrollY / max : 0;
        bar.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // ================= появление блоков =================
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in-view"));
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in-view");
              io.unobserve(e.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
      els.forEach((el) => io.observe(el));
    }

    // ================= стаггер для сеток =================
    for (const sel of [".dl-grid", ".feat-grid", ".sc", ".footer-grid"]) {
      document.querySelectorAll(sel).forEach((group) => {
        Array.from(group.children).forEach((child, i) => {
          (child as HTMLElement).style.setProperty("--i", String(i));
        });
      });
    }

    // ================= активный раздел в навигации =================
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.nav-links a[href^="#"]')
    );
    let secIo: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      secIo = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            const id = "#" + e.target.id;
            links.forEach((l) =>
              l.classList.toggle("active", l.getAttribute("href") === id)
            );
          });
        },
        { rootMargin: "-38% 0px -55% 0px" }
      );
      ["download", "features", "app", "compare", "faq"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) secIo?.observe(el);
      });
    }

    // ================= счётчики героя =================
    let countIo: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      countIo = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            countIo?.unobserve(e.target);
            const el = e.target as HTMLElement;
            const txt = el.textContent ?? "";
            const m = txt.match(/\d+(?:[.,]\d+)?/);
            if (!m || m.index === undefined) return;
            const end = parseFloat(m[0].replace(",", "."));
            const dec = (m[0].split(/[.,]/)[1] ?? "").length;
            const prefix = txt.slice(0, m.index);
            const suffix = txt.slice(m.index + m[0].length);
            const dur = 1600;
            const t0 = performance.now();
            const tick = (now: number) => {
              const p = Math.min(1, (now - t0) / dur);
              const eased = 1 - Math.pow(1 - p, 3);
              el.textContent = prefix + (end * eased).toFixed(dec) + suffix;
              if (p < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          });
        },
        { threshold: 0.6 }
      );
      document
        .querySelectorAll<HTMLElement>(".hero-stats .stat b")
        .forEach((el) => countIo?.observe(el));
    }

    // ================= курсор, магнит, наклоны, параллакс =================
    let raf = 0;
    let mx = -1;
    let my = -1;
    let gx = -1;
    let gy = -1;
    let mRx = 0;
    let mRy = 0;
    const mockWrap = document.querySelector<HTMLElement>(".mock-wrap");
    const magnets = Array.from(
      document.querySelectorAll<HTMLElement>(".btn, .dl-btn")
    );
    const cleanups: Array<() => void> = [];

    if (fine) {
      const onMove = (e: MouseEvent) => {
        mx = e.clientX;
        my = e.clientY;
        document.body.classList.add("has-pointer");

        // магнитные кнопки
        for (const el of magnets) {
          const r = el.getBoundingClientRect();
          const dx = e.clientX - (r.left + r.width / 2);
          const dy = e.clientY - (r.top + r.height / 2);
          const dist = Math.hypot(dx, dy);
          const radius = Math.max(r.width, 110);
          if (dist < radius) {
            const pull = (1 - dist / radius) * 0.32;
            el.style.setProperty("--mx", `${(dx * pull).toFixed(1)}px`);
            el.style.setProperty("--my", `${(dy * pull).toFixed(1)}px`);
            el.classList.add("magnetic");
          } else if (el.classList.contains("magnetic")) {
            el.classList.remove("magnetic");
            el.style.setProperty("--mx", "0px");
            el.style.setProperty("--my", "0px");
          }
        }
      };
      window.addEventListener("mousemove", onMove, { passive: true });
      cleanups.push(() => {
        window.removeEventListener("mousemove", onMove);
        document.body.classList.remove("has-pointer");
      });

      // 3D-наклон карточек
      document.querySelectorAll<HTMLElement>(".tilt").forEach((el) => {
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          el.style.setProperty("--rx", `${((0.5 - py) * 7).toFixed(2)}deg`);
          el.style.setProperty("--ry", `${((px - 0.5) * 9).toFixed(2)}deg`);
          el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
          el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
        };
        const leave = () => {
          el.style.setProperty("--rx", "0deg");
          el.style.setProperty("--ry", "0deg");
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
        cleanups.push(() => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerleave", leave);
        });
      });

      // свечение + параллакс мокапа (сглаживание в rAF)
      const loop = () => {
        if (glow && mx >= 0) {
          if (gx < 0) {
            gx = mx;
            gy = my;
          }
          gx += (mx - gx) * 0.12;
          gy += (my - gy) * 0.12;
          glow.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
        }
        if (mockWrap && mx >= 0) {
          const tRx = (my / window.innerHeight - 0.5) * -4;
          const tRy = (mx / window.innerWidth - 0.5) * 6;
          mRx += (tRx - mRx) * 0.07;
          mRy += (tRy - mRy) * 0.07;
          mockWrap.style.setProperty("--rx", `${mRx.toFixed(3)}deg`);
          mockWrap.style.setProperty("--ry", `${mRy.toFixed(3)}deg`);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
      secIo?.disconnect();
      countIo?.disconnect();
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return (
    <>
      <div className="scroll-progress" ref={barRef} aria-hidden="true" />
      <div className="cursor-glow" ref={glowRef} aria-hidden="true" />
      <div className="noise" aria-hidden="true" />
    </>
  );
}
