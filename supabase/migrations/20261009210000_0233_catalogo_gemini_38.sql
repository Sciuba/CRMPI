-- 0233 — catálogo Google: Gemini 3.8 Flash, 3.5 Flash-Lite e 3.1 Flash-Lite
--
-- O catálogo do Google parou no 3.5 Flash. Quem tem o agente em Gemini e quer
-- um modelo mais novo — ou um com cota gratuita que sobre — não encontra nada
-- para escolher na tela, porque o Google é o único provedor sem sincronização
-- automática (`catalogoSincronizavel: false` em lib/ai/pontos/provedores.ts).
--
-- OS IDS FORAM VERIFICADOS (diferente do bloco do Google da 0104): vieram de
-- `GET https://generativelanguage.googleapis.com/v1beta/models` feito com uma
-- chave real em 2026-10-09 — `models/gemini-3.8-flash`, `models/gemini-3.5-flash-lite`
-- e `models/gemini-3.1-flash-lite` estavam na lista devolvida.
--
-- PREÇOS: página oficial de preços do Gemini API (ai.google.dev/gemini-api/docs/pricing),
-- camada paga, texto/imagem/vídeo, em CENTAVOS por milhão de tokens (a unidade das
-- duas tabelas). A saída inclui os tokens de raciocínio.
--   gemini-3.8-flash       US$0,75 / US$3,75 até 31/12/2026; US$1,50 / US$7,50 a partir
--                          de 01/01/2027. Gravamos o preço de HOJE — reveja em 01/01/2027.
--   gemini-3.5-flash-lite  US$0,30 / US$2,50
--   gemini-3.1-flash-lite  US$0,25 / US$1,50 (áudio de entrada custa US$0,50; esta
--                          tabela tem um preço só, o de texto)
--
-- NÃO ENTRARAM, de propósito: `gemini-3.7-flash` e `gemini-3.6-flash` existem na
-- lista da chave, mas a página de preços não traz o 3.7 e o 3.6 é o mesmo preço do
-- 3.8 — sem motivo para duas linhas. Preço que não está na fonte não é inventado.
--
-- O PADRÃO DO GOOGLE NÃO MUDA (continua `gemini-3.5-flash`): trocar o padrão muda
-- o que todo agente NOVO de todo clone recebe, e isso é decisão de produto, não
-- de catálogo. `gemini-2.5-flash` também fica: a lista da chave ainda o devolve e
-- a página ainda o precifica; o 404 "não disponível para novos usuários" foi visto
-- numa conta, e depreciar aqui o esconderia de quem ainda o usa.
--
-- `context_window` e `released_at` ficam NULL: não tenho o dado, e a tela sabe
-- lidar com null. Idempotente: `on conflict do update`, seguro em re-aplicação.

insert into public.ai_models
  (provider, model_id, display_name, description,
   input_price_per_million_cents, output_price_per_million_cents, supports_tools)
values
  ('google', 'gemini-3.8-flash', 'Gemini 3.8 Flash',
   'O Flash mais novo do Google. Preço de introdução (US$0,75/US$3,75 por milhão) até 31/12/2026; a partir de 01/01/2027 passa a US$1,50/US$7,50 — reveja este preço nessa data.',
   75, 375, true),
  ('google', 'gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite',
   'Barato e rápido, para classificação e tarefas simples.',
   30, 250, true),
  ('google', 'gemini-3.1-flash-lite', 'Gemini 3.1 Flash-Lite',
   'O mais barato desta lista, para classificação e tarefas simples.',
   25, 150, true)
on conflict (provider, model_id) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  input_price_per_million_cents = excluded.input_price_per_million_cents,
  output_price_per_million_cents = excluded.output_price_per_million_cents,
  supports_tools = excluded.supports_tools;

-- A MESMA lista na contabilidade de custo, senão o gasto é calculado com o preço
-- de outro modelo — ou não é calculado, e o teto de orçamento nunca dispara.
insert into public.ai_pricing
  (model, prompt_cents_per_million_tokens, completion_cents_per_million_tokens, notes)
values
  ('gemini-3.8-flash',      75,  375, 'catálogo 0233 — introdução até 31/12/2026; depois 150/750'),
  ('gemini-3.5-flash-lite', 30,  250, 'catálogo 0233'),
  ('gemini-3.1-flash-lite', 25,  150, 'catálogo 0233 — áudio de entrada custa 50')
on conflict (model) do update set
  prompt_cents_per_million_tokens = excluded.prompt_cents_per_million_tokens,
  completion_cents_per_million_tokens = excluded.completion_cents_per_million_tokens,
  notes = excluded.notes,
  superseded_at = null;
