---
impacto: capacidade_nova
secao: alterado
titulo: Instalação e atualização com token de acesso ao código
---

O código do CRM agora é privado. Na instalação, o `git clone` pede usuário e senha: no usuário
vale qualquer coisa, e na senha vai o token de acesso que vem junto com o CRM. O instalador
guarda esse token dentro da pasta do projeto, só para o git dali, e não no `.env`. Assim as
atualizações pela tela continuam funcionando sem ninguém digitar nada.

Quando o token vence ou é revogado, o `update.sh` diz exatamente isso, e o log do agente de
atualização também. Sem internet, a mensagem continua sendo a de antes, "não consegui falar com
o GitHub", e não manda ninguém pedir token novo à toa. Para trocar o token, rode
`bash setup-kit/trocar-token.sh`.

Também corrigimos o README: o `cd` depois do clone agora aponta para a pasta que o clone cria.
