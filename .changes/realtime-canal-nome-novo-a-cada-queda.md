---
impacto: nada_mudou
secao: corrigido
titulo: O inbox e os avisos voltam a atualizar sozinhos depois de duas quedas seguidas de conexão
---

Quando a conexão em tempo real caía, voltava e caía de novo, a segunda tentativa de
reconexão usava o mesmo nome de canal da primeira e falhava com "cannot add
postgres_changes callbacks after subscribe()". O canal ficava morto, sem aviso, e a
tela só voltava a atualizar depois de recarregar a página. Agora cada reconexão usa um
nome novo.
