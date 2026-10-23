/**
 * Importa para o CRM o histórico que o aparelho entregou ao ser pareado.
 *
 * ─── O contrato com quem opera ──────────────────────────────────────────────
 *
 * O passado da conversa entra como CONTEXTO: quem atende o lê e a IA o enxerga.
 * Não entra como evento — nada de IA respondendo mensagem de agosto, sentimento
 * sendo cobrado por conversa antiga, follow-up disparando, nem as conversas
 * velhas sendo distribuídas entre os atendentes. Isso mora no banco
 * (`fn_importar_historico_whatsapp`, migration 0235); este arquivo decide O QUE
 * entra e conduz a importação em rodadas.
 *
 * ─── Por que em rodadas ─────────────────────────────────────────────────────
 *
 * Um número de escritório tem centenas de conversas. Importar tudo numa chamada
 * estoura o teto do consumidor de eventos, e uma falha no meio perderia o que já
 * foi feito. Cada rodada trabalha por um ORÇAMENTO de relógio, grava onde parou
 * (`channel_sessions.metadata.historico`) e devolve "continua"; o consumidor
 * reagenda sem gastar tentativa. A importação é reexecutável de ponta a ponta —
 * a deduplicação por `external_id` mora no banco —, então retomar nunca duplica.
 *
 * ─── O que NÃO entra ────────────────────────────────────────────────────────
 *
 * Grupos, estados, listas de difusão e canais (a sessão já os ignora, e o CRM
 * não faz vínculo com eles). Reações e eventos de sistema. Mídia: a linha entra
 * marcada `midia_nao_importada`, sem baixar o binário — o Storage do cliente é a
 * mesma cota de 1 GB da mídia ao vivo.
 */
import type { WahaClient } from "@/lib/waha/client";
import { WahaHistoricoError } from "@/lib/waha/client";
import type { WahaPayload } from "@/lib/waha/envelope";
import {
  bodyOf,
  ehEnderecavel,
  mediaMimeOf,
  mediaUrlOf,
  notifyNameOf,
  parseChatId,
  resolveMessageType,
  telefoneAlternativoDe,
  upsertContact,
  type Admin,
} from "@/lib/waha/ingest";
import { logger } from "@/lib/logger";
import {
  JANELA_DO_HISTORICO_DIAS,
  type EstadoDaImportacao,
  type HistoricoDaSessao,
} from "@/lib/waha/historico-pedido";

export { JANELA_DO_HISTORICO_DIAS };
export type { EstadoDaImportacao, HistoricoDaSessao };

/**
 * O aparelho continua entregando o histórico por alguns minutos depois do QR.
 * Puxar cedo demais lê uma fatia. Esperar mais que isso só adia o primeiro
 * resultado; o que chegar depois entra na rodada que o dono pedir de novo.
 */
export const ESPERA_APOS_PAREAR_MS = 3 * 60_000;

/** Quanto de relógio uma rodada gasta antes de gravar o ponto e devolver. */
export const ORCAMENTO_DA_RODADA_MS = 40_000;

/** Intervalo entre rodadas quando ainda há o que importar. */
export const INTERVALO_ENTRE_RODADAS_MS = 20_000;

const CONVERSAS_POR_PAGINA = 20;
const MENSAGENS_POR_PAGINA = 100;
/** Teto por conversa: um grupo de trabalho de 5 anos não pode monopolizar a rodada. */
const MENSAGENS_MAXIMAS_POR_CONVERSA = 2_000;
const MENSAGENS_POR_CHAMADA_AO_BANCO = 200;

export interface MensagemParaImportar {
  external_id: string;
  direction: "inbound" | "outbound";
  type: string;
  body: string | null;
  sent_at: string;
  midia: boolean;
}

/** Tipos que carregam um binário que NÃO baixamos. */
const TIPOS_DE_MIDIA = new Set(["image", "video", "audio", "document", "sticker"]);
/** Tipos que não são fala de ninguém. */
const TIPOS_IGNORADOS = new Set(["reaction", "system"]);

/** A conversa é uma pessoa que o CRM sabe atender? */
export function conversaImportavel(chatId: string): boolean {
  return ehEnderecavel(parseChatId(chatId));
}

/**
 * Uma mensagem do aparelho no formato que o banco importa — ou `null` se não é
 * conversa (sem id, sem data, reação, evento de sistema, ou vazia sem mídia).
 */
