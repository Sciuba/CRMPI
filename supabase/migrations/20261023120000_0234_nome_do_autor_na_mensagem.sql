-- 0234 · A mensagem passa a carregar o NOME de quem a enviou.
--
-- A tela do Inbox mostrava só "IA" nas mensagens do agente automático; a de uma
-- pessoa não dizia quem era. Com supervisor e admin podendo assumir ou transferir
-- uma conversa, o histórico deixava de responder "quem escreveu isto?". O banco já
-- guardava `sent_by_user_id`; faltava o nome, que mora em auth.users e custaria
-- uma chamada HTTP ao GoTrue por autor em cada leitura (ver o mesmo raciocínio na
-- 0202, `conversations.assigned_to_user_name`).
--
-- Aditiva e idempotente: coluna nullable, backfill guardado por `is null`,
-- `create or replace function`, `drop trigger if exists`. O trigger só consulta
-- auth.users — não faz HTTP.

alter table public.messages
  add column if not exists sent_by_user_name text;

comment on column public.messages.sent_by_user_name is
  'Cópia do nome de quem enviou a mensagem (auth.users.raw_user_meta_data->>''full_name''), gravada por fn_messages_nome_do_autor no INSERT quando sent_by_user_id está preenchido. Sobrevive à saída do usuário (a FK zera sent_by_user_id, o histórico continua dizendo quem escreveu). NULL para mensagem de IA, do sistema, do cliente ou de usuário sem full_name.';

-- Backfill: só mensagens de pessoa que ainda não têm o nome. Reaplicar não
-- sobrescreve nada.
update public.messages m
   set sent_by_user_name = nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
  from auth.users u
 where m.sent_by_user_id = u.id
   and m.sent_by_user_name is null;

-- Preenche o nome NO INSERT, para o único ponto de gravação do app e qualquer
-- futuro continuarem corretos sem lembrar de passar o nome. Só LÊ auth.users:
-- sem HTTP, sem rede dentro da transação (anti-pattern 9 da doutrina).
create or replace function public.fn_messages_nome_do_autor()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.sent_by_user_id is not null and new.sent_by_user_name is null then
    select nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
      into new.sent_by_user_name
      from auth.users u
     where u.id = new.sent_by_user_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_messages_nome_do_autor() from public, anon, authenticated;

drop trigger if exists trg_messages_nome_do_autor on public.messages;
create trigger trg_messages_nome_do_autor
  before insert on public.messages
  for each row
  execute function public.fn_messages_nome_do_autor();
