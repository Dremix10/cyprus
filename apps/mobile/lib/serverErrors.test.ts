import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PATTERN_EXAMPLES, SERVER_ERRORS, serverErrorKey } from './serverErrors.ts';

// i18n.ts imports React Native storage, so read its two string tables as text instead.
const source: string = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'i18n.ts'), 'utf8');
const split = source.indexOf('  el: {');
function table(block: string): Map<string, string> {
  const out = new Map<string, string>();
  const line = /^ {4}'([^']+)': (?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"),$/gm;
  for (const m of block.matchAll(line)) {
    const raw = (m[2] ?? m[3]).replace(/\\'/g, "'").replace(/"/g, '\\"');
    out.set(m[1], JSON.parse(`"${raw}"`));
  }
  return out;
}
const en = table(source.slice(0, split));
const el = table(source.slice(split));

describe('server error map', () => {
  it('maps exact server messages and passes unknown ones through', () => {
    assert.deepEqual(serverErrorKey('Invalid credentials'), { key: 'serverError.invalidCredentials' });
    assert.deepEqual(serverErrorKey('Room is full'), { key: 'serverError.roomFull' });
    assert.equal(serverErrorKey('invalid credentials'), null);
    assert.equal(serverErrorKey('Something the server just started saying'), null);
  });

  it('reads the number out of messages that carry one', () => {
    assert.deepEqual(serverErrorKey('Account locked. Try again in 1 minute'), { key: 'serverError.lockedOneMinute' });
    assert.deepEqual(serverErrorKey('Account locked. Try again in 7 minutes'), {
      key: 'serverError.lockedMinutes',
      params: { n: '7' },
    });
    assert.deepEqual(serverErrorKey('You can change your display name again in 12 days'), {
      key: 'serverError.renameDays',
      params: { n: '12' },
    });
  });

  it('has English and Greek text for every key, and English is the server message', () => {
    for (const [message, key] of Object.entries(SERVER_ERRORS)) {
      assert.equal(en.get(key), message, `EN for ${key}`);
      assert.ok(el.get(key), `EL for ${key}`);
      assert.notEqual(el.get(key), message, `EL for ${key} is still English`);
    }
    for (const [key, example] of Object.entries(PATTERN_EXAMPLES)) {
      const hit = serverErrorKey(example);
      assert.equal(hit?.key, key);
      const english = (en.get(key) ?? '').replace('{n}', hit?.params?.n ?? '');
      assert.equal(english, example, `EN for ${key}`);
      assert.ok(el.get(key), `EL for ${key}`);
    }
  });
});
