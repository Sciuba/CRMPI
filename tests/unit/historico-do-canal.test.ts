import { describe, expect, it } from "vitest";

import { textoDoHistorico } from "@/components/connections/historico-do-canal";
import type { HistoricoDaSessao } from "@/lib/channels/historico";

const t = (s: string) => s;
const base = { pedido_em: "2026-10-23T12:00:00.000Z", janela_dias: 90 };

describe("o que o card do número diz sobre o histórico", () => {
  it("sem estado, não diz nada", () => {
    expect(textoDoHistorico(null, t)).toBeNull();
    expect(textoDoHistorico(undefined, t)).toBeNull();
  });

  it("acompanha o andamento com a contagem", () => {
    const h: HistoricoDaSessao = { ...base, estado: "importando", mensagens_importadas: 420 };
    expect(textoDoHistorico(h, t)).toEqual({ texto: "Importando o histórico das conversas… 420", tom: "neutro" });
  });

  it("concluído diz quanto entrou; sem nada, diz que não havia", () => {
    expect(textoDoHistorico({ ...base, estado: "concluido", mensagens_importadas: 1234 }, t)?.texto).toBe("Histórico importado: 1234 mensagens");
    expect(textoDoHistorico({ ...base, estado: "concluido", mensagens_importadas: 0 }, t)?.texto).toBe("Nenhuma conversa antiga para importar.");
  });

  it("número conectado antes do recurso: avisa e ensina o remédio", () => {
    const r = textoDoHistorico({ ...base, estado: "indisponivel", motivo: "store_desligado" }, t);
    expect(r?.tom).toBe("aviso");
    expect(r?.texto).toMatch(/Desconecte e conecte de novo/);
  });

  it("outra falha avisa sem prometer remédio", () => {
    const r = textoDoHistorico({ ...base, estado: "indisponivel", motivo: "falhou_apos_tentativas" }, t);
    expect(r).toEqual({ texto: "Não foi possível importar o histórico das conversas.", tom: "aviso" });
  });
});
