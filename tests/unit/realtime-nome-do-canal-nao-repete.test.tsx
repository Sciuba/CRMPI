import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

/**
 * O CANAL QUE CAI DUAS VEZES NÃO PODE REUSAR O NOME DO ANTERIOR.
 *
 * ─── O defeito, visto no Sentry ─────────────────────────────────────────────
 *
 *   Error: cannot add `postgres_changes` callbacks for
 *   realtime:interface:<user>:<org>::<id>#1 after `subscribe()`.
 *
 * Aconteceu em dois canais ao mesmo tempo (`interface:` e `alerts-messages-`),
 * com o sufixo `#1` — ou seja, numa RETOMADA depois de uma queda.
 *
 * ─── A causa ────────────────────────────────────────────────────────────────
 *
 * O sufixo do nome do canal era `tentativas`, o MESMO contador do recuo
 * exponencial, que volta a 0 quando o canal assina com sucesso. Então:
 *
 *   1. cai        → tentativas=1 → monta `…#1`  → assina → tentativas volta a 0
 *   2. cai de novo → tentativas=1 → monta `…#1` DE NOVO
 *
 * O `supabase-js` não cria outro canal quando o nome repete: devolve o que já
 * existe. Esse já está assinado (e o `removeChannel` do anterior é assíncrono,
 * então ele ainda nem saiu da lista), e `.on()` num canal assinado lança.
 * A exceção sai de uma função `async` sem ninguém esperando: o canal fica
 * morto, sem retomada, até a pessoa recarregar.
 *
 * O contador do recuo e o contador do NOME são coisas diferentes: um volta a
 * zero por desenho, o outro só pode crescer.
 *
 * ─── Por que um cliente falso que se comporta como o real ───────────────────
 *
 * O `realtime-reconecta.test.ts` guarda o texto do código. Texto que "tem a
 * chamada" é o que deixou este defeito passar: o código chamava `channel()` com
 * um nome, e ninguém perguntou se era um nome NOVO. Aqui o cliente repete as
 * duas regras do `supabase-js` que importam — nome repetido devolve o canal
 * existente, e `.on()` depois de `subscribe()` lança.
 */

const mock = vi.hoisted(() => ({ prepare: vi.fn(), client: null as unknown }));
vi.mock("@/lib/supabase/browser", () => ({
  prepareRealtimeAuthentication: mock.prepare,
  createClient: () => mock.client,
}));

import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";

type Cb = (s: string) => void;
interface CanalFalso {
  topic: string;
  assinado: boolean;
  cb: Cb | null;
  on: () => CanalFalso;
  subscribe: (cb: Cb) => CanalFalso;
}

function clienteFalso() {
  const lista = new Map<string, CanalFalso>();
  const criados: CanalFalso[] = [];
  return {
    criados,
    channel(nome: string): CanalFalso {
      const topic = `realtime:${nome}`;
      const existente = lista.get(topic);
      if (existente) return existente;
      const c: CanalFalso = {
        topic,
        assinado: false,
        cb: null,
        on() {
          if (this.assinado) {
            throw new Error(`cannot add \`postgres_changes\` callbacks for ${topic} after \`subscribe()\`.`);
          }
          return this;
        },
        subscribe(cb) {
          this.assinado = true;
          this.cb = cb;
          return this;
        },
      };
      lista.set(topic, c);
      criados.push(c);
      return c;
    },
    // Assíncrono de verdade: o canal só sai da lista depois — como no real.
    removeChannel(c: CanalFalso) {
      return new Promise<string>((ok) =>
        setTimeout(() => {
          lista.delete(c.topic);
          ok("ok");
        }, 5_000),
      );
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  mock.prepare.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it("cair, voltar e cair de novo monta um canal NOVO — nunca o já assinado", async () => {
  const cliente = clienteFalso();
  mock.client = cliente;
  const erros: unknown[] = [];
  const registrar = (e: unknown) => erros.push(e);
  process.on("unhandledRejection", registrar);

  const { unmount } = renderHook(() =>
    useRealtimeChannel({
      name: "alerts-messages-org",
      postgresChanges: { event: "INSERT", table: "messages" },
      onChange: () => {},
    }),
  );
  await act(async () => {});
  expect(cliente.criados).toHaveLength(1);

  // 1ª queda: assina, cai, o recuo espera 1s e monta o canal seguinte.
  await act(async () => cliente.criados[0]!.cb!("SUBSCRIBED"));
  await act(async () => cliente.criados[0]!.cb!("CLOSED"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });
  expect(cliente.criados).toHaveLength(2);

  // Voltou (o contador do recuo zera) e caiu OUTRA vez, antes de o
  // `removeChannel` do primeiro terminar.
  await act(async () => cliente.criados[1]!.cb!("SUBSCRIBED"));
  await act(async () => cliente.criados[1]!.cb!("CLOSED"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000);
  });

  expect(cliente.criados, "a 2ª retomada não montou um canal novo").toHaveLength(3);
  const topicos = cliente.criados.map((c) => c.topic);
  expect(new Set(topicos).size, `nome repetido: ${topicos.join(" | ")}`).toBe(topicos.length);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_000);
  });
  process.off("unhandledRejection", registrar);
  expect(erros, "a retomada lançou — o canal ficaria morto").toEqual([]);
  unmount();
});
