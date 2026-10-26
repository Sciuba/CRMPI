/**
 * Agrupa uma rajada de avisos de realtime numa recarga só.
 *
 * ─── O defeito que isto previne ─────────────────────────────────────────────
 *
 * O Inbox recarrega a lista INTEIRA a cada mudança em `conversations`. Com uma
 * mensagem por vez isso é barato e imediato. Com uma rajada — a importação do
 * histórico cria dezenas de conversas em minutos; uma campanha, um merge de
 * contatos — cada aviso dispara outra recarga, e elas se empilham: a lista passa
 * dos 10 s do cliente HTTP e a tela responde com uma chuva de "Erro inesperado".
 *
 * ─── Por que "primeiro na hora, o resto junto" ──────────────────────────────
 *
 * Um debounce comum atrasaria TODO aviso, inclusive o de uma única mensagem
 * chegando, e o Inbox pareceria mais lento no uso normal. Aqui o primeiro aviso
 * dispara de imediato; os que chegam dentro da janela viram UMA chamada ao
 * fim dela. Uma rajada de 200 avisos vira 2 recargas.
 */
export function agruparRecargas(recarregar: () => void, janelaMs: number): {
  avisar: () => void;
  cancelar: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendente = false;

  const fimDaJanela = () => {
    timer = null;
    if (!pendente) return;
    pendente = false;
    recarregar();
    // Recarregou ao fim da janela: abre outra, para a rajada que continua não
    // furar o teto de uma recarga por janela.
    timer = setTimeout(fimDaJanela, janelaMs);
  };

  return {
    avisar() {
      if (timer === null) {
        recarregar();
        timer = setTimeout(fimDaJanela, janelaMs);
        return;
      }
      pendente = true;
    },
    cancelar() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pendente = false;
    },
  };
}
