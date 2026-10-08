import type { Metadata } from "next";
import { Archivo, Newsreader } from "next/font/google";
import { Header } from "@/components/shell/Header";
import { Footer } from "@/components/shell/Footer";
import { themeBootScript } from "@/components/shell/ThemeToggle";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
});

// Serif for page titles and section questions only — the publication voice.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Prumo — o dinheiro das campanhas eleitorais",
    template: "%s · Prumo",
  },
  description:
    "De onde veio e para onde foi o dinheiro de cada campanha eleitoral no Brasil, a partir dos dados públicos de prestação de contas do TSE.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${newsreader.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="flex min-h-full flex-col">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded focus:bg-raised focus:px-3 focus:py-2">
          Pular para o conteúdo
        </a>
        <Header />
        <main id="conteudo" className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
