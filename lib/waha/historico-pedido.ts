/**
 * O PEDIDO de importar o histórico — separado do importador porque quem pede é a
 * ingestão (`ingest.ts`), e o importador importa a ingestão: juntos, seriam um
 * ciclo de módulos.
 */
import type { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  JANELA_DO_HISTORICO_DIAS,
  type HistoricoDaSessao,
} from "@/lib/channels/historico";

export { JANELA_DO_HISTORICO_DIAS };
export type { EstadoDaImportacao, HistoricoDaSessao } from "@/lib/channels/historico";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Pede a importação — UMA vez por sessão. Chamado quando a sessão chega a WORKING.
 *
 * "Uma vez" é o ponto: o aparelho só entrega o histórico no pareamento, e toda
 * reconexão volta a WORKING. Sem a guarda, cada queda de rede reimportaria 90 dias
 * (inofensivo pela deduplicação, mas trabalho e leitura à toa).
 */
export async function pedirImportacaoDoHistorico(
  admin: Admin,
  sessao: { id: string; organization_id: string },
): Promise<boolean> {
  const { data } = await admin
    .from("channel_sessions")
    .select("metadata")
    .eq("id", sessao.id)
    .eq("organization_id", sessao.organization_id)
    .maybeSingle();
  if (!data) return false;
  const metadata = (data.metadata as Record<string, unknown> | null) ?? {};
  if (metadata.historico) return false;

  const historico: HistoricoDaSessao = {
    estado: "aguardando",
    pedido_em: new Date().toISOString(),
    janela_dias: JANELA_DO_HISTORICO_DIAS,
  };
  // A guarda de concorrência: só grava se continua sem `historico`. Dois WORKING
  // quase juntos (o WAHA repete o evento ao reiniciar) pedem uma importação só.
  const { data: gravou, error } = await admin
    .from("channel_sessions")
    .update({ metadata: { ...metadata, historico } as never })
    .eq("id", sessao.id)
    .eq("organization_id", sessao.organization_id)
    .is("metadata->historico", null)
    .select("id");
  if (error || !gravou || gravou.length === 0) return false;

  const { error: erroEvento } = await admin.rpc("emit_event" as never, {
    p_event_type: "whatsapp.history_import_requested",
    p_entity_kind: "channel_session",
    p_entity_id: sessao.id,
    p_payload: { channel_session_id: sessao.id },
    p_metadata: { source: "waha_session_working" },
    p_organization_id: sessao.organization_id,
  } as never);
  if (erroEvento) {
    logger.warn("waha.historico: pedido gravado mas o evento não saiu", {
      organization_id: sessao.organization_id,
      channel_session_id: sessao.id,
      detail: erroEvento.message,
    });
    return false;
  }
  return true;
}
