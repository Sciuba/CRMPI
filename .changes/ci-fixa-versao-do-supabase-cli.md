---
impacto: nada_mudou
secao: corrigido
titulo: O teste de ponta a ponta do CI usa uma versão fixa do CLI do Supabase
---

O CI baixava sempre a última versão do CLI do Supabase, e a v3.0.0 deixou de
aceitar a configuração local do repositório, derrubando todos os testes e2e.
Agora a versão é fixa em 2.122.0. Não muda nada em quem opera uma VPS.
