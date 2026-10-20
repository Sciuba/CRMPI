---
impacto: nada_mudou
secao: corrigido
titulo: A imagem deixa de depender de baixar fontes do Google durante o build
---

As fontes da interface (Atkinson Hyperlegible e IBM Plex Mono) eram baixadas do Google
a cada build da imagem, e um problema de rede no servidor de build impedia a publicação
da versão. Agora elas vêm empacotadas no próprio código. A aparência é a mesma; só os
caracteres fora do alfabeto latino básico (por exemplo, letras do polonês ou do tcheco)
passam a usar a fonte do sistema.
