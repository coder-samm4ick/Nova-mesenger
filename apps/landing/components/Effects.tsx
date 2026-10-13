"use client";

import { useEffect } from "react";

/**
 * Глобальные эффекты страницы:
 *  - подсветка навигации при скролле
 *  - плавное появление блоков с классом .reveal
 */
export function Effects() {
  useEffect(() => {
    const nav = document.querySelector(".nav");
    const onScroll = () => {
      if (!nav) return;
      if (window.scrollY > 12) nav.classList.add("scrolled");
      else nav.classList.remove("scrolled");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

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

    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
