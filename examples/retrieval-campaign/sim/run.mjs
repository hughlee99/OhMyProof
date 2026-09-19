import { performance } from 'node:perf_hooks';

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function trigrams(text) {
  const clean = '  ' + text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, ' ') + '  ';
  const set = new Set();
  for (let i = 0; i < clean.length - 2; i++) set.add(clean.slice(i, i + 3));
  return set;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const value of a) if (b.has(value)) hit++;
  return (2 * hit) / (a.size + b.size);
}

function tokens(text) {
  return new Set(text.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean));
}

function tokenScore(query, document) {
  const q = tokens(query);
  const d = tokens(document);
  if (!q.size) return 0;
  let hit = 0;
  for (const token of q) if (d.has(token)) hit++;
  return hit / q.size;
}

function corrupt(text, random) {
  const chars = [...text];
  const edits = Math.max(2, Math.floor(chars.length * 0.22));
  for (let i = 0; i < edits; i++) {
    const index = Math.floor(random() * chars.length);
    if (random() < 0.5 && chars.length > 4) chars.splice(index, 1);
    else chars[index] = String.fromCharCode(97 + Math.floor(random() * 26));
  }
  return chars.join('');
}

const seed = Number(process.env.SEED ?? 1);
const contextCount = Number(process.env.CONTEXTS ?? 120);
const queryCount = Number(process.env.QUERIES ?? 300);
const method = process.env.METHOD ?? process.env.OHMYPROOF_CANDIDATE ?? 'char_recent';
const topK = Number(process.env.OHMYPROOF_PARAM_TOP_K ?? 10);
const random = rng(seed);
const roots = ['nova', 'meta', 'blue', 'spark', 'alpha', 'prime', 'orbit', 'vertex', 'pixel', 'core', 'next', 'hyper'];
const topics = ['api', 'mou', 'launch', 'review', 'pricing', 'console', 'policy', 'funding'];

const contexts = Array.from({ length: contextCount }, (_, i) => {
  const org = roots[i % roots.length] + roots[Math.floor(i / roots.length) % roots.length] + 'labs';
  const topic = topics[i % topics.length];
  const person = 'manager' + (i % 17);
  const alias = org.slice(0, 2) + topic.slice(0, 2) + (i % 10);
  const text = [org, topic, person, alias, 'project', 'next action', 'decision'].join(' ');
  return { id: i, org, topic, person, alias, text, grams: trigrams(text) };
});

const queries = [];
for (let i = 0; i < queryCount; i++) {
  const target = contexts[Math.floor(random() * contexts.length)];
  const roll = random();
  let type;
  let text;
  let recent = [];
  if (roll < 0.42) {
    type = 'exact';
    text = target.org + ' ' + target.topic;
  } else if (roll < 0.68) {
    type = 'typo';
    text = corrupt(target.org + ' ' + target.topic, random);
  } else if (roll < 0.84) {
    type = 'alias';
    text = target.alias;
  } else {
    type = 'followup';
    text = random() < 0.5 ? 'what was the next action on that thing' : 'what did the manager say about it';
    recent = [target.id];
    while (recent.length < 4) {
      const id = Math.floor(random() * contexts.length);
      if (!recent.includes(id)) recent.push(id);
    }
  }
  queries.push({ type, text, targetId: target.id, recent });
}

const started = performance.now();
let hits = 0;
let returned = 0;
const failures = [];
for (const query of queries) {
  let ranked;
  if (method === 'full') {
    ranked = contexts.map((context) => ({ id: context.id, score: 1 }));
  } else {
    const queryGrams = trigrams(query.text);
    ranked = contexts.map((context) => {
      let score = method === 'token' ? tokenScore(query.text, context.text) : dice(queryGrams, context.grams);
      if (method === 'char_recent') {
        const recentIndex = query.recent.indexOf(context.id);
        if (recentIndex >= 0) score += 1.0 - recentIndex * 0.15;
      }
      return { id: context.id, score };
    }).sort((a, b) => b.score - a.score || a.id - b.id).slice(0, topK);
  }

  returned += ranked.length;
  const hit = ranked.some((item) => item.id === query.targetId);
  if (hit) hits++;
  else failures.push({ type: query.type, case: query.text, targetId: query.targetId });
}
const elapsed = performance.now() - started;
const recall = hits / queries.length;
const avgContexts = returned / queries.length;
const contextTokens = avgContexts * 86;
const latencyMs = elapsed / queries.length;

console.log('OHMYPROOF_METRIC recall=' + recall);
console.log('OHMYPROOF_METRIC context_tokens=' + contextTokens);
console.log('OHMYPROOF_METRIC latency_ms=' + latencyMs);
console.log('OHMYPROOF_METRIC queries=' + queries.length);
console.log('OHMYPROOF_METRIC contexts=' + contexts.length);
for (const failure of failures) console.log('OHMYPROOF_FAILURE ' + JSON.stringify(failure));
