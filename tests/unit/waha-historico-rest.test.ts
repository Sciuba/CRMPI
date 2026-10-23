import { afterEach, describe, expect, it, vi } from "vitest";

import { WahaClient, WahaHistoricoError } from "@/lib/waha/client";

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

function responder(status: number, corpo: unknown) {
  const urls: string[] = [];
  globalThis.fetch = vi.fn(async (url: unknown) => {
    urls.push(String(url));
    return { ok: status >= 200 && status < 300, status, json: async () => corpo, text: async () => "" };
  }) as unknown as typeof fetch;
  return urls;
}

describe("ler o histórico que o aparelho entregou", () => {
  it("lista as conversas pela visão geral, com paginação", async () => {
    const urls = responder(200, [
      { id: "5511999990000@c.us", lastMessage: { timestamp: 1_790_000_000 } },
      { id: "1203@g.us" },
      { semId: true },
    ]);
    const conversas = await new WahaClient("http://w", "k").listarConversasDoAparelho("org 1", { limit: 20, offset: 40 });
    expect(urls[0]).toBe("http://w/api/org%201/chats/overview?limit=20&offset=40");
    expect(conversas).toEqual([
      { id: "5511999990000@c.us", ultimaEm: 1_790_000_000 },
      { id: "1203@g.us", ultimaEm: null },
    ]);
  });

  it("pede mensagens SEM baixar mídia, da mais nova, cortando a janela no servidor", async () => {
    const urls = responder(200, [{ id: "a", body: "oi", timestamp: 1 }, "lixo", 7]);
    const msgs = await new WahaClient("http://w", "k").listarMensagensDoChat("s", "5511@c.us", {
      limit: 100, offset: 0, desdeEm: 1_780_000_000.9,
    });
    const url = urls[0] ?? "";
    expect(url).toContain("/api/s/chats/5511%40c.us/messages?");
    expect(url).toContain("downloadMedia=false");
    expect(url).toContain("sortBy=timestamp&sortOrder=desc");
    expect(url).toContain("filter.timestamp.gte=1780000000");
    // O que não passa no contrato do payload é descartado, não propagado.
    expect(msgs.map((m) => m.id)).toEqual(["a"]);
  });

  it("erro carrega o status e NUNCA o corpo (conteúdo de conversa não vira log nem resposta)", async () => {
    responder(400, { message: "texto da conversa do cliente 5511999990000" });
    const erro = await new WahaClient("http://w", "k")
      .listarConversasDoAparelho("s", { limit: 20, offset: 0 })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(WahaHistoricoError);
    expect((erro as WahaHistoricoError).httpStatus).toBe(400);
    expect((erro as Error).message).toBe("waha_historico_400");
    expect((erro as Error).message).not.toContain("5511");
  });
});
