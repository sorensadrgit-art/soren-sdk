#!/usr/bin/env node

import { runCli } from "./run.js";

process.exitCode = runCli({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  io: {
    stdout(message) {
      process.stdout.write(message);
    },
    stderr(message) {
      process.stderr.write(message);
    }
  }
});
