# Discord Fake Game Launcher

**🌐 Idiomas:** [English](README.md) · **Português (BR)** · [Español](README.es.md)

Cria pequenos executáveis falsos que imitam processos de jogos reais, para que o Discord detecte um **jogo
verificado / registrado** como em execução. Pode ser usado para completar Missões (Quests) do Discord sem
instalar o jogo.

O app está disponível em **português (Brasil), inglês e espanhol**. Ele usa o idioma do seu sistema na
primeira vez e você pode trocar a qualquer momento no seletor de idioma da barra de título.

> [!IMPORTANT]
> Esta ferramenta é destinada a fins educacionais e uso pessoal. Respeite os termos de serviço do Discord,
> os parceiros, os direitos das publicadoras de jogos e dos anunciantes ao usar este aplicativo.
> Discord é uma marca registrada da Discord Inc. Ela é citada neste projeto de código aberto apenas para
> fins descritivos e não implica nenhuma afiliação, patrocínio ou endosso da Discord Inc.

**Desenvolvedor:** saralapia

## Índice

- [Como funciona](#como-funciona)
- [Recursos](#recursos)
- [Atualizações](#atualizações)
- [Modo aleatório](#modo-aleatório)
- [Adicionar pacote de jogos populares](#adicionar-pacote-de-jogos-populares)
- [Adicionar TODOS os jogos reconhecidos](#adicionar-todos-os-jogos-reconhecidos)
- [Ícones dos jogos](#ícones-dos-jogos)
- [Janela do jogo falso](#janela-do-jogo-falso)
- [Compilar](#compilar)
- [Lançar uma nova versão](#lançar-uma-nova-versão)
- [Créditos](#créditos)

## Como funciona

1. O app lê a lista de jogos detectáveis do Discord (`gamelist.json`, atualizada pela API pública do Discord
   toda vez que o app inicia; se não for possível acessar o Discord, usa a última lista salva).
2. Você busca um jogo e o adiciona à sua biblioteca.
3. Ao clicar em **Iniciar jogo**, o app cria um exe falso com o nome do jogo real em:

   `%APPDATA%/discord-fake-game-launcher-ui/games/<IDdoJogo>/<NomeDoJogo>.exe`

4. O Discord vê esse processo e mostra que você está jogando.

O mesmo executável falso funciona como **launcher** quando aberto pelo atalho ou pela pasta raiz, e como
**jogo falso** quando roda de uma subpasta dentro de `games/`.

## Recursos

- Busque na lista completa de jogos detectáveis do Discord e adicione à sua biblioteca.
- Inicie vários jogos falsos ao mesmo tempo, marque favoritos e crie atalhos na área de trabalho.
- **Adicione TODOS os jogos reconhecidos** com um clique, ou o **pacote de jogos populares**.
- **Modo aleatório**: alterna entre jogos aleatórios a cada X minutos.
- **Ícones** dos jogos vindos do Discord, na lista, no cabeçalho de detalhes e na janela de adicionar jogo.
- Os jogos falsos abrem uma janelinha (necessária para o Discord reconhecê-los); dá para iniciá-la minimizada, mas o Discord pode não detectar o jogo.
- Interface escura e moderna em **pt-BR, en e es**.
- **Aviso automático de atualização**: quando você publica uma nova versão, os usuários são avisados e
  atualizam com um clique.

## Atualizações

O app instalado procura uma nova versão no GitHub quando inicia e de novo a cada 30 minutos enquanto está
aberto.

1. Quando existe uma versão mais nova, abre a janela **Atualização disponível** com as notas da versão.
2. O usuário clica em **Atualizar agora**. O instalador é baixado (com barra de progresso), o app fecha e a
   nova versão é instalada e iniciada.
3. **Lembrar mais tarde** fecha a janela; um botão **Atualização disponível: vX.Y.Z** continua na barra de
   título e a janela abre de novo na próxima vez que o app iniciar.
4. O link **Verificar atualizações** no rodapé da barra lateral confere na hora.

As atualizações só funcionam no app instalado (não ao rodar pelo código com `npm run dev`).

## Modo aleatório

O modo aleatório mantém um jogo falso rodando por vez e o troca por outro aleatório de tempos em tempos.

### Como usar

1. Clique em **Modo aleatório** na barra lateral esquerda.
2. Defina **Trocar de jogo a cada (minutos)** (de 1 a 1440).
3. Escolha **Escolher jogos de**:
   - **Minha biblioteca**: só os jogos que você já adicionou.
   - **Todo o banco de dados do Discord**: qualquer jogo que o Discord reconhece (milhares de jogos).
4. Veja a linha **Lista**: ela mostra quantos jogos podem ser escolhidos. Precisa ser pelo menos 1.
5. Clique em **Iniciar modo aleatório**. Um jogo começa na hora.
6. Clique em **Parar modo aleatório** (ou feche o app) para encerrar. O jogo falso atual também é fechado.

O botão da barra lateral mostra **Modo aleatório · ATIVO** enquanto está rodando, e a janela mostra o jogo
atual, a contagem regressiva para a próxima troca e quantas trocas já aconteceram.

### O que acontece em cada troca

1. O jogo falso atual é parado.
2. O launcher espera cerca de 5 segundos, para o Discord perceber que o jogo terminou.
3. Um jogo aleatório diferente é iniciado. Os últimos jogos usados são evitados para não repetir sempre o
   mesmo.

### Quais jogos podem ser escolhidos

Só são usados jogos que o Discord **reconhece pelo nome do executável**. Estes nunca são escolhidos:

- jogos que o Discord lista sem executável (jogos de "nova detecção", o app mostra um aviso para eles),
- entradas que só têm um executável de launcher (modo "Todo o banco de dados do Discord"),
- entradas com nomes de arquivo inválidos no Windows.

Se um jogo falhar ao iniciar, o launcher tenta outro silenciosamente. Jogos escolhidos do banco de dados do
Discord que não estão na sua biblioteca são apagados do disco quando param, para a pasta `games` não
encher.

### Bom saber

- Se você fechar a janela de um jogo falso manualmente, o modo aleatório escolhe um novo jogo na próxima
  troca.
- Jogos que você iniciou manualmente nunca são tocados nem escolhidos pelo modo aleatório enquanto rodam.
- Se uma Missão do Discord exige um tempo longo e contínuo em **um jogo específico**, alternar jogos não
  ajuda. Use um **Iniciar** normal para esse jogo, ou defina um intervalo longo.
- Os minutos e a origem escolhidos são lembrados na próxima vez que você abrir a janela.

## Adicionar pacote de jogos populares

Na janela **Adicionar jogo**, clique em **Adicionar pacote de jogos populares**. O launcher compara uma
lista interna de cerca de 105 títulos populares (incluindo Grand Theft Auto IV) com a lista do Discord e
adiciona os que o Discord reconhece com nome de executável. Jogos que já estão na biblioteca são ignorados
e o log informa quantos foram adicionados.

## Adicionar TODOS os jogos reconhecidos

Na janela **Adicionar jogo**, clique em **Adicionar TODOS os jogos reconhecidos** para colocar na sua
biblioteca todos os jogos que o Discord reconhece (milhares, o mesmo conjunto que o modo aleatório usa em
"Todo o banco de dados do Discord"). Os jogos que já estão na biblioteca são mantidos como estão
(favoritos inclusos) e um backup é salvo ao lado como `myGames.json.bak`. A barra lateral mostra os
primeiros 500 jogos que combinam; digite na caixa **Filtrar biblioteca** para achar qualquer outro.

## Ícones dos jogos

Os jogos mostram o ícone do Discord na barra lateral, no cabeçalho de detalhes e na janela de adicionar
jogo. Os ícones são carregados da CDN do Discord só para os jogos que estão na tela e ficam apenas na
memória, nada é salvo no disco. Se um jogo não tem ícone (ou você está offline), aparece a primeira letra.

## Janela do jogo falso

Os jogos falsos abrem a janelinha deles, que é o que o Discord precisa para reconhecê-los. Escolher um jogo só o seleciona; nada abre. Para parar um jogo use o botão **Parar** ou o modo
aleatório. Jogos falsos criados por uma versão antiga são atualizados na próxima vez que você iniciá-los.
Se quiser a janelinha "fake process" de volta, defina a variável de ambiente `FAKEGAME_SHOW_WINDOW=1` antes
de abrir o app. Os atalhos da área de trabalho continuam abrindo a janela visível.

Por padrão a janela falsa abre normalmente, porque é o modo que o Discord reconhece como "jogando". Desligar
**Mostrar janela do jogo falso** (rodapé da barra lateral) inicia a janela minimizada, mas o Discord pode não
detectar o jogo (vale para o próximo jogo que você iniciar).

## Compilar

Você precisa do .NET SDK (8.0+) e do Node.js 20+ (para a interface Electron).

### Compilando o Core

```bash
dotnet build ./src/Launcher/Launcher.csproj -c Release
dotnet build ./src/DummyGame/DummyGame.csproj -c Release
```

### Compilando a interface Electron

1. **Publique o modelo DummyGame** na pasta de recursos do Electron:
   ```bash
   dotnet publish ./src/DummyGame/DummyGame.csproj -c Release -o ./electron/build-resources/dummygame
   ```

2. **Compile a interface Electron**:
   ```bash
   cd electron
   npm install
   npm test
   npm run dist
   ```

O instalador será criado em `electron/dist/`.

O workflow **.NET Build** (`.github/workflows/dotnet.yml`) faz tudo isso a cada push e envia o instalador
como artefato.

## Lançar uma nova versão

1. No GitHub abra **Actions** > **Release (Electron Installer)** > **Run workflow**.
2. Digite a nova versão (`X.Y.Z`, por exemplo `0.2.0`) e execute.

O workflow roda os testes, compila o instalador, cria a tag `release_X.Y.Z` e a Release no GitHub, e envia
`Setup.exe` + `latest.yml`. Os apps instalados encontram essa release e oferecem a atualização (veja
[Atualizações](#atualizações)). Cada execução precisa de uma versão que ainda não exista e que seja
**maior** que a instalada pelos usuários; se a compilação falhar, a release vazia e a tag são removidas
para você poder rodar a mesma versão de novo. Enviar uma tag chamada `release_X.Y.Z` também funciona.

## Créditos

Desenvolvido por **saralapia**.