export function mensagemParaImportar(p: WahaPayload): MensagemParaImportar | null {
  if (!p.id || typeof p.timestamp !== "number" || !Number.isFinite(p.timestamp)) return null;
  const type = resolveMessageType(p);
  if (TIPOS_IGNORADOS.has(type)) return null;
  const body = bodyOf(p);
  const midia = TIPOS_DE_MIDIA.has(type) || Boolean(p.hasMedia) || Boolean(mediaUrlOf(p)) || Boolean(mediaMimeOf(p));
  if (!body && !midia) return null;
  return {
    external_id: p.id,
    direction: p.fromMe ? "outbound" : "inbound",
    type,
    body: body ? body : null,
    sent_at: new Date(p.timestamp * 1000).toISOString(),
    midia,
  };
}

export interface SessaoParaImportar {
  id: string;
  organization_id: string;
  waha_session_name: string;
  metadata: Record<string, unknown> | null;
}

export type ResultadoDaRodada =
  | { acao: "esperar"; ateIso: string }
  | { acao: "continuar"; historico: HistoricoDaSessao }
  | { acao: "fim"; historico: HistoricoDaSessao };

export function lerHistorico(metadata: Record<string, unknown> | null): HistoricoDaSessao | null {
  const h = metadata?.historico;
  if (!h || typeof h !== "object") return null;
  const estado = (h as { estado?: unknown }).estado;
  if (estado !== "aguardando" && estado !== "importando" && estado !== "concluido" && estado !== "indisponivel") {
    return null;
  }
  return h as HistoricoDaSessao;
}

async function gravarHistorico(admin: Admin, sessao: SessaoParaImportar, historico: HistoricoDaSessao): Promise<void> {
  // Lê de novo antes de gravar: outros escritores (gate da IA, apelido) vivem no
  // mesmo `metadata`, e gravar o que lemos há 40s os desfaria.
  const { data } = await admin
    .from("channel_sessions")
    .select("metadata")
    .eq("id", sessao.id)
    .eq("organization_id", sessao.organization_id)
    .maybeSingle();
  const atual = (data?.metadata as Record<string, unknown> | null) ?? {};
  const { error } = await admin
    .from("channel_sessions")
    .update({ metadata: { ...atual, historico } as never })
    .eq("id", sessao.id)
    .eq("organization_id", sessao.organization_id);
  if (error) throw new Error(`historico_estado_nao_gravado: ${error.message}`);
}

interface Dependencias {
  admin: Admin;
  waha: WahaClient;
  agora?: () => number;
}

/**
 * Uma rodada. Idempotente e retomável: lê o ponto onde parou, trabalha até o
 * orçamento acabar, grava e diz o que fazer a seguir.
 */
