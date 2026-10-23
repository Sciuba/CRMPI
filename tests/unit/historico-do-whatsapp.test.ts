import { describe, expect, it, vi } from "vitest";

import { WahaHistoricoError, type WahaClient } from "@/lib/waha/client";
import type { WahaPayload } from "@/lib/waha/envelope";
import {
  ESPERA_APOS_PAREAR_MS,
  ORCAMENTO_DA_RODADA_MS,
  conversaImportavel,
  executarRodadaDoHistorico,
  mensagemParaImportar,
  type SessaoParaImportar,
} from "@/lib/waha/historico";
import { pedirImportacaoDoHistorico } from "@/lib/waha/historico-pedido";
import type { Admin } from "@/lib/waha/ingest";

const ORG = "11111111-1111-4111-8111-111111111111";
const SESSAO = "22222222-2222-4222-8222-222222222222";
const PEDIDO_EM = "2026-10-23T12:00:00.000Z";
const DEPOIS_DA_ESPERA = Date.parse(PEDIDO_EM) + ESPERA_APOS_PAREAR_MS + 1_000;

function msg(extra: Partial<WahaPayload>): WahaPayload {
  return { id: "false_5511999990000@c.us_ABC", timestamp: 1_790_000_000, fromMe: false, body: "oi", ...extra };
}

describe("o que do aparelho entra no CRM", () => {
  it("texto de entrada e de saída viram mensagens, com direção e data", () => {
    expect(mensagemParaImportar(msg({ body: "quero registrar uma marca" }))).toMatchObject({
      direction: "inbound", type: "text", body: "quero registrar uma marca", midia: false,
      sent_at: "2026-09-21T14:13:20.000Z",
    });
    expect(mensagemParaImportar(msg({ fromMe: true }))?.direction).toBe("outbound");
  });

  it("mídia entra marcada, sem inventar texto", () => {
    const m = mensagemParaImportar(msg({ body: "", type: "audio", hasMedia: true }));
    expect(m).toMatchObject({ type: "audio", body: null, midia: true });
  });

  it("legenda de mídia é preservada", () => {
    expect(mensagemParaImportar(msg({ body: "o contrato", type: "document", hasMedia: true }))).toMatchObject({
      type: "document", body: "o contrato", midia: true,
    });
  });

  it.each([
    ["sem id", msg({ id: null })],
    ["sem data", msg({ timestamp: null })],
    ["vazia e sem mídia", msg({ body: "" })],
    ["reação", msg({ type: "reaction", body: "👍" })],
  ])("descarta: %s", (_nome, payload) => {
    expect(mensagemParaImportar(payload)).toBeNull();
  });

  it("só pessoas: grupo, estado e lista de difusão ficam de fora", () => {
    expect(conversaImportavel("5511999990000@c.us")).toBe(true);
    expect(conversaImportavel("123456789012345@lid")).toBe(true);
    expect(conversaImportavel("120363000000000000@g.us")).toBe(false);
    expect(conversaImportavel("status@broadcast")).toBe(false);
    expect(conversaImportavel("12345@newsletter")).toBe(false);
  });
});

