/**
 * Avisos da Central (`agent_inbox_items`) como notificação do sistema.
 *
 * A Central é onde o CRM pede atenção do operador (número novo aguardando
 * liberação, QR a reescanear, mensagem presa). Sem isto o aviso só existia
 * dentro da tela: quem estava em outra aba ou outro programa não via nada.
 */
export interface AvisoDaCentral {
  id: string;
  title: string;
  body: string;
}

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Lê a linha que o realtime entrega; devolve null para o que não deve avisar. */
export function avisoDaCentral(row: Record<string, unknown> | null): AvisoDaCentral | null {
  if (!row) return null;
  if (row.status !== undefined && row.status !== "open") return null;
  const id = texto(row.id);
  const title = texto(row.title);
  if (!id || !title) return null;
  return { id, title, body: texto(row.body) };
}

/**
 * Uma rajada (uma migration que abre dezenas de avisos de uma vez) vira UM
 * aviso resumido, em vez de dezenas de notificações empilhadas no sistema.
 */
export function resumirAvisos(avisos: AvisoDaCentral[]): { title: string; body: string; tag: string } | null {
  const [primeiro] = avisos;
  if (!primeiro) return null;
  if (avisos.length === 1) return { title: primeiro.title, body: primeiro.body, tag: primeiro.id };
  return {
    title: `${avisos.length} novos avisos na Central`,
    body: avisos
      .slice(0, 3)
      .map((a) => a.title)
      .join(" · "),
    tag: "central-lote",
  };
}
