import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `next/font/google` baixa a fonte da rede DURANTE o `next build`. No CI da
// imagem isso reprovou três vezes ("Can't resolve
// '@vercel/turbopack-next/internal/font/google/font'"), e a imagem que a VPS
// puxa deixava de ser publicada por um flake de rede do runner. A fonte vive
// no repositório (`next/font/local`, arquivos em `app/fonts/`).

const RAIZES = ["app", "components", "lib", "hooks"];

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.(tsx?|css)$/.test(nome)) acc.push(p);
  }
  return acc;
}

describe("build sem fonte do Google", () => {
  it("nenhum módulo importa next/font/google nem aponta o CSS para o Google Fonts", () => {
    const culpados: string[] = [];
    for (const raiz of RAIZES) {
      for (const arq of arquivos(raiz)) {
        const src = readFileSync(arq, "utf8");
        if (/from\s+["']next\/font\/google["']|https?:\/\/fonts\.(googleapis|gstatic)\.com/.test(src)) culpados.push(arq);
      }
    }
    expect(culpados).toEqual([]);
  });
});
