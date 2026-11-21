const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const I18N = require('../src/renderer/i18n.js');

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');
const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
const rendererJs = fs.readFileSync(path.join(rendererDir, 'renderer.js'), 'utf8');

const placeholdersOf = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('the app ships pt-BR, en and es', () => {
  assert.deepEqual(I18N.LANGUAGES.map((l) => l.code).sort(), ['en', 'es', 'pt-BR']);
  for (const { code } of I18N.LANGUAGES) assert.ok(I18N.STRINGS[code], `missing strings for ${code}`);
});

test('every language has exactly the same keys as English', () => {
  const reference = Object.keys(I18N.STRINGS.en).sort();
  for (const code of ['pt-BR', 'es']) {
    assert.deepEqual(Object.keys(I18N.STRINGS[code]).sort(), reference, `${code} keys differ from en`);
  }
});

test('no translation is empty and placeholders match across languages', () => {
  for (const [key, english] of Object.entries(I18N.STRINGS.en)) {
    for (const code of ['en', 'pt-BR', 'es']) {
      const text = I18N.STRINGS[code][key];
      assert.ok(typeof text === 'string' && text.trim().length > 0, `${code}.${key} is empty`);
      assert.deepEqual(placeholdersOf(text), placeholdersOf(english), `${code}.${key} placeholders differ`);
    }
  }
});

test('every data-i18n key used in index.html exists', () => {
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-title)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 20, 'expected the HTML to use translation keys');
  for (const key of keys) assert.ok(key in I18N.STRINGS.en, `index.html uses unknown key "${key}"`);
});

test('every t(...) key used in renderer.js exists', () => {
  const keys = [...rendererJs.matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length > 30, 'expected renderer.js to use translation keys');
  for (const key of keys) assert.ok(key in I18N.STRINGS.en, `renderer.js uses unknown key "${key}"`);
});

test('normalizeLanguage maps system locales to the supported languages', () => {
  assert.equal(I18N.normalizeLanguage('pt-BR'), 'pt-BR');
  assert.equal(I18N.normalizeLanguage('pt-PT'), 'pt-BR');
  assert.equal(I18N.normalizeLanguage('es-MX'), 'es');
  assert.equal(I18N.normalizeLanguage('en-US'), 'en');
  assert.equal(I18N.normalizeLanguage('fr-FR'), 'en');
  assert.equal(I18N.normalizeLanguage(''), 'en');
  assert.equal(I18N.normalizeLanguage(undefined), 'en');
});

test('translate fills placeholders and falls back to English / the key', () => {
  assert.equal(I18N.translate('pt-BR', 'random.pool', { n: 5 }), 'Lista: 5 jogo(s) reconhecido(s)');
  assert.equal(I18N.translate('es', 'update.badge', { version: '1.2.3' }), 'Actualización disponible: v1.2.3');
  assert.equal(I18N.translate('xx', 'common.yes'), 'Yes');
  assert.equal(I18N.translate('en', 'does.not.exist'), 'does.not.exist');
  assert.equal(I18N.translate('en', 'random.pool', {}), 'Pool: {n} recognized game(s)');
});
