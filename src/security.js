const SAFE_ENV_KEYS = new Set([
  'PATH', 'Path',
  'HOME', 'USERPROFILE',
  'APPDATA', 'LOCALAPPDATA',
  'TEMP', 'TMP', 'TMPDIR',
  'SystemRoot', 'SYSTEMROOT',
  'COMSPEC', 'PATHEXT',
  'LANG', 'LC_ALL', 'TERM',
  'CI'
]);

const SECRET_KEY_PATTERN = /(TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|AUTH|CREDENTIAL|PRIVATE[_-]?KEY)/i;

export function safeChildEnv(explicit = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (SAFE_ENV_KEYS.has(key) && value !== undefined) env[key] = value;
  }
  for (const [key, value] of Object.entries(explicit)) {
    if (value !== undefined && value !== null) env[key] = String(value);
  }
  return env;
}

export function redactText(input) {
  if (typeof input !== 'string' || !input) return input ?? '';
  let text = input;

  for (const [key, value] of Object.entries(process.env)) {
    if (!SECRET_KEY_PATTERN.test(key)) continue;
    if (typeof value !== 'string' || value.length < 6) continue;
    text = text.split(value).join('[REDACTED:' + key + ']');
  }

  return text
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED:API_KEY]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED:GITHUB_TOKEN]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED:GITHUB_TOKEN]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED:AWS_ACCESS_KEY]');
}

export function redactObject(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactObject);
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = redactObject(item);
    return output;
  }
  return value;
}
