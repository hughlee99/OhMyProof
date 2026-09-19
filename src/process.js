import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { safeChildEnv } from './security.js';

const ALLOWED = new Set([
  'node', 'npm', 'npx', 'pnpm', 'yarn',
  'python', 'python3', 'pytest',
  'git', 'go', 'cargo', 'deno', 'bun'
]);

export async function runProcess(argv, options = {}) {
  if (!Array.isArray(argv) || argv.length === 0) throw new Error('argv must be a non-empty array');
  const executable = argv[0];
  if (!ALLOWED.has(executable)) throw new Error('Executable is not allowed by the OhMyProof runner: ' + executable);

  const cwd = options.cwd ?? process.cwd();
  const timeoutMs = options.timeoutMs ?? 120000;
  const started = performance.now();
  const child = spawn(executable, argv.slice(1), {
    cwd,
    env: safeChildEnv(options.env ?? {}),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
  }, timeoutMs);

  return await new Promise((resolve) => {
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ argv, cwd, exitCode: null, timedOut, durationMs: performance.now() - started, stdout, stderr, error: error.message });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ argv, cwd, exitCode, signal, timedOut, durationMs: performance.now() - started, stdout, stderr, error: null });
    });
  });
}

export async function commandExists(command) {
  if (!ALLOWED.has(command) && command !== 'codex' && command !== 'claude') return false;
  const started = performance.now();
  const child = spawn(command, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(false); }, 5000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}
