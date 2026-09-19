import test from 'node:test';
import assert from 'node:assert/strict';
import { safeChildEnv, redactText } from '../src/security.js';

test('simulation child environment does not inherit arbitrary secrets', () => {
  const previous = process.env.OHMYPROOF_TEST_API_KEY;
  process.env.OHMYPROOF_TEST_API_KEY = 'super-secret-test-value';

  try {
    const env = safeChildEnv({ EXPLICIT_VALUE: 'ok' });
    assert.equal(env.OHMYPROOF_TEST_API_KEY, undefined);
    assert.equal(env.EXPLICIT_VALUE, 'ok');
    assert.ok(env.PATH || env.Path);
  } finally {
    if (previous === undefined) delete process.env.OHMYPROOF_TEST_API_KEY;
    else process.env.OHMYPROOF_TEST_API_KEY = previous;
  }
});

test('artifact redaction removes secret-bearing environment values', () => {
  const previous = process.env.OHMYPROOF_TEST_TOKEN;
  process.env.OHMYPROOF_TEST_TOKEN = 'token-value-that-must-not-leak';

  try {
    const redacted = redactText('log: token-value-that-must-not-leak');
    assert.doesNotMatch(redacted, /token-value-that-must-not-leak/);
    assert.match(redacted, /REDACTED/);
  } finally {
    if (previous === undefined) delete process.env.OHMYPROOF_TEST_TOKEN;
    else process.env.OHMYPROOF_TEST_TOKEN = previous;
  }
});
