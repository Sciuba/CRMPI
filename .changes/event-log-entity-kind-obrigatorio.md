---
impacto: nada_mudou
secao: corrigido
titulo: Publicar um agente e concluir o onboarding voltam a registrar o evento no histórico do sistema
---

Ao publicar um agente (ou reverter para uma versão), criar o agente padrão no onboarding
e concluir o onboarding, o evento correspondente era recusado pelo banco com "null value
in column entity_kind" e se perdia — só aparecia no log do app. A publicação em si
funcionava; o que faltava era o registro do evento. Agora ele é gravado com o tipo e o id
da entidade.