/** Banco de mentira: só o que o importador toca, e registra o que foi gravado. */
function bancoFalso(metadata: Record<string, unknown> | null, opts: { corrida?: boolean } = {}) {
  let meta = metadata;
  const gravados: Array<Record<string, unknown>> = [];
  const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];
  const admin = {
    from() {
      let atualizando: { metadata: Record<string, unknown> } | null = null;
      let pedeLinhas = false;
      const b: Record<string, unknown> = {
        select: () => { pedeLinhas = true; return b; },
        eq: () => b,
        is: () => b,
        update: (v: { metadata: Record<string, unknown> }) => { atualizando = v; pedeLinhas = false; return b; },
        maybeSingle: async () => ({ data: { metadata: meta }, error: null }),
        then: (resolve: (v: unknown) => void) => {
          if (atualizando) {
            if (opts.corrida) return resolve({ data: [], error: null });
            meta = atualizando.metadata;
            gravados.push(atualizando.metadata);
            return resolve({ data: pedeLinhas ? [{ id: SESSAO }] : null, error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      // `select` depois de `update` (pedido) deve pedir as linhas gravadas.
      b.select = () => { pedeLinhas = true; return b; };
      return b;
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      if (nome === "fn_upsert_wa_contact") return { data: `contato-${String(args.p_chat_id)}`, error: null };
      if (nome === "fn_importar_historico_whatsapp") return { data: (args.p_msgs as unknown[]).length, error: null };
      return { data: null, error: null };
    },
  };
  return { admin: admin as unknown as Admin, gravados, rpcs, meta: () => meta };
}

function wahaFalso(conversas: Array<Array<{ id: string }>>, porChat: Record<string, WahaPayload[]>) {
  let pagina = 0;
  return {
    listarConversasDoAparelho: vi.fn(async () => {
      const lista = conversas[pagina] ?? [];
      pagina += 1;
      return lista.map((c) => ({ id: c.id, ultimaEm: null }));
    }),
    listarMensagensDoChat: vi.fn(async (_s: string, chat: string, o: { offset: number; limit: number }) =>
      (porChat[chat] ?? []).slice(o.offset, o.offset + o.limit)),
  } as unknown as WahaClient & {
    listarConversasDoAparelho: ReturnType<typeof vi.fn>;
    listarMensagensDoChat: ReturnType<typeof vi.fn>;
  };
}

function sessao(historico: Record<string, unknown> | null): SessaoParaImportar {
  return {
    id: SESSAO,
    organization_id: ORG,
    waha_session_name: "org_x",
    metadata: historico ? { ai_gate: "open", historico } : { ai_gate: "open" },
  };
}

const AGUARDANDO = { estado: "aguardando", pedido_em: PEDIDO_EM, janela_dias: 90 };

describe("a rodada de importação", () => {
  it("espera o aparelho terminar de sincronizar antes de puxar", async () => {
    const banco = bancoFalso({ historico: AGUARDANDO });
    const waha = wahaFalso([], {});
    const r = await executarRodadaDoHistorico(
      { admin: banco.admin, waha, agora: () => Date.parse(PEDIDO_EM) + 30_000 },
      sessao(AGUARDANDO),
    );
    expect(r.acao).toBe("esperar");
    expect(waha.listarConversasDoAparelho).not.toHaveBeenCalled();
  });

  it("importa só pessoas, mapeia o lote e termina", async () => {
    const banco = bancoFalso({ ai_gate: "open", historico: AGUARDANDO });
    const waha = wahaFalso(
      [[{ id: "5511999990000@c.us" }, { id: "120363000000000000@g.us" }, { id: "status@broadcast" }], []],
      {
        "5511999990000@c.us": [
          msg({ id: "a", body: "oi", timestamp: 1_790_000_100 }),
          msg({ id: "b", body: "olá!", fromMe: true, timestamp: 1_790_000_200 }),
          msg({ id: "c", type: "reaction", body: "👍" }),
        ],
      },
    );
    const r = await executarRodadaDoHistorico({ admin: banco.admin, waha, agora: () => DEPOIS_DA_ESPERA }, sessao(AGUARDANDO));

    expect(r.acao).toBe("fim");
    const importacoes = banco.rpcs.filter((x) => x.nome === "fn_importar_historico_whatsapp");
    expect(importacoes).toHaveLength(1);
    expect(importacoes[0]?.args).toMatchObject({ p_org: ORG, p_session: SESSAO, p_contact: "contato-5511999990000@c.us" });
    expect((importacoes[0]?.args.p_msgs as Array<{ external_id: string }>).map((m) => m.external_id)).toEqual(["a", "b"]);
    // Grupo e estado nunca chegam a perguntar mensagens.
    expect(waha.listarMensagensDoChat).toHaveBeenCalledTimes(1);
    const final = banco.meta()?.historico as Record<string, unknown>;
    expect(final).toMatchObject({ estado: "concluido", conversas_importadas: 1, mensagens_importadas: 2 });
    expect(banco.meta()?.ai_gate, "apagou outra chave do metadata da sessão").toBe("open");
  });

  it("conversa sem nada na janela não cria contato", async () => {
    const banco = bancoFalso({ historico: AGUARDANDO });
    const waha = wahaFalso([[{ id: "5511888880000@c.us" }], []], { "5511888880000@c.us": [] });
    await executarRodadaDoHistorico({ admin: banco.admin, waha, agora: () => DEPOIS_DA_ESPERA }, sessao(AGUARDANDO));
    expect(banco.rpcs.some((x) => x.nome === "fn_upsert_wa_contact")).toBe(false);
  });

  it("sessão sem o store (400) vira 'indisponível' — fato, não falha a repetir", async () => {
    const banco = bancoFalso({ historico: AGUARDANDO });
    const waha = wahaFalso([], {});
    waha.listarConversasDoAparelho.mockRejectedValueOnce(new WahaHistoricoError(400));
    const r = await executarRodadaDoHistorico({ admin: banco.admin, waha, agora: () => DEPOIS_DA_ESPERA }, sessao(AGUARDANDO));
    expect(r.acao).toBe("fim");
    expect(banco.meta()?.historico).toMatchObject({ estado: "indisponivel", motivo: "store_desligado" });
  });

  it("falha de verdade (WAHA 500) lança, para o drain contar e recuar", async () => {
    const banco = bancoFalso({ historico: AGUARDANDO });
    const waha = wahaFalso([], {});
    waha.listarConversasDoAparelho.mockRejectedValueOnce(new WahaHistoricoError(500));
    await expect(
      executarRodadaDoHistorico({ admin: banco.admin, waha, agora: () => DEPOIS_DA_ESPERA }, sessao(AGUARDANDO)),
    ).rejects.toThrow("waha_historico_500");
  });

  it("pagina as mensagens de uma conversa longa", async () => {
    const muitas = Array.from({ length: 130 }, (_, i) => msg({ id: `m${i}`, timestamp: 1_790_000_000 + i }));
    const banco = bancoFalso({ historico: AGUARDANDO });
    const waha = wahaFalso([[{ id: "5511777770000@c.us" }], []], { "5511777770000@c.us": muitas });
    await executarRodadaDoHistorico({ admin: banco.admin, waha, agora: () => DEPOIS_DA_ESPERA }, sessao(AGUARDANDO));
    expect(waha.listarMensagensDoChat).toHaveBeenCalledTimes(2);
    const total = banco.rpcs
      .filter((x) => x.nome === "fn_importar_historico_whatsapp")
      .reduce((n, x) => n + (x.args.p_msgs as unknown[]).length, 0);
    expect(total).toBe(130);
  });

  it("estoura o orçamento: grava onde parou e devolve 'continuar'", async () => {
    const banco = bancoFalso({ historico: AGUARDANDO });
    const mensagens = { "5511666660000@c.us": [msg({ id: "z" })] };
    const waha = wahaFalso([[{ id: "5511666660000@c.us" }], [{ id: "5511666660001@c.us" }]], mensagens);
    // O relógio salta o orçamento inteiro depois da primeira página: as duas
    // primeiras leituras (início e primeira checagem) ainda estão dentro dele.
    let leituras = 0;
    const agora = vi.fn(() => { leituras += 1; return DEPOIS_DA_ESPERA + (leituras > 2 ? ORCAMENTO_DA_RODADA_MS : 0); });
    const r = await executarRodadaDoHistorico({ admin: banco.admin, waha, agora }, sessao(AGUARDANDO));
    expect(r.acao).toBe("continuar");
    expect(banco.meta()?.historico).toMatchObject({ estado: "importando", proxima_conversa: 1 });
  });

  it("retoma de onde parou, sem recomeçar", async () => {
    const retomada = { estado: "importando", pedido_em: PEDIDO_EM, janela_dias: 90, desde_em: "2026-07-25T00:00:00.000Z", proxima_conversa: 40, conversas_importadas: 3, mensagens_importadas: 90 };
    const banco = bancoFalso({ historico: retomada });
    const waha = wahaFalso([], {});
    await executarRodadaDoHistorico({ admin: banco.admin, waha, agora: () => DEPOIS_DA_ESPERA }, sessao(retomada));
    expect(waha.listarConversasDoAparelho).toHaveBeenCalledWith("org_x", { limit: 20, offset: 40 });
    expect(banco.meta()?.historico).toMatchObject({ estado: "concluido", mensagens_importadas: 90 });
  });

  it("depois de concluída, não faz mais nada", async () => {
    const pronta = { ...AGUARDANDO, estado: "concluido" };
    const banco = bancoFalso({ historico: pronta });
    const waha = wahaFalso([], {});
    const r = await executarRodadaDoHistorico({ admin: banco.admin, waha, agora: () => DEPOIS_DA_ESPERA }, sessao(pronta));
    expect(r.acao).toBe("fim");
    expect(waha.listarConversasDoAparelho).not.toHaveBeenCalled();
  });
});

describe("o pedido da importação", () => {
  it("grava o estado e emite UM evento", async () => {
    const banco = bancoFalso({ ai_gate: "open" });
    expect(await pedirImportacaoDoHistorico(banco.admin, { id: SESSAO, organization_id: ORG })).toBe(true);
    expect(banco.meta()).toMatchObject({ ai_gate: "open", historico: { estado: "aguardando", janela_dias: 90 } });
    const eventos = banco.rpcs.filter((x) => x.nome === "emit_event");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.args).toMatchObject({ p_event_type: "whatsapp.history_import_requested", p_entity_id: SESSAO });
  });

  it("reconexão não pede de novo: o aparelho só entrega o histórico no pareamento", async () => {
    const banco = bancoFalso({ historico: AGUARDANDO });
    expect(await pedirImportacaoDoHistorico(banco.admin, { id: SESSAO, organization_id: ORG })).toBe(false);
    expect(banco.rpcs.filter((x) => x.nome === "emit_event")).toHaveLength(0);
  });

  it("dois WORKING quase juntos: quem perde a corrida não emite", async () => {
    const banco = bancoFalso({}, { corrida: true });
    expect(await pedirImportacaoDoHistorico(banco.admin, { id: SESSAO, organization_id: ORG })).toBe(false);
    expect(banco.rpcs.filter((x) => x.nome === "emit_event")).toHaveLength(0);
  });
});
