---
impacto: nada_mudou
secao: corrigido
titulo: O histórico importado do WhatsApp não volta a aparecer como "não lido" a cada atualização
---

Toda atualização da instalação recalcula o contador de não lidas de cada conversa, e esse cálculo
não distinguia o histórico importado no pareamento das mensagens novas. Resultado: conversas antigas,
que ninguém espera resposta, voltavam a aparecer como não lidas depois de um update. O cálculo agora
ignora o histórico; só mensagem recebida depois do pareamento conta como não lida.
