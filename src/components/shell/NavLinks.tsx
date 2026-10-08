"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { CURRENT_YEAR, YEARS, parseYear } from "@/lib/labels";

/*
 * Navigation follows the investigation journey rather than the data model:
 * an election → candidacies / parties / states → follow the money (donors, suppliers,
 * connections, transactions). Secondary entities stay one step away and in search.
 */

export const EXPLORE = [
  { href: "/candidatos", label: "Candidaturas" },
  { href: "/partidos", label: "Partidos" },
  { href: "/estados", label: "Estados" },
  { href: "/propostas", label: "Propostas" },
];

export const MONEY = [
  { href: "/transacoes", label: "Transações", desc: "Cada receita e despesa declarada, com filtros" },
  { href: "/fornecedores", label: "Fornecedores", desc: "Quem recebeu dinheiro das campanhas" },
  { href: "/doadores", label: "Doadores", desc: "Quem financiou as campanhas" },
  { href: "/empresas", label: "Empresas", desc: "Cadastro, sócios, contratos públicos e sanções, pelo CNPJ" },
  { href: "/conexoes", label: "Conexões", desc: "Siga as relações entre campanhas, empresas, pessoas e órgãos" },
];

const ABOUT = [
  { href: "/metodologia", label: "Metodologia" },
  { href: "/atualizacoes", label: "Atualizações dos dados" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** The election in view: `?ano=` or, on a candidacy, the year in its path. */
function useYear() {
  const params = useSearchParams();
  const pathname = usePathname();
  const ano = params.get("ano") ?? pathname.match(/^\/candidatos\/(\d{4})\//)?.[1] ?? null;
  return { year: parseYear(ano), q: ano ? `?ano=${ano}` : "" };
}

function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, close]);
  return ref;
}

function Menu_({ label, active, children }: { label: React.ReactNode; active: boolean; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss<HTMLLIElement>(open, close);
  return (
    <li ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1 py-2 text-[14.5px] ${active ? "text-ink" : "text-ink-2 hover:text-ink"}`}
      >
        {label}
        <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        {active && <span aria-hidden="true" className="absolute inset-x-0 -bottom-[11px] h-px bg-accent" />}
      </button>
      {open && <div className="raised absolute left-0 top-full z-50 mt-3 min-w-[280px] py-2">{children(close)}</div>}
    </li>
  );
}

export function NavLinks() {
  const pathname = usePathname();
  const { year, q } = useYear();
  const moneyActive = MONEY.some((m) => isActive(pathname, m.href));
  return (
    <nav aria-label="Principal">
      <ul className="flex items-center gap-6">
        <Menu_ label={<>Eleições {year}</>} active={pathname === "/"}>
          {(close) =>
            YEARS.map((y) => (
              <Link
                key={y}
                href={`/?ano=${y}`}
                onClick={close}
                className={`block px-4 py-2 no-underline hover:bg-[var(--hover)] ${y === year ? "text-ink" : "text-ink-2"}`}
              >
                <span className="font-medium">Eleições gerais {y}</span>
                <span className="block text-[13px] text-muted">{y === CURRENT_YEAR ? "Prestação de contas em andamento" : y === 2022 ? "Presidente, governadores, Congresso e assembleias" : "Prestação de contas final"}</span>
              </Link>
            ))
          }
        </Menu_>
        {EXPLORE.map((n) => {
          const on = isActive(pathname, n.href);
          return (
            <li key={n.href} className="relative">
              <Link href={`${n.href}${q}`} aria-current={on ? "page" : undefined} className={`block py-2 text-[14.5px] no-underline ${on ? "text-ink" : "text-ink-2 hover:text-ink"}`}>
                {n.label}
                {on && <span aria-hidden="true" className="absolute inset-x-0 -bottom-[11px] h-px bg-accent" />}
              </Link>
            </li>
          );
        })}
        <Menu_ label="Seguir o dinheiro" active={moneyActive}>
          {(close) =>
            MONEY.map((m) => (
              <Link key={m.href} href={`${m.href}${q}`} onClick={close} className="block px-4 py-2 no-underline hover:bg-[var(--hover)]">
                <span className={`font-medium ${isActive(pathname, m.href) ? "text-ink" : "text-ink"}`}>{m.label}</span>
                <span className="block text-[13px] text-muted">{m.desc}</span>
              </Link>
            ))
          }
        </Menu_>
      </ul>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const { q } = useYear();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const groups = [
    { title: "Eleições", items: YEARS.map((y) => ({ href: `/?ano=${y}`, label: `Eleições gerais ${y}` })) },
    { title: "Explorar", items: EXPLORE.map((e) => ({ href: `${e.href}${q}`, label: e.label })) },
    { title: "Seguir o dinheiro", items: MONEY.map((m) => ({ href: `${m.href}${q}`, label: m.label })) },
    { title: "Sobre os dados", items: ABOUT },
  ];
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpenOn(open ? null : pathname)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        className="grid h-9 w-9 place-items-center text-ink"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <nav id="mobile-nav" aria-label="Principal" className="absolute inset-x-0 top-full z-40 max-h-[80vh] overflow-y-auto border-b border-rule bg-raised px-4 pb-6 pt-2">
          {groups.map((g) => (
            <div key={g.title} className="border-b border-rule py-3 last:border-0">
              <div className="text-[13px] text-muted">{g.title}</div>
              <ul className="mt-1">
                {g.items.map((n) => (
                  <li key={n.href}>
                    <Link href={n.href} className="block py-2 text-[16px] no-underline">
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      )}
    </div>
  );
}
