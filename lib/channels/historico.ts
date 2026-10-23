/**
 * O estado da importação do histórico de um número, como a tela o lê.
 *
 * Mora aqui, e não junto do transporte, porque a tela e o consumidor do evento
 * perguntam "em que pé está o histórico" sem precisar saber quem entrega a mensagem.
 */
/** Quanto do passado o CRM aceita. É teto do CRM, não do que o celular mandou. */
export const JANELA_DO_HISTORICO_DIAS = 90;

export type EstadoDaImportacao = "aguardando" | "importando" | "concluido" | "indisponivel";

export interface HistoricoDaSessao {
  estado: EstadoDaImportacao;
  pedido_em: string;
  janela_dias: number;
  /** Início da janela, fixado na primeira rodada para as seguintes concordarem. */
  desde_em?: string;
  /** Posição na lista de conversas do aparelho. */
  proxima_conversa?: number;
  conversas_importadas?: number;
  mensagens_importadas?: number;
  concluido_em?: string;
  motivo?: string;
}
