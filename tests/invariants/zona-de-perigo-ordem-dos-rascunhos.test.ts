import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * A "Zona de perigo" apaga `ai_reply_drafts` ANTES de `messages` porque
 * `ai_reply_drafts.message_id` não tem cascata. Se um dia a FK mudar, a ordem
 * em `RAIZES_DO_APAGAMENTO` deixa de ser necessária — e se ela voltar a
 * restringir sem a ordem, o reset morre no primeiro passo.
 */
describe("zona de perigo — rascunhos da IA", () => {
  it("ai_reply_drafts.message_id referencia messages sem cascata (NO ACTION)", () => {
    const acao = sql(`
      select c.confdeltype
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
       where c.contype = 'f'
         and c.conrelid = 'public.ai_reply_drafts'::regclass
         and c.confrelid = 'public.messages'::regclass
         and a.attname = 'message_id';
    `);
    expect(acao).toBe("a");
  });
});
