#!/usr/bin/env node
/**
 * Check that `dist/` is complete before packing.
 *
 * A clean TypeScript compile says nothing about the asset pipeline: an icon or a
 * translation that never makes it to dist leaves n8n with a broken node and no
 * error to go on. This cross-checks what the sources declare (the `n8n` block of
 * package.json, every `icon: 'file:x.svg'`, every translation file) against what
 * is actually in dist.
 *
 * Runs as the last step of `npm run build` and fails it when something is missing.
 */

import { readdirSync, existsSync, readFileSync, statSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const walk = (dir) =>
	existsSync(dir)
		? readdirSync(dir).flatMap((entry) => {
				const full = join(dir, entry);
				return statSync(full).isDirectory() ? walk(full) : [full];
			})
		: [];

// package.json lists the files n8n loads: every one of them has to exist in dist.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const declared of [...(pkg.n8n?.nodes ?? []), ...(pkg.n8n?.credentials ?? [])]) {
	if (!existsSync(join(root, declared))) problems.push(`declared in package.json but missing: ${declared}`);
}

// Every `icon: 'file:x.svg'` in the sources needs its file next to it in dist.
for (const file of walk(join(root, 'nodes')).concat(walk(join(root, 'credentials')))) {
	if (!file.endsWith('.ts')) continue;
	const match = readFileSync(file, 'utf8').match(/icon:\s*'file:([^']+)'/);
	if (!match) continue;
	const iconInDist = join(root, 'dist', file.slice(root.length + 1).replace(/\/[^/]+$/, ''), match[1]);
	if (!existsSync(iconInDist)) {
		problems.push(`icon declared in ${file.slice(root.length + 1)} is missing from dist: ${match[1]}`);
	}
}

// Translations present in the sources have to reach dist too, otherwise n8n
// falls back to the base language without saying anything.
for (const file of walk(join(root, 'nodes'))) {
	if (!file.includes('/translations/') || !file.endsWith('.json')) continue;
	const inDist = join(root, 'dist', file.slice(root.length + 1));
	if (!existsSync(inDist)) problems.push(`translation missing from dist: ${file.slice(root.length + 1)}`);
}

if (problems.length) {
	console.error('Build output is incomplete:');
	for (const problem of problems) console.error(`   - ${problem}`);
	process.exit(1);
}
console.log('Build output OK: declared nodes, credentials, icons and translations are present');
