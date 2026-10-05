---
impacto: capacidade_nova
secao: adicionado
titulo: O instalador sabe lidar com código privado e com token vencido
---

Quando o GitHub recusa o acesso ao código, o instalador agora pede um token de acesso, em vez
de travar. Ele guarda o token dentro da pasta do projeto, só para o git dali, e não no `.env`.
Assim as atualizações pela tela continuam funcionando sem ninguém digitar nada. Com o código
público, nada muda: o token nunca é pedido.

Se o token vencer ou for revogado, o `update.sh` diz exatamente isso, e o log do agente de
atualização também. Sem internet, a mensagem continua sendo "não consegui falar com o GitHub",
e não manda ninguém pedir token novo à toa. Para trocar o token, rode
`bash setup-kit/trocar-token.sh`.

Também corrigimos o README: o `cd` depois do clone agora aponta para a pasta que o clone cria.
