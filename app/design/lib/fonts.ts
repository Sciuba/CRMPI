import localFont from "next/font/local";

// Fontes empacotadas (ver `app/layout.tsx`): o build não pode depender de baixar
// nada do Google. Cada família é UM arquivo variável `latin`, exceto as de peso
// fixo. Atkinson e Plex Mono são as mesmas do produto (`app/fonts/`).
// Note: next/font requires module-level constants; we expose all 4 pair vars
// at once. CSS swaps via --font-display / --font-body / --font-mono picker.

export const bricolage = localFont({
  src: "./fonts-files/bricolage-grotesque.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-bricolage",
});

export const jakarta = localFont({
  src: "./fonts-files/plus-jakarta-sans.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-jakarta",
});

export const fraunces = localFont({
  src: "./fonts-files/fraunces.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-fraunces",
});

export const manrope = localFont({
  src: "./fonts-files/manrope.woff2",
  weight: "200 800",
  display: "swap",
  variable: "--font-manrope",
});

export const atkinson = localFont({
  src: [
    { path: "../../fonts/atkinson-hyperlegible-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/atkinson-hyperlegible-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-atkinson",
});

export const sourceSerif = localFont({
  src: "./fonts-files/source-serif-4.woff2",
  weight: "200 900",
  display: "swap",
  variable: "--font-source-serif",
});

export const plexSans = localFont({
  src: [
    { path: "./fonts-files/ibm-plex-sans-300.woff2", weight: "300", style: "normal" },
    { path: "./fonts-files/ibm-plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts-files/ibm-plex-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts-files/ibm-plex-sans-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts-files/ibm-plex-sans-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-sans",
});

export const plexMono = localFont({
  src: [
    { path: "../../fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
  display: "swap",
  variable: "--font-plex-mono",
});

export const jetbrains = localFont({
  src: "./fonts-files/jetbrains-mono.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-jetbrains",
});

export const allFontVariables = [
  bricolage.variable,
  jakarta.variable,
  fraunces.variable,
  manrope.variable,
  atkinson.variable,
  sourceSerif.variable,
  plexSans.variable,
  plexMono.variable,
  jetbrains.variable,
].join(" ");
