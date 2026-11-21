/* Translations for the app UI: Portuguese (Brazil), English and Spanish.
 *
 * Usage in HTML:   data-i18n="key"  data-i18n-placeholder="key"  data-i18n-title="key"
 * Usage in JS:     t('key', { n: 3 })   ->   placeholders look like {n}
 *
 * This file works in the browser (global `I18N`) and in Node (module.exports) so the unit tests
 * can check that every language has exactly the same keys.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.I18N = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const LANGUAGES = [
    { code: 'pt-BR', label: 'Português (BR)', short: 'PT-BR' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'es', label: 'Español', short: 'ES' }
  ];

  const DEFAULT_LANGUAGE = 'en';

  const STRINGS = {
    en: {
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.adding': 'Adding…',
      'common.language': 'Language',

      'sidebar.filter': 'Filter library...',
      'sidebar.addGame': 'Add Game',
      'sidebar.random': 'Random Mode',
      'sidebar.randomOn': 'Random Mode · ON',
      'sidebar.listNote': 'Showing {shown} of {matched} games. Type in the filter above to find a specific one.',
      'sidebar.running': 'Running',
      'sidebar.stopped': 'Stopped',

      'hero.empty': 'Select a game to view details.',
      'status.ready': 'Ready',
      'status.playing': 'Playing Now',
      'btn.launch': 'Launch Game',
      'btn.stop': 'Stop Playing',

      'details.title': 'Details',
      'details.appId': 'App ID',
      'details.executable': 'Executable',
      'details.favorite': 'Favorite',
      'details.running': 'Running',

      'console.ready': 'Ready.',

      'ctx.shortcut': 'Create shortcut',
      'ctx.delete': 'Delete from library',

      'modal.database': 'Database',
      'modal.search': 'Search for games...',
      'modal.addPopular': 'Add popular games pack',
      'modal.addAll': 'Add ALL recognized games',
      'modal.add': '+ ADD',
      'modal.noResults': 'No results.',
      'modal.dbNotReady': 'Database not ready. Try again. ({error})',

      'random.title': 'Random Game Mode',
      'random.help': 'Every N minutes the current fake game is stopped and another random one is started. Only games Discord recognizes (explicit executable in its detectable list) are used.',
      'random.minutes': 'Switch game every (minutes)',
      'random.source': 'Pick games from',
      'random.library': 'My library',
      'random.database': 'Entire Discord database',
      'random.pool': 'Pool: {n} recognized game(s)',
      'random.state': 'State',
      'random.nowPlaying': 'Now playing',
      'random.nextSwitch': 'Next switch in',
      'random.switches': 'Switches',
      'random.lastIssue': 'Last issue',
      'random.start': 'Start random mode',
      'random.stop': 'Stop random mode',
      'random.starting': 'Starting…',
      'random.running': 'Running',
      'random.stopped': 'Stopped',
      'random.switching': 'switching…',

      'update.title': 'Update Available',
      'update.newVersion': 'New version',
      'update.remind': 'Remind me later',
      'update.install': 'Update now',
      'update.downloadingBtn': 'Downloading…',
      'update.downloading': 'Downloading update…',
      'update.complete': 'Download complete. Installing…',
      'update.installing': 'Installing…',
      'update.noNotes': 'No release notes provided.',
      'update.badge': 'Update available: v{version}',
      'update.check': 'Check for updates',
      'update.checking': 'Checking…',
      'update.upToDate': 'You are using the latest version.',
      'update.devOnly': 'Updates only work in the installed version of the app.',
      'update.failed': 'Update failed: {error}',
      'update.error': 'Update error: {error}',
      'update.availableLog': 'Update available: v{version}.',
      'update.downloadedLog': 'Update downloaded. Installing…',

      'warn.title': 'Detection System Warning',
      'warn.headline': "This program uses Discord's new detection mechanism.",
      'warn.text1': 'Discord did not provide an explicit executable filename for this program in their database.',
      'warn.text2': 'The launcher will use a fallback executable, but it may not work properly for tracking quests.',
      'warn.cancel': 'Cancel',
      'warn.confirm': 'Add Anyway',

      'credits.developedBy': 'Developed by',
      'credits.version': 'Version {version}',

      'log.syncOffline': 'Could not reach Discord; using the local game list.',
      'log.synced': 'Updated gamelist.json from Discord API.',
      'log.upToDate': 'gamelist.json already up-to-date.',
      'log.syncFailed': 'Could not sync gamelist.json: {error}',
      'log.shortcutCreating': 'Creating shortcut for {name}...',
      'log.shortcutFailed': 'Shortcut failed: {error}',
      'log.shortcutCreated': 'Shortcut created: {path}',
      'log.stopBeforeDelete': 'Stop the running game before deleting it.',
      'log.deleted': 'Deleted {name} from library.',
      'log.cancelledAdd': 'Cancelled adding {name}.',
      'log.installed': 'Installed {name} successfully.',
      'log.started': 'Process started: {exe}',
      'log.launchFailed': 'Failed to launch: {error}',
      'log.terminated': 'Process terminated.',
      'log.exited': 'Process exited.',
      'log.popularNone': "No popular games matched Discord's list. Try restarting to sync the game list.",
      'log.popularAdded': 'Popular pack: added {added} game(s) ({skipped} already in your library).',
      'log.popularFailed': 'Could not add popular games: {error}',
      'log.allConfirm': 'Add every game Discord recognizes (thousands) to your library?\n\nYour current library is kept (a backup is saved as myGames.json.bak). The sidebar shows the first 500 games; use the filter to find the rest.',
      'log.allFailed': 'Could not add all games: {error}',
      'log.allAdded': 'All games: added {added} game(s) ({skipped} already in your library).',
      'log.unknownError': 'unknown error',
      'log.randomPlaying': 'Random mode: now playing {name}',
      'log.randomStopped': 'Random mode stopped.',
      'log.randomIssue': 'Random mode: {error}',
      'log.randomMinutes': 'Random mode: enter a number of minutes between 1 and 1440.',
      'log.randomCouldNotStart': 'Random mode: {error}',
      'log.randomError': 'Random mode error: {error}',
      'log.randomCannotStart': 'could not start'
    },

    'pt-BR': {
      'common.yes': 'Sim',
      'common.no': 'Não',
      'common.adding': 'Adicionando…',
      'common.language': 'Idioma',

      'sidebar.filter': 'Filtrar biblioteca...',
      'sidebar.addGame': 'Adicionar jogo',
      'sidebar.random': 'Modo aleatório',
      'sidebar.randomOn': 'Modo aleatório · ATIVO',
      'sidebar.listNote': 'Mostrando {shown} de {matched} jogos. Digite no filtro acima para encontrar um jogo específico.',
      'sidebar.running': 'Em execução',
      'sidebar.stopped': 'Parado',

      'hero.empty': 'Selecione um jogo para ver os detalhes.',
      'status.ready': 'Pronto',
      'status.playing': 'Jogando agora',
      'btn.launch': 'Iniciar jogo',
      'btn.stop': 'Parar de jogar',

      'details.title': 'Detalhes',
      'details.appId': 'ID do app',
      'details.executable': 'Executável',
      'details.favorite': 'Favorito',
      'details.running': 'Em execução',

      'console.ready': 'Pronto.',

      'ctx.shortcut': 'Criar atalho',
      'ctx.delete': 'Remover da biblioteca',

      'modal.database': 'Banco de dados',
      'modal.search': 'Buscar jogos...',
      'modal.addPopular': 'Adicionar pacote de jogos populares',
      'modal.addAll': 'Adicionar TODOS os jogos reconhecidos',
      'modal.add': '+ ADICIONAR',
      'modal.noResults': 'Nenhum resultado.',
      'modal.dbNotReady': 'Banco de dados não está pronto. Tente novamente. ({error})',

      'random.title': 'Modo de jogo aleatório',
      'random.help': 'A cada N minutos o jogo falso atual é encerrado e outro jogo aleatório é iniciado. Só são usados jogos que o Discord reconhece (executável explícito na lista de detecção).',
      'random.minutes': 'Trocar de jogo a cada (minutos)',
      'random.source': 'Escolher jogos de',
      'random.library': 'Minha biblioteca',
      'random.database': 'Todo o banco de dados do Discord',
      'random.pool': 'Lista: {n} jogo(s) reconhecido(s)',
      'random.state': 'Estado',
      'random.nowPlaying': 'Jogando agora',
      'random.nextSwitch': 'Próxima troca em',
      'random.switches': 'Trocas',
      'random.lastIssue': 'Último problema',
      'random.start': 'Iniciar modo aleatório',
      'random.stop': 'Parar modo aleatório',
      'random.starting': 'Iniciando…',
      'random.running': 'Em execução',
      'random.stopped': 'Parado',
      'random.switching': 'trocando…',

      'update.title': 'Atualização disponível',
      'update.newVersion': 'Nova versão',
      'update.remind': 'Lembrar mais tarde',
      'update.install': 'Atualizar agora',
      'update.downloadingBtn': 'Baixando…',
      'update.downloading': 'Baixando atualização…',
      'update.complete': 'Download concluído. Instalando…',
      'update.installing': 'Instalando…',
      'update.noNotes': 'Nenhuma nota de versão informada.',
      'update.badge': 'Atualização disponível: v{version}',
      'update.check': 'Verificar atualizações',
      'update.checking': 'Verificando…',
      'update.upToDate': 'Você já está usando a versão mais recente.',
      'update.devOnly': 'As atualizações só funcionam na versão instalada do app.',
      'update.failed': 'Falha na atualização: {error}',
      'update.error': 'Erro de atualização: {error}',
      'update.availableLog': 'Atualização disponível: v{version}.',
      'update.downloadedLog': 'Atualização baixada. Instalando…',

      'warn.title': 'Aviso do sistema de detecção',
      'warn.headline': 'Este programa usa o novo mecanismo de detecção do Discord.',
      'warn.text1': 'O Discord não informou o nome de um executável explícito para este programa no banco de dados dele.',
      'warn.text2': 'O launcher vai usar um executável alternativo, mas pode não funcionar corretamente para contar missões.',
      'warn.cancel': 'Cancelar',
      'warn.confirm': 'Adicionar mesmo assim',

      'credits.developedBy': 'Desenvolvido por',
      'credits.version': 'Versão {version}',

      'log.syncOffline': 'Não foi possível acessar o Discord; usando a lista de jogos local.',
      'log.synced': 'gamelist.json atualizado pela API do Discord.',
      'log.upToDate': 'gamelist.json já está atualizado.',
      'log.syncFailed': 'Não foi possível sincronizar o gamelist.json: {error}',
      'log.shortcutCreating': 'Criando atalho para {name}...',
      'log.shortcutFailed': 'Falha ao criar atalho: {error}',
      'log.shortcutCreated': 'Atalho criado: {path}',
      'log.stopBeforeDelete': 'Pare o jogo em execução antes de removê-lo.',
      'log.deleted': '{name} removido da biblioteca.',
      'log.cancelledAdd': 'Adição de {name} cancelada.',
      'log.installed': '{name} instalado com sucesso.',
      'log.started': 'Processo iniciado: {exe}',
      'log.launchFailed': 'Falha ao iniciar: {error}',
      'log.terminated': 'Processo encerrado.',
      'log.exited': 'O processo foi finalizado.',
      'log.popularNone': 'Nenhum jogo popular correspondeu à lista do Discord. Reinicie o app para sincronizar a lista de jogos.',
      'log.popularAdded': 'Pacote popular: {added} jogo(s) adicionado(s) ({skipped} já estavam na sua biblioteca).',
      'log.popularFailed': 'Não foi possível adicionar os jogos populares: {error}',
      'log.allConfirm': 'Adicionar todos os jogos que o Discord reconhece (milhares) à sua biblioteca?\n\nSua biblioteca atual é mantida (um backup é salvo como myGames.json.bak). A barra lateral mostra os primeiros 500 jogos; use o filtro para encontrar os demais.',
      'log.allFailed': 'Não foi possível adicionar todos os jogos: {error}',
      'log.allAdded': 'Todos os jogos: {added} jogo(s) adicionado(s) ({skipped} já estavam na sua biblioteca).',
      'log.unknownError': 'erro desconhecido',
      'log.randomPlaying': 'Modo aleatório: jogando agora {name}',
      'log.randomStopped': 'Modo aleatório parado.',
      'log.randomIssue': 'Modo aleatório: {error}',
      'log.randomMinutes': 'Modo aleatório: informe um número de minutos entre 1 e 1440.',
      'log.randomCouldNotStart': 'Modo aleatório: {error}',
      'log.randomError': 'Erro no modo aleatório: {error}',
      'log.randomCannotStart': 'não foi possível iniciar'
    },

    es: {
      'common.yes': 'Sí',
      'common.no': 'No',
      'common.adding': 'Añadiendo…',
      'common.language': 'Idioma',

      'sidebar.filter': 'Filtrar biblioteca...',
      'sidebar.addGame': 'Añadir juego',
      'sidebar.random': 'Modo aleatorio',
      'sidebar.randomOn': 'Modo aleatorio · ACTIVO',
      'sidebar.listNote': 'Mostrando {shown} de {matched} juegos. Escribe en el filtro de arriba para encontrar uno concreto.',
      'sidebar.running': 'En ejecución',
      'sidebar.stopped': 'Detenido',

      'hero.empty': 'Selecciona un juego para ver los detalles.',
      'status.ready': 'Listo',
      'status.playing': 'Jugando ahora',
      'btn.launch': 'Iniciar juego',
      'btn.stop': 'Dejar de jugar',

      'details.title': 'Detalles',
      'details.appId': 'ID de la app',
      'details.executable': 'Ejecutable',
      'details.favorite': 'Favorito',
      'details.running': 'En ejecución',

      'console.ready': 'Listo.',

      'ctx.shortcut': 'Crear acceso directo',
      'ctx.delete': 'Eliminar de la biblioteca',

      'modal.database': 'Base de datos',
      'modal.search': 'Buscar juegos...',
      'modal.addPopular': 'Añadir paquete de juegos populares',
      'modal.addAll': 'Añadir TODOS los juegos reconocidos',
      'modal.add': '+ AÑADIR',
      'modal.noResults': 'Sin resultados.',
      'modal.dbNotReady': 'La base de datos no está lista. Inténtalo de nuevo. ({error})',

      'random.title': 'Modo de juego aleatorio',
      'random.help': 'Cada N minutos se detiene el juego falso actual y se inicia otro aleatorio. Solo se usan juegos que Discord reconoce (ejecutable explícito en su lista de detección).',
      'random.minutes': 'Cambiar de juego cada (minutos)',
      'random.source': 'Elegir juegos de',
      'random.library': 'Mi biblioteca',
      'random.database': 'Toda la base de datos de Discord',
      'random.pool': 'Lista: {n} juego(s) reconocido(s)',
      'random.state': 'Estado',
      'random.nowPlaying': 'Jugando ahora',
      'random.nextSwitch': 'Próximo cambio en',
      'random.switches': 'Cambios',
      'random.lastIssue': 'Último problema',
      'random.start': 'Iniciar modo aleatorio',
      'random.stop': 'Detener modo aleatorio',
      'random.starting': 'Iniciando…',
      'random.running': 'En ejecución',
      'random.stopped': 'Detenido',
      'random.switching': 'cambiando…',

      'update.title': 'Actualización disponible',
      'update.newVersion': 'Nueva versión',
      'update.remind': 'Recordarme más tarde',
      'update.install': 'Actualizar ahora',
      'update.downloadingBtn': 'Descargando…',
      'update.downloading': 'Descargando actualización…',
      'update.complete': 'Descarga completada. Instalando…',
      'update.installing': 'Instalando…',
      'update.noNotes': 'No se proporcionaron notas de la versión.',
      'update.badge': 'Actualización disponible: v{version}',
      'update.check': 'Buscar actualizaciones',
      'update.checking': 'Comprobando…',
      'update.upToDate': 'Ya estás usando la última versión.',
      'update.devOnly': 'Las actualizaciones solo funcionan en la versión instalada de la app.',
      'update.failed': 'Error al actualizar: {error}',
      'update.error': 'Error de actualización: {error}',
      'update.availableLog': 'Actualización disponible: v{version}.',
      'update.downloadedLog': 'Actualización descargada. Instalando…',

      'warn.title': 'Aviso del sistema de detección',
      'warn.headline': 'Este programa usa el nuevo mecanismo de detección de Discord.',
      'warn.text1': 'Discord no proporcionó un nombre de ejecutable explícito para este programa en su base de datos.',
      'warn.text2': 'El launcher usará un ejecutable alternativo, pero puede que no funcione bien para las misiones.',
      'warn.cancel': 'Cancelar',
      'warn.confirm': 'Añadir de todos modos',

      'credits.developedBy': 'Desarrollado por',
      'credits.version': 'Versión {version}',

      'log.syncOffline': 'No se pudo conectar con Discord; se usa la lista de juegos local.',
      'log.synced': 'gamelist.json actualizado desde la API de Discord.',
      'log.upToDate': 'gamelist.json ya está actualizado.',
      'log.syncFailed': 'No se pudo sincronizar gamelist.json: {error}',
      'log.shortcutCreating': 'Creando acceso directo para {name}...',
      'log.shortcutFailed': 'Error al crear el acceso directo: {error}',
      'log.shortcutCreated': 'Acceso directo creado: {path}',
      'log.stopBeforeDelete': 'Detén el juego en ejecución antes de eliminarlo.',
      'log.deleted': '{name} eliminado de la biblioteca.',
      'log.cancelledAdd': 'Se canceló la adición de {name}.',
      'log.installed': '{name} instalado correctamente.',
      'log.started': 'Proceso iniciado: {exe}',
      'log.launchFailed': 'Error al iniciar: {error}',
      'log.terminated': 'Proceso terminado.',
      'log.exited': 'El proceso finalizó.',
      'log.popularNone': 'Ningún juego popular coincidió con la lista de Discord. Reinicia la app para sincronizar la lista de juegos.',
      'log.popularAdded': 'Paquete popular: {added} juego(s) añadido(s) ({skipped} ya estaban en tu biblioteca).',
      'log.popularFailed': 'No se pudieron añadir los juegos populares: {error}',
      'log.allConfirm': '¿Añadir a tu biblioteca todos los juegos que Discord reconoce (miles)?\n\nTu biblioteca actual se conserva (se guarda una copia como myGames.json.bak). La barra lateral muestra los primeros 500 juegos; usa el filtro para encontrar el resto.',
      'log.allFailed': 'No se pudieron añadir todos los juegos: {error}',
      'log.allAdded': 'Todos los juegos: {added} juego(s) añadido(s) ({skipped} ya estaban en tu biblioteca).',
      'log.unknownError': 'error desconocido',
      'log.randomPlaying': 'Modo aleatorio: jugando ahora {name}',
      'log.randomStopped': 'Modo aleatorio detenido.',
      'log.randomIssue': 'Modo aleatorio: {error}',
      'log.randomMinutes': 'Modo aleatorio: introduce un número de minutos entre 1 y 1440.',
      'log.randomCouldNotStart': 'Modo aleatorio: {error}',
      'log.randomError': 'Error del modo aleatorio: {error}',
      'log.randomCannotStart': 'no se pudo iniciar'
    }
  };

  function normalizeLanguage(value) {
    const v = String(value || '').trim().toLowerCase();
    if (!v) return DEFAULT_LANGUAGE;
    if (v.startsWith('pt')) return 'pt-BR';
    if (v.startsWith('es')) return 'es';
    if (v.startsWith('en')) return 'en';
    return DEFAULT_LANGUAGE;
  }

  function format(template, params) {
    return String(template).replace(/\{(\w+)\}/g, (match, name) =>
      params && Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  }

  function translate(language, key, params) {
    const lang = STRINGS[language] ? language : DEFAULT_LANGUAGE;
    const template = STRINGS[lang][key] ?? STRINGS[DEFAULT_LANGUAGE][key] ?? key;
    return format(template, params);
  }

  return { LANGUAGES, DEFAULT_LANGUAGE, STRINGS, normalizeLanguage, translate };
});
