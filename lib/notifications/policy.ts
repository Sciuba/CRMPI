export function shouldNotifyInbound(input: {
  direction?: string | null;
  conversationId?: string | null;
  openConversationId?: string | null;
  tabFocused: boolean;
  tipo?: unknown;
  /** Mensagem trazida do histórico do aparelho no pareamento: ninguém acabou de escrever. */
  historica?: boolean;
}): boolean {
  if (input.tipo === "reassinado") return false;
  if (input.historica === true) return false;
  if (input.direction !== "inbound") return false;
  if (!input.conversationId) return false;
  if (input.tabFocused && input.openConversationId === input.conversationId) return false;
  return true;
}
