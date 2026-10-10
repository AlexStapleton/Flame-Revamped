const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const initDockerSecrets = require('../utils/init/initDockerSecrets');

test('getSecrets reads trimmed files, skips directories, tolerates a missing dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flame-secrets-'));
  try {
    fs.writeFileSync(path.join(dir, 'password'), 's3cret \n');
    fs.mkdirSync(path.join(dir, 'nested'));
    assert.deepStrictEqual(initDockerSecrets.getSecrets(dir), { password: 's3cret' });
    assert.deepStrictEqual(initDockerSecrets.getSecrets(path.join(dir, 'missing')), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('initDockerSecrets copies secrets into upper-cased env vars', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flame-secrets-'));
  const prev = process.env.FLAME_TEST_SECRET;
  try {
    fs.writeFileSync(path.join(dir, 'flame_test_secret'), 'value');
    initDockerSecrets(dir);
    assert.strictEqual(process.env.FLAME_TEST_SECRET, 'value');
  } finally {
    if (prev === undefined) delete process.env.FLAME_TEST_SECRET;
    else process.env.FLAME_TEST_SECRET = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
