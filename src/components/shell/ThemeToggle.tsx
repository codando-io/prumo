"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";

type Mode = "system" | "light" | "dark";
const ORDER: Mode[] = ["system", "light", "dark"];
const LABEL: Record<Mode, string> = { system: "Tema do sistema", light: "Tema claro", dark: "Tema escuro" };

function read(): Mode {
  try {
    const v = localStorage.getItem("prumo-theme");
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("prumo-theme", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("prumo-theme", cb);
    window.removeEventListener("storage", cb);
  };
}

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, read, () => "system" as Mode);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    try {
      if (next === "system") localStorage.removeItem("prumo-theme");
      else localStorage.setItem("prumo-theme", next);
    } catch {
      /* storage unavailable: still apply for this page view */
    }
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
    window.dispatchEvent(new Event("prumo-theme"));
  }

  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : SunMoon;
  return (
    <button
      type="button"
      onClick={cycle}
      title={`${LABEL[mode]} (clique para trocar)`}
      aria-label={`${LABEL[mode]}. Trocar tema`}
      className="grid h-9 w-9 place-items-center rounded-[8px] text-ink-2 hover:bg-[var(--hover)]"
    >
      <Icon size={17} aria-hidden="true" />
    </button>
  );
}

/** Inline script for <head>: applies the stored theme before first paint. */
export const themeBootScript = `try{var t=localStorage.getItem('prumo-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;
