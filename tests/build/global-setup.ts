import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function setup(): void {
  execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
}
