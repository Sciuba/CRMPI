-- 0237 — os avisos da Central chegam ao navegador em tempo real.
--
-- `agent_inbox_items` é onde o CRM pede atenção do operador (número aguardando
-- liberação, QR a reescanear, mensagem presa). Para o navegador transformar um
-- aviso novo em notificação do sistema, a tabela precisa estar na publicação do
-- realtime. A RLS por organização (tenant_isolation) continua filtrando quem recebe.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agent_inbox_items'
  ) then
    alter publication supabase_realtime add table public.agent_inbox_items;
  end if;
end $$;
