# lib/waha/

> Placeholder. Cliente real virá da Spec 03 — WhatsApp via WAHA Plus.

Escopo previsto:

- `client.ts` — wrapper HTTP do WAHA (auth via `X-Api-Key` plaintext; nunca query string)
- `signature.ts` — verificação HMAC SHA512 dos webhooks com `crypto.timingSafeEqual`
- `throttle.ts` — anti-banimento (1 msg/1.2s + jitter ≤800ms; campanha 1 msg/5s)
- `stop-detection.ts` — regex `/STOP|PARAR|SAIR|UNSUBSCRIBE/i`
- `media.ts` — upload pro Supabase Storage primeiro, URL ao WAHA
- `types.ts` — tipos canônicos de payloads WAHA (Zod-validados)

## Regras críticas (Spec 03 — adiantadas aqui)

1. Auth: env do WAHA recebe **hash SHA512 hex**; client envia plaintext em `X-Api-Key`
2. Engine NOWEB default; subscrever `message.any` (não só `message`); tratar `fromMe=true` sem duplicar
3. Grupos: SKIP CRM binding se `chatId.endsWith("@g.us")`; sender é `p.author`
4. Idempotência: `unique (organization_id, external_id)` + captura `code === "23505"`
5. Cron `recover-stuck-messages`: `status='sending'` há >5min → `failed`

## Sessões e reserva local

`lib/channels/connect-waha.ts` reserva a identidade por organização e Idempotency-Key antes de criar/iniciar remoto. Erro desconhecido 409/422 não é sucesso; o cliente exige envelope conhecido, identidade exata e pós-condição. Falha preserva FAILED e a identidade; nova tentativa reutiliza a mesma sessão via reserva. Não há compensação destrutiva automática. `tier=CORE` não implica limite de uma sessão; a prova 2026.7.2/NOWEB chega somente a duas SCAN_QR_CODE, sem pairing ou envio.

## Histórico do aparelho (migration 0235)

Ao parear, o WhatsApp entrega o passado das conversas ao aparelho novo. O WAHA **não** o manda por
webhook: só o guarda no *store* do NOWEB (sqlite em `/app/.sessions`, volume `waha-data`) e o expõe por
REST. Por isso toda sessão nasce com `config.noweb.store = { enabled: true, fullSync: true }`
(`HISTORICO_DO_APARELHO` em `client.ts`) — ligar depois não traz o passado de volta, porque o aparelho
só o entrega no pareamento.

Fluxo: `handleSessionStatus` (WORKING) → `pedirImportacaoDoHistorico` (uma vez por sessão, estado em
`channel_sessions.metadata.historico`) → evento `whatsapp.history_import_requested` →
`lib/channels/importar-historico.ts` → rodadas de ~40s em `lib/waha/historico.ts` →
`fn_importar_historico_whatsapp`. A importação é reexecutável (deduplica por `external_id`).

O que o CRM aceita: pessoas (não grupo, estado, difusão, canal), últimos 90 dias, texto; mídia entra
marcada `midia_nao_importada`, sem baixar o binário. O que NÃO acontece de propósito: as mensagens
importadas não emitem `message.received` nem pedem roteamento (`is_historical` e o marcador local
`app.importando_historico`), então IA, sentimento, follow-up, automações e distribuição ficam quietos.

Sessão que nasceu antes do recurso responde 400 na leitura: o estado vira `indisponivel`
(`motivo: store_desligado`) e o card do número ensina a desconectar e reconectar. Contatos criados por
esta via trazem dado pessoal de quem nunca escreveu ao CRM; a base legal e o prazo são do controlador
(ver LGPD no CLAUDE.md) — a janela de 90 dias é o teto do CRM, não do que o aparelho enviou.
