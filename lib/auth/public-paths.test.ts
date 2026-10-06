/**
 * PUBLIC_PATHS decide quem atravessa o proxy sem sessão em toda a aplicação
 * (`proxy.ts`). Sem teste, uma âncora `$` trocada por prefixo, ou uma entrada
 * larga demais, some em silêncio do CI — foi exatamente o bug achado provando
 * a Task 6 (heartbeat do agente bloqueado por faltar aqui).
 */
import { describe, it, expect } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

describe("isPublicPath", () => {
  it("libera o heartbeat do agente do host (bearer, sem cookie)", () => {
    expect(isPublicPath("/api/v1/system/agent")).toBe(true);
  });

  it("libera o tick do relógio Hobby (bearer, sem cookie)", () => {
    expect(isPublicPath("/api/v1/system/relogio/tick")).toBe(true);
    expect(isPublicPath("/api/v1/system/relogio")).toBe(false);
    expect(isPublicPath("/api/v1/system/relogio/tick/extra")).toBe(false);
  });

  it("a âncora `$` impede que um sub-path passe de carona", () => {
    expect(isPublicPath("/api/v1/system/agent/qualquer")).toBe(false);
  });

  it("não libera a rota de pedido de atualização (exige sessão do dono)", () => {
    expect(isPublicPath("/api/v1/system/update")).toBe(false);
  });

  it("não libera a rota de estado da versão (exige sessão)", () => {
    expect(isPublicPath("/api/v1/system/version")).toBe(false);
  });

  /**
   * Os documentos legais são linkados do checkbox OBRIGATÓRIO da primeira tela
   * do produto (`/onboarding/welcome`). Fora daqui, `proxy.ts` manda o visitante
   * para `/login?next=/legal/terms` — e um aceite de termos que só se lê depois
   * de ter conta é um aceite que ninguém pode conferir antes de aceitar.
   */
  it("libera os documentos legais — o aceite acontece antes de existir conta", () => {
    expect(isPublicPath("/legal/terms")).toBe(true);
    expect(isPublicPath("/legal/privacy")).toBe(true);
  });

  /**
   * O túnel do Sentry (`tunnelRoute` em next.config.ts) é por onde o NAVEGADOR
   * manda os erros. Fora daqui, quem ainda não tem sessão recebe 307 para
   * `/login` e o erro morre no caminho — justamente nas telas de primeira
   * impressão (login, cadastro, aceitar convite), que são as que rodam sem
   * sessão. A rota só repassa o envelope ao ingest do Sentry; não lê nem grava
   * nada do CRM.
   */
  it("libera o túnel do Sentry — erro de tela sem sessão também precisa chegar", () => {
    expect(isPublicPath("/monitoring")).toBe(true);
  });

  it("e só o túnel: /monitoring não vira prefixo aberto", () => {
    expect(isPublicPath("/monitoring/qualquer")).toBe(false);
    expect(isPublicPath("/monitoringx")).toBe(false);
  });

  it("e só esses dois: /legal não é um portão aberto", () => {
    // Entrada larga aqui é furo de auth em toda a aplicação, não só nesta tela.
    expect(isPublicPath("/legal")).toBe(false);
    expect(isPublicPath("/legal/terms/interno")).toBe(false);
    expect(isPublicPath("/legal/qualquer-outra")).toBe(false);
  });
});
