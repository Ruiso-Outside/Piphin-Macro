# Piphin Macro

Macros de teclado e mouse, autoclicker e analisador anti-macro da **Piphin Studio**, feitos para testar seus jogos e desenvolver o anti-macro deles. Instale e atualize pelo **Piphin Hub**.

Nada de programa de terceiros: o motor é o arquivo `lib/engine.cs` (código aberto), que o próprio PowerShell do Windows compila na memória ao ligar. O `.exe` é o do Electron oficial, sem modificações, por isso o **Controle Inteligente de Aplicativos** do Windows não bloqueia. Os dados ficam em `%APPDATA%\Piphin Macro`.

## O que ele faz
- **Macros**: passos de tecla (pressionar/segurar/soltar), clique (com tempo segurado e repetições), mover o mouse (posição na tela ou relativo para câmera/FPS, com duração), espera fixa ou aleatória, roda do mouse, digitar texto, esperar a cor de um pixel e blocos de repetição. Modelos prontos (turbo, combo, rajada, anti-AFK, reação a cor...).
- **Gravador**: grava teclado e mouse (com ou sem movimento, absoluto ou relativo). <kbd>F9</kbd> no jogo encerra a gravação.
- **Disparo**: atalho global (teclado ou botões do mouse, com Ctrl/Alt/Shift/Win), modos *Uma vez*, *Repetir N vezes*, *Liga/desliga* e *Enquanto segurar*; pode bloquear o atalho no jogo e funcionar só num processo (`MeuJogo.exe`).
- **Variação humana**: sorteia esperas, tempos segurados e a curva do mouse.
- **Autoclicker**: CPS mínimo/máximo, botão, tempo segurado, clique duplo, ponto fixo e limite.
- **Analisador anti-macro**: mostra cada entrada como física, injetada ou do Piphin; mede intervalos, variação, tempo segurado e teleporte do mouse; desenha o histograma e dá um veredito com os motivos. Tem simulação de macro robótica e humanizada para comparar.
- **Segurança**: tecla de pânico (<kbd>F12</kbd>) para tudo e solta qualquer tecla/botão preso; as entradas enviadas pelo Piphin são marcadas e nunca disparam outro atalho. Com atalhos ativos, fechar a janela deixa o app na bandeja.

As teclas vão por **scancode** (funciona com DirectInput/Raw Input). Jogo aberto como administrador exige o Piphin Macro como administrador. Anti-cheats online detectam macros: use nos seus jogos ou offline.

## Desenvolvimento
```
npm install
npm start          # roda o app
npm run check      # teste rápido do motor (só envia F24, que não faz nada)
npm run icon       # redesenha icons/macro.png e macro.ico
npm run dist       # gera dist\Piphin-Macro-X.Y.Z-win-x64.zip
```

### Publicar uma versão
1. Aumente `"version"` no `package.json` e rode `npm run dist`.
2. Crie o Release `vX.Y.Z` neste repositório com `Piphin-Macro-X.Y.Z-win-x64.zip`. O Piphin Hub encontra e instala sozinho.

## Estrutura
| Arquivo | Conteúdo |
|---|---|
| `main.js` / `preload.js` | Janela, bandeja e ponte com a interface |
| `lib/engine.cs` | Motor de entrada: ganchos globais (`SetWindowsHookEx`) e `SendInput`; executa as macros com tempo preciso |
| `lib/engine.js` | Processo do motor (PowerShell), protocolo por linhas, reinício automático |
| `lib/macros.js` | Macros, atalhos e modos, gravação, autoclicker, analisador |
| `web/` | Interface (`macro.js`: telas) |

### Protocolo do motor
Uma linha por comando no stdin, campos separados por TAB. Passos de uma macro: `kd`/`ku`/`kp` (tecla), `md`/`mu`/`mc` (botão), `ma`/`mr` (mover absoluto/relativo), `wh`/`hw` (roda), `w` (espera), `t` (texto em base64), `wc` (cor de pixel), `rs`/`re` (bloco de repetição). Eventos saem no stdout: `hd`/`hu` (atalho), `k`/`m` (entradas, com origem 0 física, 1 injetada, 2 Piphin), `loop`, `end`, `panic`.
