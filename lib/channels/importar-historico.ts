/**
 * Consome `whatsapp.history_import_requested`: traz para o CRM o histórico que o
 * aparelho entregou ao ser pareado (ver `lib/waha/historico.ts`).
 *
 * O trabalho é fatiado em rodadas de ~40s. Enquanto houver o que importar, o
 * handler devolve `retry`, que o drain reagenda SEM gastar tentativa; o estado
 * (onde parou, quanto entrou) vive em `channel_sessions.metadata.historico` e é o
 * que o painel lê. Falha de verdade — rede, WAHA fora — devolve `error` e o drain
 * conta e recua; na última tentativa o estado vira `falhou`, para a tela poder
 * dizer isso em vez de ficar "importando" para sempre.
 */
import type { EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWahaClient } from "@/lib/waha/client";
import {
  INTERVALO_ENTRE_RODADAS_MS,
  executarRodadaDoHistorico,
  lerHistorico,
} from "@/lib/waha/historico";

export const IMPORTAR_HISTORICO_CONSUMER_KEY = "importar_historico_v1";
// Espelha MAX_ATTEMPTS de lib/event-log/drain.ts (não exportado de lá); ver a
// mesma nota em media-persist-worker.ts.
const DRAIN_MAX_ATTEMPTS = 5;

export async function importarHistoricoDaSessao(row: EventRow): Promise<HandlerResult> {
  const consumer_key = IMPORTAR_HISTORICO_CONSUMER_KEY;
  const sessionId = (row.payload.channel_session_id as string | undefined) ?? row.entity_id;
  if (!sessionId) return { consumer_key, status: "skipped", detail: "no channel_session_id" };

  const waha = getWahaClient();
  if (!waha) return { consumer_key, status: "skipped", detail: "waha_nao_configurado" };

  const admin = createAdminClient();
  const { data: sessao, error } = await admin
    .from("channel_sessions")
    .select("id, organization_id, waha_session_name, metadata")
    .eq("id", sessionId)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  if (error) return { consumer_key, status: "error", detail: error.message };
  if (!sessao) return { consumer_key, status: "skipped", detail: "sessao_inexistente" };

  const ultimaTentativa = row.attempts >= DRAIN_MAX_ATTEMPTS - 1;
  try {
    const resultado = await executarRodadaDoHistorico(
      { admin, waha },
      {
        id: sessao.id,
        organization_id: sessao.organization_id,
        waha_session_name: sessao.waha_session_name,
        metadata: (sessao.metadata as Record<string, unknown> | null) ?? null,
      },
    );
    if (resultado.acao === "esperar") {
      return { consumer_key, status: "retry", retry_at: resultado.ateIso, detail: "aguardando_sincronizacao" };
    }
    if (resultado.acao === "continuar") {
      return {
        consumer_key,
        status: "retry",
        retry_at: new Date(Date.now() + INTERVALO_ENTRE_RODADAS_MS).toISOString(),
        detail: `importando:${resultado.historico.mensagens_importadas ?? 0}`,
      };
    }
    return { consumer_key, status: "ok", detail: resultado.historico.estado };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.warn("importar_historico: rodada falhou", {
      organization_id: sessao.organization_id,
      channel_session_id: sessao.id,
      tentativa: row.attempts + 1,
      detail,
    });
    if (ultimaTentativa) {
      const atual = lerHistorico((sessao.metadata as Record<string, unknown> | null) ?? null);
      await admin
        .from("channel_sessions")
        .update({
          metadata: {
            ...((sessao.metadata as Record<string, unknown> | null) ?? {}),
            historico: { ...(atual ?? {}), estado: "indisponivel", motivo: "falhou_apos_tentativas" },
          } as never,
        })
        .eq("id", sessao.id)
        .eq("organization_id", sessao.organization_id);
    }
    return { consumer_key, status: "error", detail };
  }
}
