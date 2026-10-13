"use client";

import { useState } from "react";
import { Plus } from "./Icons";

export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="faq">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className={`faq-item ${isOpen ? "open" : ""}`}>
            <button
              className="faq-q"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className="faq-plus">
                <Plus width={16} height={16} />
              </span>
            </button>
            <div className="faq-a">{item.a}</div>
          </div>
        );
      })}
    </div>
  );
}
