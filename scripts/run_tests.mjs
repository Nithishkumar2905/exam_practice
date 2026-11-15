import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const testDir = path.resolve(process.cwd(), 'src/tests');
const files = fs.readdirSync(testDir)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => path.join('src/tests', f));

const result = spawnSync(process.execPath, [
  '--import', 'tsx',
  '--test',
  ...files
], { stdio: 'inherit' });

process.exit(result.status ?? 0);
