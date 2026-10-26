import { describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/** 0237 — sem estar na publicação do realtime, o navegador nunca recebe o aviso novo da Central. */
describe("0237 — avisos da Central em tempo real", () => {
  it("agent_inbox_items está na publicação supabase_realtime", () => {
    expect(
      sql(`select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='agent_inbox_items';`),
    ).toBe("1");
  });

  it("segue com RLS ligada (a publicação não vira vazamento entre organizações)", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = 'public.agent_inbox_items'::regclass;`)).toBe("t");
  });
});
