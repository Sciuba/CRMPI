-- 0235 — importar o histórico do WhatsApp sem acionar o atendimento.
--
-- Ao parear um número, o aparelho entrega o passado da conversa. Queremos ele no
-- CRM como CONTEXTO (quem atende lê, a IA enxerga) — e não como evento: cada
-- mensagem antiga que acionasse o pipeline ao vivo dispararia sentimento (chamada
-- paga), automação, follow-up e a distribuição das conversas entre atendentes.
--
-- Duas portas de efeito colateral nascem de um INSERT, e as duas aprendem a ficar
-- quietas aqui:
--   1. `trg_messages_emit_event` (AFTER INSERT em messages) emite `message.received`
--      para tudo que entra. Passa a pular a linha marcada `is_historical`.
--   2. `trg_conversation_routing_requested` (AFTER INSERT em conversations, conversa
--      aberta e sem dono) pede roteamento. A conversa criada pela importação não
--      pode entrar na fila de distribuição; a função de importação liga um
--      marcador local à transação e o emissor o respeita.
--
-- A importação NÃO passa por `fn_mark_conversation_message`: aquela soma não lida e
-- carimba `last_inbound_at`/`last_outbound_at`, que alimentam varreduras de
-- silêncio e aviso de "cliente esperando". Histórico não é espera de ninguém.

alter table public.messages add column if not exists is_historical boolean not null default false;

comment on column public.messages.is_historical is
  'Mensagem trazida do histórico do aparelho no pareamento (migration 0235). Não emite message.received e não conta como não lida.';

create or replace function public.fn_emit_message_event() returns trigger
  language plpgsql
  set search_path to 'public', 'pg_temp'
as $$
declare
  v_event text;
begin
  if new.is_historical then
    return new;
  end if;

  if new.direction = 'inbound' then
    v_event := 'message.received';
  else
    v_event := case new.status
                 when 'sending' then 'message.sending'
                 when 'sent' then 'message.sent'
                 when 'failed' then 'message.failed'
                 else 'message.outbound'
               end;
  end if;

  perform public.fn_log_event(
    new.organization_id, v_event,
    jsonb_build_object(
      'message_id', new.id, 'conversation_id', new.conversation_id,
      'contact_id', new.contact_id, 'direction', new.direction,
      'type', new.type, 'status', new.status, 'external_id', new.external_id,
      'channel_session_id', new.channel_session_id,
      'body_preview', "left"(new.body, 280)
    )
  );
  return new;
end$$;

create or replace function public.fn_emit_conversation_routing() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if coalesce(current_setting('app.importando_historico', true), '') = 'on' then
    return null;
  end if;
  perform public.emit_event(
    'conversation.routing_requested',
    'conversation',
    new.id,
    jsonb_build_object('conversation_id', new.id, 'organization_id', new.organization_id),
    '{}'::jsonb,
    new.organization_id
  );
  return null;
end;
$$;

-- Importa um lote de mensagens de UM contato. `p_msgs` é um array de
-- { external_id, direction, type, body, sent_at, midia }. Devolve quantas entraram.
-- Reexecutável: o que já existe (mesmo external_id na organização) é ignorado.
-- A restrição `messages_org_external_id_unique` é DEFERRABLE, então `ON CONFLICT`
-- não a aceita; a deduplicação é explícita.
create or replace function public.fn_importar_historico_whatsapp(
  p_org uuid, p_session uuid, p_contact uuid, p_msgs jsonb
) returns integer
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_conv uuid;
  v_inseridas integer := 0;
  v_ultima timestamptz;
  v_preview text;
begin
  if not exists (select 1 from public.channel_sessions where id = p_session and organization_id = p_org) then
    raise exception 'sessao_fora_da_organizacao' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.contacts where id = p_contact and organization_id = p_org) then
    raise exception 'contato_fora_da_organizacao' using errcode = 'P0002';
  end if;
  if p_msgs is null or jsonb_typeof(p_msgs) <> 'array' or jsonb_array_length(p_msgs) = 0 then
    return 0;
  end if;

  perform set_config('app.importando_historico', 'on', true);
  v_conv := public.fn_upsert_wa_conversation(p_org, p_contact, p_session);

  with lote as (
    select distinct on (m ->> 'external_id')
           m ->> 'external_id' as external_id,
           m ->> 'direction' as direction,
           coalesce(nullif(m ->> 'type', ''), 'text') as type,
           nullif(m ->> 'body', '') as body,
           (m ->> 'sent_at')::timestamptz as sent_at,
           coalesce((m ->> 'midia')::boolean, false) as midia
      from jsonb_array_elements(p_msgs) m
     where nullif(m ->> 'external_id', '') is not null
       and m ->> 'direction' in ('inbound', 'outbound')
       and nullif(m ->> 'sent_at', '') is not null
     order by m ->> 'external_id'
  ), novas as (
    insert into public.messages (
      organization_id, conversation_id, channel_session_id, contact_id, external_id,
      type, direction, status, body, sent_via, sent_at, delivered_at, is_historical, metadata
    )
    select p_org, v_conv, p_session, p_contact, l.external_id,
           l.type, l.direction,
           case when l.direction = 'inbound' then 'delivered' else 'sent' end,
           l.body, 'external_device', l.sent_at, l.sent_at, true,
           jsonb_build_object('historico', true, 'midia_nao_importada', l.midia)
      from lote l
     where not exists (
       select 1 from public.messages x
        where x.organization_id = p_org and x.external_id = l.external_id
     )
    returning sent_at, body
  )
  select count(*), max(sent_at) into v_inseridas, v_ultima from novas;

  if v_inseridas > 0 then
    select coalesce(body, '[mídia]') into v_preview
      from public.messages
     where organization_id = p_org and conversation_id = v_conv and sent_at = v_ultima
     order by created_at desc limit 1;

    update public.conversations set
      last_message_at = greatest(last_message_at, v_ultima),
      last_message_preview = case
        when last_message_at is null or v_ultima >= last_message_at then left(v_preview, 280)
        else last_message_preview end
     where id = v_conv and organization_id = p_org;

    update public.contacts set last_activity_at = greatest(last_activity_at, v_ultima)
     where id = p_contact and organization_id = p_org;
  end if;

  return v_inseridas;
end;
$$;

revoke execute on function public.fn_importar_historico_whatsapp(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_importar_historico_whatsapp(uuid, uuid, uuid, jsonb) to service_role;
