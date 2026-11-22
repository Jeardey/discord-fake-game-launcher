# Discord Fake Game Launcher

**🌐 Idiomas:** [English](README.md) · [Português (BR)](README.pt-BR.md) · **Español**

Crea pequeños ejecutables falsos que imitan procesos de juegos reales, para que Discord detecte un **juego
verificado / registrado** como en ejecución. Se puede usar para completar Misiones (Quests) de Discord sin
instalar el juego.

La app está disponible en **portugués (Brasil), inglés y español**. Usa el idioma de tu sistema la primera
vez y puedes cambiarlo en cualquier momento con el selector de idioma de la barra de título.

> [!IMPORTANT]
> Esta herramienta está pensada para fines educativos y uso personal. Respeta los términos de servicio de
> Discord, a los socios, los derechos de las editoras de juegos y de los anunciantes al usar esta
> aplicación. Discord es una marca registrada de Discord Inc. Se menciona en este proyecto de código
> abierto solo con fines descriptivos y no implica ninguna afiliación, patrocinio o respaldo de Discord Inc.

**Desarrollador:** saralapia

## Contenido

- [Cómo funciona](#cómo-funciona)
- [Características](#características)
- [Actualizaciones](#actualizaciones)
- [Modo aleatorio](#modo-aleatorio)
- [Añadir paquete de juegos populares](#añadir-paquete-de-juegos-populares)
- [Añadir TODOS los juegos reconocidos](#añadir-todos-los-juegos-reconocidos)
- [Iconos de los juegos](#iconos-de-los-juegos)
- [Ventana del juego falso](#ventana-del-juego-falso)
- [Compilar](#compilar)
- [Publicar una nueva versión](#publicar-una-nueva-versión)
- [Créditos](#créditos)

## Cómo funciona

1. La app lee la lista de juegos detectables de Discord (`gamelist.json`, actualizada desde la API pública
   de Discord cada vez que la app inicia; si no se puede conectar con Discord, usa la última lista
   guardada).
2. Buscas un juego y lo añades a tu biblioteca.
3. Al hacer clic en **Iniciar juego**, la app crea un exe falso con el nombre del juego real en:

   `%APPDATA%/discord-fake-game-launcher-ui/games/<IDdelJuego>/<NombreDelJuego>.exe`

4. Discord ve ese proceso y muestra que estás jugando.

El mismo ejecutable falso actúa como **launcher** cuando se abre desde el acceso directo o desde la carpeta
raíz, y como **juego falso** cuando se ejecuta desde una subcarpeta dentro de `games/`.

## Características

- Busca en la lista completa de juegos detectables de Discord y añádelos a tu biblioteca.
- Inicia varios juegos falsos a la vez, marca favoritos y crea accesos directos en el escritorio.
- **Añade TODOS los juegos reconocidos** con un clic, o el **paquete de juegos populares**.
- **Modo aleatorio**: alterna entre juegos aleatorios cada X minutos.
- **Iconos** de los juegos desde Discord, en la lista, en la cabecera de detalles y en la ventana de añadir
  juego.
- Los juegos falsos abren una ventanita (necesaria para que Discord los reconozca); se puede iniciar minimizada, pero Discord puede no detectar el juego.
- Interfaz oscura y moderna en **pt-BR, en y es**.
- **Aviso automático de actualización**: cuando publicas una nueva versión, los usuarios son avisados y
  actualizan con un clic.

## Actualizaciones

La app instalada busca una nueva versión en GitHub al iniciar y de nuevo cada 30 minutos mientras está
abierta.

1. Cuando existe una versión más nueva, se abre la ventana **Actualización disponible** con las notas de la
   versión.
2. El usuario hace clic en **Actualizar ahora**. Se descarga el instalador (con barra de progreso), la app
   se cierra y la nueva versión se instala y se inicia.
3. **Recordarme más tarde** cierra la ventana; un botón **Actualización disponible: vX.Y.Z** permanece en la
   barra de título y la ventana se abre de nuevo la próxima vez que la app inicie.
4. El enlace **Buscar actualizaciones** al pie de la barra lateral comprueba al instante.

Las actualizaciones solo funcionan en la app instalada (no al ejecutar desde el código con `npm run dev`).

## Modo aleatorio

El modo aleatorio mantiene un juego falso en ejecución a la vez y lo cambia por otro aleatorio cada cierto
tiempo.

### Cómo usarlo

1. Haz clic en **Modo aleatorio** en la barra lateral izquierda.
2. Define **Cambiar de juego cada (minutos)** (de 1 a 1440).
3. Elige **Elegir juegos de**:
   - **Mi biblioteca**: solo los juegos que ya añadiste.
   - **Toda la base de datos de Discord**: cualquier juego que Discord reconoce (miles de juegos).
4. Mira la línea **Lista**: muestra cuántos juegos se pueden elegir. Debe ser al menos 1.
5. Haz clic en **Iniciar modo aleatorio**. Un juego empieza de inmediato.
6. Haz clic en **Detener modo aleatorio** (o cierra la app) para terminar. El juego falso actual también se
   cierra.

El botón de la barra lateral muestra **Modo aleatorio · ACTIVO** mientras está en marcha, y la ventana
muestra el juego actual, una cuenta atrás hasta el próximo cambio y cuántos cambios han ocurrido.

### Qué pasa en cada cambio

1. Se detiene el juego falso actual.
2. El launcher espera unos 5 segundos, para que Discord note que el juego terminó.
3. Se inicia un juego aleatorio distinto. Se evitan los últimos juegos usados para no repetir siempre el
   mismo.

### Qué juegos se pueden elegir

Solo se usan juegos que Discord **reconoce por el nombre de su ejecutable**. Estos nunca se eligen:

- juegos que Discord lista sin ejecutable (juegos de "nueva detección", la app muestra un aviso para
  ellos),
- entradas que solo tienen un ejecutable de launcher (modo "Toda la base de datos de Discord"),
- entradas con nombres de archivo no válidos en Windows.

Si un juego falla al iniciar, el launcher prueba otro en silencio. Los juegos elegidos de la base de datos
de Discord que no están en tu biblioteca se borran del disco cuando se detienen, para que la carpeta
`games` no se llene.

### Conviene saber

- Si cierras a mano la ventana de un juego falso, el modo aleatorio elige un juego nuevo en el siguiente
  cambio.
- Los juegos que iniciaste manualmente nunca son tocados ni elegidos por el modo aleatorio mientras
  están en ejecución.
- Si una Misión de Discord exige un tiempo largo y continuo en **un juego concreto**, alternar juegos no
  ayuda. Usa un **Iniciar** normal para ese juego, o define un intervalo largo.
- Los minutos y el origen elegidos se recuerdan la próxima vez que abras la ventana.

## Añadir paquete de juegos populares

En la ventana **Añadir juego**, haz clic en **Añadir paquete de juegos populares**. El launcher compara una
lista interna de unos 105 títulos populares (incluido Grand Theft Auto IV) con la lista de Discord y añade
los que Discord reconoce con nombre de ejecutable. Los juegos que ya están en tu biblioteca se omiten y el
registro indica cuántos se añadieron.

## Añadir TODOS los juegos reconocidos

En la ventana **Añadir juego**, haz clic en **Añadir TODOS los juegos reconocidos** para poner en tu
biblioteca todos los juegos que Discord reconoce (miles, el mismo conjunto que usa el modo aleatorio en
"Toda la base de datos de Discord"). Los juegos que ya están en tu biblioteca se conservan tal cual
(favoritos incluidos) y se guarda una copia al lado como `myGames.json.bak`. La barra lateral muestra los
primeros 500 juegos que coinciden; escribe en el cuadro **Filtrar biblioteca** para encontrar cualquier
otro.

## Iconos de los juegos

Los juegos muestran su icono de Discord en la barra lateral, en la cabecera de detalles y en la ventana de
añadir juego. Los iconos se cargan desde la CDN de Discord solo para los juegos que están en pantalla y se
guardan solo en memoria, nada se guarda en el disco. Si un juego no tiene icono (o estás sin conexión), se
muestra su primera letra.

## Ventana del juego falso

Los juegos falsos abren su ventanita, que es lo que Discord necesita para reconocerlos. Elegir un juego solo lo selecciona; no se abre nada. Para detener un juego usa el botón
**Dejar de jugar** o el modo aleatorio. Los juegos falsos creados por una versión anterior se actualizan la
próxima vez que los inicies. Si quieres recuperar la pequeña ventana "fake process", define la variable de
entorno `FAKEGAME_SHOW_WINDOW=1` antes de abrir la app. Los accesos directos del escritorio siguen abriendo
la ventana visible.

Por defecto la ventana falsa se abre normalmente, porque es el modo que Discord reconoce como "jugando". Si
desactivas **Mostrar ventana del juego falso** (al pie de la barra lateral), inicia minimizada, pero Discord puede
no detectar el juego (se aplica al próximo juego que inicies).

## Compilar

Necesitas el SDK de .NET (8.0+) y Node.js 20+ (para la interfaz Electron).

### Compilar el Core

```bash
dotnet build ./src/Launcher/Launcher.csproj -c Release
dotnet build ./src/DummyGame/DummyGame.csproj -c Release
```

### Compilar la interfaz Electron

1. **Publica la plantilla DummyGame** en la carpeta de recursos de Electron:
   ```bash
   dotnet publish ./src/DummyGame/DummyGame.csproj -c Release -o ./electron/build-resources/dummygame
   ```

2. **Compila la interfaz Electron**:
   ```bash
   cd electron
   npm install
   npm test
   npm run dist
   ```

El instalador se creará en `electron/dist/`.

El workflow **.NET Build** (`.github/workflows/dotnet.yml`) hace todo esto en cada push y sube el
instalador como artefacto.

## Publicar una nueva versión

1. En GitHub abre **Actions** > **Release (Electron Installer)** > **Run workflow**.
2. Escribe la nueva versión (`X.Y.Z`, por ejemplo `0.2.0`) y ejecútalo.

El workflow ejecuta las pruebas, compila el instalador, crea la etiqueta `release_X.Y.Z` y la Release en
GitHub, y sube `Setup.exe` + `latest.yml`. Las apps instaladas encuentran esa release y ofrecen la
actualización (ver [Actualizaciones](#actualizaciones)). Cada ejecución necesita una versión que aún no
exista y que sea **mayor** que la instalada por los usuarios; si la compilación falla, la release vacía y la
etiqueta se eliminan para que puedas ejecutar la misma versión de nuevo. Enviar una etiqueta llamada
`release_X.Y.Z` también funciona.

## Créditos

Desarrollado por **saralapia**.
