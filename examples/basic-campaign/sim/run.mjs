const method = process.env.METHOD ?? process.env.OHMYPROOF_CANDIDATE ?? 'no_cache';
const reads = Number(process.env.READS ?? 120);
const writes = Number(process.env.WRITES ?? 0);
const keyCount = Number(process.env.KEYS ?? 8);

const versions = Array(keyCount).fill(1);
const cache = new Map();

let backendCalls = 0;
let freshReads = 0;
let writesDone = 0;
const failures = [];

const writeEvery = writes > 0 ? Math.max(1, Math.floor(reads / (writes + 1))) : Infinity;

function load(key) {
  backendCalls++;
  return { key, version: versions[key] };
}

function read(key) {
  if (method === 'no_cache') return load(key);

  if (!cache.has(key)) cache.set(key, load(key));
  return cache.get(key);
}

function write(key) {
  versions[key]++;
  if (method === 'cache_invalidate') cache.delete(key);
}

for (let i = 0; i < reads; i++) {
  if (writesDone < writes && i > 0 && i % writeEvery === 0) {
    const key = writesDone % Math.min(3, keyCount);
    write(key);
    writesDone++;
  }

  const key = i % Math.min(4, keyCount);
  const value = read(key);
  const fresh = value.version === versions[key];

  if (fresh) {
    freshReads++;
  } else {
    failures.push({
      type: 'stale_read',
      case: 'key=' + key,
      expectedVersion: versions[key],
      actualVersion: value.version
    });
  }
}

const freshReadRate = freshReads / reads;

console.log('OHMYPROOF_METRIC fresh_read_rate=' + freshReadRate);
console.log('OHMYPROOF_METRIC backend_calls=' + backendCalls);
console.log('OHMYPROOF_METRIC cache_entries=' + cache.size);

for (const failure of failures) {
  console.log('OHMYPROOF_FAILURE ' + JSON.stringify(failure));
}