export async function executarRodadaDoHistorico(
  { admin, waha, agora = Date.now }: Dependencias,
  sessao: SessaoParaImportar,
): Promise<ResultadoDaRodada> {
  const atual = lerHistorico(sessao.metadata);
  if (!atual) {
    // Pedido sem estado: nada a importar. Quem pede é `pedirImportacaoDoHistorico`.
    const vazio: HistoricoDaSessao = {
      estado: "indisponivel",
      pedido_em: new Date(agora()).toISOString(),
      janela_dias: JANELA_DO_HISTORICO_DIAS,
      motivo: "sem_pedido",
    };
    return { acao: "fim", historico: vazio };
  }
  if (atual.estado === "concluido" || atual.estado === "indisponivel") {
    return { acao: "fim", historico: atual };
  }

  const inicio = agora();
  const liberaEm = Date.parse(atual.pedido_em) + ESPERA_APOS_PAREAR_MS;
  if (atual.estado === "aguardando" && inicio < liberaEm) {
    return { acao: "esperar", ateIso: new Date(liberaEm).toISOString() };
  }

  const estado: HistoricoDaSessao = {
    ...atual,
    estado: "importando",
    desde_em: atual.desde_em ?? new Date(inicio - atual.janela_dias * 86_400_000).toISOString(),
    proxima_conversa: atual.proxima_conversa ?? 0,
    conversas_importadas: atual.conversas_importadas ?? 0,
    mensagens_importadas: atual.mensagens_importadas ?? 0,
  };
  const desdeEm = Date.parse(estado.desde_em as string) / 1000;

  while (agora() - inicio < ORCAMENTO_DA_RODADA_MS) {
    let conversas;
    try {
      conversas = await waha.listarConversasDoAparelho(sessao.waha_session_name, {
        limit: CONVERSAS_POR_PAGINA,
        offset: estado.proxima_conversa as number,
      });
    } catch (err) {
      // 4xx na leitura = a sessão não guarda histórico (nasceu sem o store). Não é
      // falha a repetir: é um fato sobre a sessão, e repetir só gasta tentativas.
      if (err instanceof WahaHistoricoError && err.httpStatus >= 400 && err.httpStatus < 500) {
        const fim: HistoricoDaSessao = {
          ...estado,
          estado: "indisponivel",
          motivo: err.httpStatus === 400 ? "store_desligado" : `waha_${err.httpStatus}`,
          concluido_em: new Date(agora()).toISOString(),
        };
        await gravarHistorico(admin, sessao, fim);
        return { acao: "fim", historico: fim };
      }
      throw err;
    }

    if (conversas.length === 0) {
      const fim: HistoricoDaSessao = { ...estado, estado: "concluido", concluido_em: new Date(agora()).toISOString() };
      await gravarHistorico(admin, sessao, fim);
      return { acao: "fim", historico: fim };
    }

    for (const conversa of conversas) {
      if (!conversaImportavel(conversa.id)) continue;
      // O aparelho lista da mais recente para a mais antiga: se a última mensagem
      // já está fora da janela, as seguintes também estão.
      const importadas = await importarConversa(admin, waha, sessao, conversa.id, desdeEm);
      if (importadas > 0) {
        estado.conversas_importadas = (estado.conversas_importadas as number) + 1;
        estado.mensagens_importadas = (estado.mensagens_importadas as number) + importadas;
      }
    }
    estado.proxima_conversa = (estado.proxima_conversa as number) + conversas.length;
    await gravarHistorico(admin, sessao, estado);
  }

  logger.info("waha.historico: rodada parou no orçamento, continua", {
    organization_id: sessao.organization_id,
    channel_session_id: sessao.id,
    proxima_conversa: estado.proxima_conversa,
    mensagens_importadas: estado.mensagens_importadas,
  });
  return { acao: "continuar", historico: estado };
}

/** Importa UMA conversa. Devolve quantas mensagens novas entraram. */
async function importarConversa(
  admin: Admin,
  waha: WahaClient,
  sessao: SessaoParaImportar,
  chatId: string,
  desdeEm: number,
): Promise<number> {
  const lote: MensagemParaImportar[] = [];
  let nome: string | null = null;
  let telefoneAlternativo: string | null = null;

  for (let offset = 0; offset < MENSAGENS_MAXIMAS_POR_CONVERSA; offset += MENSAGENS_POR_PAGINA) {
    const pagina = await waha.listarMensagensDoChat(sessao.waha_session_name, chatId, {
      limit: MENSAGENS_POR_PAGINA,
      offset,
      desdeEm,
    });
    for (const p of pagina) {
      const m = mensagemParaImportar(p);
      if (m) lote.push(m);
      // O nome e o telefone vêm de qualquer mensagem que os traga; o contato é um só.
      if (!p.fromMe) nome = nome ?? notifyNameOf(p);
      telefoneAlternativo = telefoneAlternativo ?? telefoneAlternativoDe(p);
    }
    if (pagina.length < MENSAGENS_POR_PAGINA) break;
  }
  if (lote.length === 0) return 0; // nada na janela: não cria contato à toa

  const contactId = await upsertContact(
    admin,
    sessao.organization_id,
    parseChatId(chatId),
    chatId,
    nome,
    telefoneAlternativo,
  );
  if (!contactId) return 0;

  let entraram = 0;
  for (let i = 0; i < lote.length; i += MENSAGENS_POR_CHAMADA_AO_BANCO) {
    const { data, error } = await admin.rpc("fn_importar_historico_whatsapp" as never, {
      p_org: sessao.organization_id,
      p_session: sessao.id,
      p_contact: contactId,
      p_msgs: lote.slice(i, i + MENSAGENS_POR_CHAMADA_AO_BANCO),
    } as never);
    if (error) throw new Error(`historico_lote_recusado: ${error.message}`);
    entraram += Number(data ?? 0);
  }
  return entraram;
}
