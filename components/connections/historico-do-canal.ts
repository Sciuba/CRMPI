import type { HistoricoDaSessao } from "@/lib/channels/historico";

/**
 * O que dizer, no card do número, sobre o histórico do WhatsApp.
 *
 * `null` = nada a dizer (sessão anterior ao recurso, ou histórico ainda não pedido).
 * `tom: "aviso"` é o único que merece destaque: o histórico NÃO virá, e o remédio
 * (reconectar o número) só serve a quem lê.
 */
export function textoDoHistorico(
  h: HistoricoDaSessao | null | undefined,
  t: (chave: string) => string,
): { texto: string; tom: "neutro" | "aviso" } | null {
  if (!h) return null;
  const n = h.mensagens_importadas ?? 0;
  switch (h.estado) {
    case "aguardando":
      return { texto: t("Aguardando o WhatsApp entregar o histórico das conversas…"), tom: "neutro" };
    case "importando":
      return {
        texto: n > 0 ? `${t("Importando o histórico das conversas…")} ${n} ${t("mensagens")}` : t("Importando o histórico das conversas…"),
        tom: "neutro",
      };
    case "concluido":
      return {
        texto: n > 0 ? `${t("Histórico importado:")} ${n} ${t("mensagens")}` : t("Nenhuma conversa antiga para importar."),
        tom: "neutro",
      };
    case "indisponivel":
      return {
        texto:
          h.motivo === "store_desligado"
            ? t("Histórico indisponível: este número foi conectado antes do recurso. Desconecte e conecte de novo para trazer as conversas antigas.")
            : t("Não foi possível importar o histórico das conversas."),
        tom: "aviso",
      };
    default:
      return null;
  }
}

/**
 * A importação ainda está rodando? Quem acabou de ler o QR olha para o card
 * esperando saber se está travado — por isso o andamento ganha destaque (giro +
 * leitura por voz) e o resto continua discreto.
 */
export function historicoEmAndamento(h: HistoricoDaSessao | null | undefined): boolean {
  return h?.estado === "aguardando" || h?.estado === "importando";
}
