---
impacto: nada_mudou
secao: corrigido
titulo: Erros nas telas de login, cadastro e convite passam a chegar ao Sentry
---

O navegador envia os erros ao Sentry pelo endereço `/monitoring` do próprio CRM, e esse endereço
exigia uma sessão aberta. Por isso, um erro na tela de login, de cadastro ou de aceitar convite,
antes de a pessoa ter entrado, era redirecionado para o login e se perdia. Agora ele chega,
tanto ao Sentry configurado em `SENTRY_DSN` quanto ao padrão.

Os erros enviados ao Sentry do projeto também passam a chegar com o código legível, porque o
build da imagem agora envia os mapas do código ao Sentry.
