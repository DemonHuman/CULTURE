"use client";

import { useState } from "react";
import type { ReactNode } from "react";

// Chaque joueur reçoit une des quatre couleurs selon son ordre d'arrivée
const COLORS = [
  "bg-tomate text-white",
  "bg-bleu text-white",
  "bg-soleil text-nuit",
  "bg-menthe text-nuit",
];

export const playerColor = (index: number) => COLORS[index % COLORS.length];

export function Shell({
  children,
  wide = false,
  center = false,
}: {
  children: ReactNode;
  wide?: boolean;
  center?: boolean;
}) {
  return (
    <main
      className={`min-h-dvh flex justify-center px-4 pb-12 pt-12 sm:pt-16 ${
        center ? "items-center" : "items-start"
      }`}
    >
      <div className={`w-full space-y-6 ${wide ? "max-w-2xl" : "max-w-md"}`}>{children}</div>
    </main>
  );
}

export function Wordmark() {
  return (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-display text-6xl tracking-wide text-white sm:text-7xl">Zculture</h1>
      <div className="flex items-center gap-2" aria-hidden>
        <span className="h-4 w-4 rounded-full bg-tomate" />
        <span className="h-4 w-4 rounded-[4px] bg-bleu" />
        <span
          className="h-4 w-4 bg-soleil"
          style={{ clipPath: "polygon(50% 0, 100% 100%, 0 100%)" }}
        />
        <span className="h-3 w-3 rotate-45 rounded-[3px] bg-menthe" />
      </div>
    </div>
  );
}

export function Avatar({
  name,
  index,
  size = "md",
}: {
  name: string;
  index: number;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "lg" ? "h-14 w-14 text-2xl" : size === "sm" ? "h-8 w-8 text-base" : "h-10 w-10 text-lg";
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display ${dim} ${playerColor(index)}`}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

// Le code du salon : une tuile colorée par caractère, avec un bouton pour le copier
export function CodeTiles({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // le presse-papiers peut être indisponible : on ignore
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2 sm:gap-3" role="img" aria-label={`Code du salon : ${code}`}>
        {code.split("").map((c, i) => (
          <span
            key={i}
            className={`flex h-16 w-12 items-center justify-center rounded-2xl font-display text-4xl shadow-[0_6px_0_rgb(0_0_0/0.28)] sm:h-20 sm:w-16 sm:text-5xl ${playerColor(i)}`}
          >
            {c}
          </span>
        ))}
      </div>
      <button onClick={copy} className="btn btn-ghost btn-sm">
        {copied ? "Code copié" : "Copier le code"}
      </button>
    </div>
  );
}

// Choix parmi quelques valeurs numériques (nombre de questions, durée...)
export function Pills({
  options,
  value,
  onChange,
  suffix = "",
}: {
  options: number[];
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={`rounded-full px-4 py-1.5 text-base font-extrabold transition focus-visible:outline-4 focus-visible:outline-bleu ${
            o === value ? "bg-soleil text-nuit" : "bg-brume text-nuit/60 hover:text-nuit"
          }`}
        >
          {o}
          {suffix}
        </button>
      ))}
    </div>
  );
}