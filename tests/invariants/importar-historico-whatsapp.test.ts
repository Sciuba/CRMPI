import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, GOV_SESSION, seedGov, sql } from "./gov-helpers";

/**
 * Migration 0235 — o histórico do aparelho entra como CONTEXTO, não como evento.
 *
 * O que se prova aqui é o que o produto promete a quem pareia um número: as
 * conversas antigas aparecem, e NADA reage a elas — nem IA, nem sentimento, nem
 * follow-up, nem a distribuição entre atendentes. E o contraponto, que é o que
 * impede a cura de virar mordaça: a mensagem e a conversa AO VIVO continuam
 * emitindo o que sempre emitiram.
 */

const CONTATO = "dddddddd-3333-4000-8000-000000000001";
const CONTATO_VIVO = "dddddddd-3333-4000-8000-000000000002";
const OUTRA_ORG = "dddddddd-0000-4000-8000-000000000009";
const OUTRA_SESSAO = "dddddddd-2222-4000-8000-000000000009";

const LOTE = JSON.stringify([
  { external_id: "hist-1", direction: "inbound", type: "text", body: "oi, queria registrar uma marca", sent_at: "2026-08-01T10:00:00Z" },
  { external_id: "hist-2", direction: "outbound", type: "text", body: "claro, qual o nome?", sent_at: "2026-08-01T10:05:00Z" },
  { external_id: "hist-3", direction: "inbound", type: "text", body: "Acme", sent_at: "2026-08-01T10:06:00Z" },
  { external_id: "hist-3", direction: "inbound", type: "text", body: "Acme", sent_at: "2026-08-01T10:06:00Z" },
  { external_id: "hist-4", direction: "inbound", type: "audio", body: "", sent_at: "2026-08-01T09:00:00Z", midia: true },
]);

function importar(contato: string, lote: string, sessao = GOV_SESSION, org = GOV_ORG): string {
  const escapado = lote.replace(/'/g, "''");
  return sql(
    `select public.fn_importar_historico_whatsapp('${org}', '${sessao}', '${contato}', '${escapado}'::jsonb);`,
  );
}

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO}', '${GOV_ORG}', 'Historico Invariant'),
      ('${CONTATO_VIVO}', '${GOV_ORG}', 'Vivo Invariant')
    on conflict do nothing;
    insert into public.organizations (id, slug, legal_name, display_name)
      values ('${OUTRA_ORG}', 'hist-outra', 'Outra Org', 'Outra') on conflict do nothing;
    do $h$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${OUTRA_SESSAO}', '${OUTRA_ORG}', 'hist-outra', '\\x00'::bytea);
    exception when unique_violation then null; end $h$;
  `);
});

describe("0235 — importar histórico do WhatsApp", () => {
  it("importa o lote, ignora a duplicata do próprio lote e marca tudo como histórico", () => {
    expect(importar(CONTATO, LOTE)).toBe("4");
    const marcadas = sql(
      `select count(*) from public.messages where contact_id = '${CONTATO}' and is_historical and metadata->>'historico' = 'true';`,
    );
    expect(marcadas).toBe("4");
  });

  it("reimportar não duplica (a restrição é DEFERRABLE, a deduplicação é explícita)", () => {
    expect(importar(CONTATO, LOTE)).toBe("0");
    expect(sql(`select count(*) from public.messages where contact_id = '${CONTATO}';`)).toBe("4");
  });

  it("nada reage: nenhum evento de mensagem nem pedido de roteamento", () => {
    const eventos = sql(`
      select count(*) from public.event_log e
       where e.organization_id = '${GOV_ORG}'
         and (e.event_type like 'message.%' or e.event_type = 'conversation.routing_requested')
         and (e.payload ->> 'contact_id' = '${CONTATO}'
              or e.payload ->> 'conversation_id' in (select id::text from public.conversations where contact_id = '${CONTATO}'));
    `);
    expect(eventos).toBe("0");
  });

  it("não vira espera de ninguém: sem não-lida, sem carimbo de entrada/saída; ordena pela última mensagem", () => {
    const linha = sql(`
      select unread_count_for_assignee, last_inbound_at is null, last_outbound_at is null,
             last_message_at = '2026-08-01T10:06:00Z'::timestamptz, last_message_preview, status, assigned_to_user_id is null
        from public.conversations where contact_id = '${CONTATO}' and channel_session_id = '${GOV_SESSION}';
    `);
    expect(linha).toBe("0|t|t|t|Acme|open|t");
  });

  it("mídia não importada fica sinalizada, sem inventar texto", () => {
    const m = sql(`select body is null, metadata->>'midia_nao_importada' from public.messages where external_id = 'hist-4';`);
    expect(m).toBe("t|true");
  });

  it("contraponto: o caminho AO VIVO continua emitindo evento de mensagem e roteamento", () => {
    sql(`
      select public.fn_upsert_wa_conversation('${GOV_ORG}', '${CONTATO_VIVO}', '${GOV_SESSION}');
      insert into public.messages (organization_id, conversation_id, channel_session_id, contact_id, external_id, type, direction, status, body, sent_via)
        select '${GOV_ORG}', c.id, '${GOV_SESSION}', '${CONTATO_VIVO}', 'vivo-1', 'text', 'inbound', 'delivered', 'olá', 'external_device'
          from public.conversations c where c.contact_id = '${CONTATO_VIVO}';
    `);
    const recebida = sql(
      `select count(*) from public.event_log where organization_id = '${GOV_ORG}' and event_type = 'message.received' and payload ->> 'contact_id' = '${CONTATO_VIVO}';`,
    );
    const roteamento = sql(`
      select count(*) from public.event_log
       where organization_id = '${GOV_ORG}' and event_type = 'conversation.routing_requested'
         and entity_id in (select id from public.conversations where contact_id = '${CONTATO_VIVO}');
    `);
    expect(recebida).toBe("1");
    expect(roteamento).toBe("1");
  });

  it("o marcador de importação não vaza para a transação seguinte", () => {
    const resto = sql(`
      select public.fn_importar_historico_whatsapp('${GOV_ORG}', '${GOV_SESSION}', '${CONTATO}', '[]'::jsonb);
      select '[' || coalesce(current_setting('app.importando_historico', true), '') || ']';
    `);
    // Entre colchetes porque `sql()` apara a saída: um valor vazio sumiria.
    expect(resto.split("\n").pop()).toBe("[]");
  });

  it("recusa sessão de outra organização (o filtro de tenant está na função)", () => {
    expect(() => importar(CONTATO, LOTE, OUTRA_SESSAO)).toThrow(/sessao_fora_da_organizacao/);
  });

  it("só o service_role executa; anon, authenticated e public não", () => {
    const f = "public.fn_importar_historico_whatsapp(uuid,uuid,uuid,jsonb)";
    const privilegios = sql(`
      select has_function_privilege('anon', '${f}', 'execute'),
             has_function_privilege('authenticated', '${f}', 'execute'),
             has_function_privilege('public', '${f}', 'execute'),
             has_function_privilege('service_role', '${f}', 'execute');
    `);
    expect(privilegios).toBe("f|f|f|t");
  });
});
