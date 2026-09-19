#!/usr/bin/env node
import { main } from '../src/cli.js';

main().catch((error) => {
  console.error('\nOhMyProof failed:\n' + (error?.stack ?? error));
  process.exitCode = 1;
});
