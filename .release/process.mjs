import { spawn } from 'node:child_process';
import path from 'node:path';

function resolvePortableCommand(command, args) {
  if (process.platform === 'win32' && command === 'npm') {
    const npmCli = process.env.npm_execpath
      ?? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    return {
      command: process.execPath,
      args: [npmCli, ...args],
    };
  }
  return { command, args };
}

/** Runs one executable directly so arguments never pass through a platform shell. */
export function runCommand(command, args = [], options = {}) {
  const { capture = false, cwd = process.cwd(), env = process.env } = options;
  const resolved = resolvePortableCommand(command, args);

  return new Promise((resolve, reject) => {
    const child = spawn(resolved.command, resolved.args, {
      cwd,
      env,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('close', (exitCode, signal) => {
      const result = { exitCode: exitCode ?? 1, signal, stdout, stderr };
      if (exitCode === 0) {
        resolve(result);
        return;
      }
      const error = new Error(`${command} exited with code ${result.exitCode}`);
      Object.assign(error, result);
      reject(error);
    });
  });
}
