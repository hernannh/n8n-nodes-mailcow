/**
 * Lint config for an n8n community node package.
 *
 * Uses eslint-plugin-n8n-nodes-base to enforce the marketplace conventions
 * (naming, display names, alphabetical options, credential test, ...). The full
 * rule set applies because the base UI strings are English. Keep it that way: the
 * sentence-case autofix of the plugin corrupts UTF-8 accents, so Spanish belongs
 * in translations/*.json, which eslint does not read.
 */
module.exports = {
	root: true,
	env: { browser: true, es6: true, node: true },
	parser: '@typescript-eslint/parser',
	parserOptions: { sourceType: 'module', extraFileExtensions: ['.json'] },
	ignorePatterns: ['.eslintrc.js', '**/*.js', '**/node_modules/**', '**/dist/**'],
	overrides: [
		{
			files: ['package.json'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/community'],
			rules: {
				'n8n-nodes-base/community-package-json-name-still-default': 'off',
			},
		},
		{
			files: ['./credentials/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/credentials'],
			rules: {
				// documentationUrl rules are main-repo-only and mutually contradictory
				// for community packages (require it, then mangle a real URL to camelCase).
				'n8n-nodes-base/cred-class-field-documentation-url-missing': 'off',
				'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
				'n8n-nodes-base/cred-class-field-documentation-url-not-http-url': 'off',
			},
		},
		{
			files: ['./nodes/**/*.ts'],
			plugins: ['eslint-plugin-n8n-nodes-base'],
			extends: ['plugin:n8n-nodes-base/nodes'],
		},
	],
};
