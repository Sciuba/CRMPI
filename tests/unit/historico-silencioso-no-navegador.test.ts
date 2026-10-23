import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shouldNotifyInbound } from "@/lib/notifications/policy";
import { agruparRecargas } from "@/lib/realtime/agrupar-recargas";

const base = { direction: "inbound" as const, conversationId: "c1", openConversationId: "c2", tabFocused: true };

describe("mensagem do histórico não vira alerta", () => {
  it("mensagem histórica não notifica, ainda que seja de entrada e de outra conversa", () => {
    expect(shouldNotifyInbound({ ...base, historica: true })).toBe(false);
  });

  it("controle: a mesma mensagem, sem ser histórica, notifica", () => {
    expect(shouldNotifyInbound({ ...base, historica: false })).toBe(true);
    expect(shouldNotifyInbound(base)).toBe(true);
  });
});

describe("agruparRecargas: rajada vira poucas recargas, o primeiro aviso é imediato", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("o primeiro aviso recarrega na hora (uso normal não fica mais lento)", () => {
    const recarregar = vi.fn();
    agruparRecargas(recarregar, 2_000).avisar();
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("200 avisos na janela viram 2 recargas: a imediata e uma ao fim", () => {
    const recarregar = vi.fn();
    const a = agruparRecargas(recarregar, 2_000);
    for (let i = 0; i < 200; i += 1) a.avisar();
    expect(recarregar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2_000);
    expect(recarregar).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10_000);
    expect(recarregar, "recarregou sem ter aviso pendente").toHaveBeenCalledTimes(2);
  });

  it("aviso isolado depois da janela volta a ser imediato", () => {
    const recarregar = vi.fn();
    const a = agruparRecargas(recarregar, 2_000);
    a.avisar();
    vi.advanceTimersByTime(5_000);
    a.avisar();
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it("cancelar descarta a recarga pendente", () => {
    const recarregar = vi.fn();
    const a = agruparRecargas(recarregar, 2_000);
    a.avisar(); a.avisar();
    a.cancelar();
    vi.advanceTimersByTime(5_000);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("rajada longa respeita o teto de uma recarga por janela", () => {
    const recarregar = vi.fn();
    const a = agruparRecargas(recarregar, 1_000);
    for (let s = 0; s < 10; s += 1) { a.avisar(); vi.advanceTimersByTime(500); a.avisar(); vi.advanceTimersByTime(500); }
    expect(recarregar.mock.calls.length).toBeLessThanOrEqual(11);
  });
});

describe("quem escuta o realtime de messages/conversations conhece o histórico", () => {
  const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("o alerta de mensagem nova passa a marca de histórico à política", () => {
    expect(ler("hooks/notifications/useInboundMessageAlerts.ts")).toMatch(/historica:\s*row\.is_historical === true/);
  });

  it("a lista do Inbox agrupa as recargas em vez de recarregar a cada aviso", () => {
    const fonte = ler("hooks/inbox/useConversationsRealtime.ts");
    expect(fonte).toContain("agruparRecargas");
    expect(fonte, "voltou a invalidar direto a cada aviso").not.toMatch(/const onChange = useCallback\(\(\) => \{\s*qc\.invalidateQueries/);
  });

  it("o inbox de admin ignora mensagem histórica", () => {
    expect(ler("hooks/useAdminInboxRealtime.ts")).toContain("is_historical");
  });
});
