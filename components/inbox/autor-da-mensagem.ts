import type { Message } from "@/lib/types/messaging";

/**
 * Quem escreveu esta mensagem, quando vale dizê-lo na bolha.
 *
 * Com supervisor e admin podendo assumir ou transferir a conversa, o histórico
 * precisa responder "quem escreveu isto?". O nome só é desenhado quando o autor
 * MUDA em relação à mensagem anterior, como num chat de grupo: repetir o nome em
 * toda bolha de uma rajada de cinco mensagens seria ruído.
 *
 * Só conta mensagem de pessoa. A da IA já tem o próprio rótulo, e a do cliente
 * não tem autor interno. `null` também quando não há nome para mostrar — o
 * lugar do rótulo fica vazio em vez de inventar "Atendente".
 *
 * A mensagem otimista (a que aparece antes da resposta do servidor) ainda não
 * tem `sent_by_user_id` nem nome; vale o usuário logado, que é quem a enviou.
 */
export interface UsuarioAtual {
  id: string;
  full_name: string | null;
}

function ehDePessoa(m: Message): boolean {
  return m.direction === "outbound" && m.sent_via === "user";
}

function ehOtimista(m: Message): boolean {
  return m.metadata?._optimistic === true;
}

function identidade(m: Message, usuario: UsuarioAtual): { id: string | null; nome: string | null } {
  const otimista = ehOtimista(m);
  return {
    id: m.sent_by_user_id ?? (otimista ? usuario.id : null),
    nome: m.sent_by_user_name ?? (otimista ? usuario.full_name : null),
  };
}

export function autorDaMensagem(
  mensagem: Message,
  anterior: Message | null,
  usuario: UsuarioAtual,
): string | null {
  if (!ehDePessoa(mensagem)) return null;
  const atual = identidade(mensagem, usuario);
  if (!atual.nome) return null;

  if (anterior && ehDePessoa(anterior)) {
    const antes = identidade(anterior, usuario);
    const mesmoAutor = atual.id && antes.id ? atual.id === antes.id : antes.nome === atual.nome;
    if (mesmoAutor) return null;
  }
  return atual.nome;
}
