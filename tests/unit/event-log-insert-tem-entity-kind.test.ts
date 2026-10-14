import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `event_log.entity_kind` é NOT NULL. Um insert direto (sem passar por
// `emit_event`) que o omite é recusado pelo banco, e como o write é
// fire-and-forget o evento some e só sobra uma linha no log do app.

const RAIZES = ["app", "lib", "workers"];

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, acc);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) acc.push(p);
  }
  return acc;
}

describe("insert direto em event_log", () => {
  it("sempre informa entity_kind", () => {
    const sem: string[] = [];
    for (const raiz of RAIZES) {
      for (const arq of arquivos(raiz)) {
        const src = readFileSync(arq, "utf8");
        const re = /\.from\(\s*"event_log"\s*\)\s*\.insert\(\s*\{([\s\S]*?)\}\s*(?:as never\s*)?\)/g;
        for (const m of src.matchAll(re)) {
          if (!/\bentity_kind\b/.test(m[1] ?? ""))sem.push(arq);
        }
      }
    }
    expect(sem).toEqual([]);
  });
});
