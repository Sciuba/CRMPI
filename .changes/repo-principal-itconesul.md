---
impacto: nada_mudou
secao: alterado
titulo: O repositório e as imagens Docker passam a morar na conta itConesul
---

O código e as imagens (`deskcommcrm`, `deskcomm-worker`, `deskcomm-scheduler`)
agora são publicados em `ghcr.io/itconesul`. Quem já tem uma VPS instalada não
precisa fazer nada: o `update.sh` regrava as três referências no `.env` para o
novo endereço, e até lá as imagens continuam espelhadas em `ghcr.io/sciuba`.
