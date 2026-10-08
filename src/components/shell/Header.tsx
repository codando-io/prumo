import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { MobileNav, NavLinks } from "./NavLinks";
import { SearchPalette } from "@/components/search/SearchPalette";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-bg/92 backdrop-blur supports-[backdrop-filter]:bg-bg/80">
      <div className="relative mx-auto flex h-[60px] max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Logo />
        <div className="hidden lg:block">
          <Suspense fallback={<div className="w-[520px]" />}>
            <NavLinks />
          </Suspense>
        </div>
        <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3">
          <div className="w-10 sm:w-full sm:max-w-[300px] xl:max-w-[240px] 2xl:max-w-[300px]">
            <SearchPalette />
          </div>
          <Link href="/metodologia" className="action hidden whitespace-nowrap text-[14px] xl:block">
            Sobre os dados
          </Link>
          <ThemeToggle />
          <Suspense>
            <MobileNav />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
