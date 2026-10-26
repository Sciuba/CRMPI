-- 0236 — o histórico do aparelho não conta como "não lida" (forward-fix da 0235).
--
-- O baseline carrega, desde antes da 0235, um backfill que recalcula
-- `conversations.unread_count_for_assignee` como "inbound desde a última saída" e
-- roda em TODO update.sh. Ele não conhecia `messages.is_historical`: a cada
-- atualização, toda conversa cujo histórico importado termina em mensagem recebida
-- voltava a ficar "não lida" (medido: 101 conversas sem nenhuma mensagem ao vivo).
-- O histórico é contexto, não espera de ninguém (0235).
--
-- Esta migration recalcula com a mesma fórmula, excluindo o histórico. O baseline
-- repete o bloco DEPOIS da 0235 (onde a coluna já existe), então o resultado final
-- de cada update.sh é o correto, mesmo que o backfill antigo rode antes.
update public.conversations c
set unread_count_for_assignee = coalesce((
  select count(*)::integer
  from public.messages m
  where m.conversation_id = c.id
    and m.direction = 'inbound'
    and not m.is_historical
    and m.sent_at > coalesce(c.last_outbound_at, '-infinity'::timestamptz)
), 0)
where unread_count_for_assignee <> coalesce((
  select count(*)::integer
  from public.messages m
  where m.conversation_id = c.id
    and m.direction = 'inbound'
    and not m.is_historical
    and m.sent_at > coalesce(c.last_outbound_at, '-infinity'::timestamptz)
), 0);
