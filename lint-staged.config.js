/**
 * lint-staged runs ESLint and Prettier on staged files only. Commands are
 * built in chunks because Windows rejects command lines longer than ~8 KB,
 * which a large commit of TypeScript files easily exceeds.
 * @type {import('lint-staged').Configuration}
 */
const CHUNK_SIZE = 25;

/**
 * @param {readonly string[]} files
 * @param {string} command
 * @returns {string[]}
 */
function chunked(files, command) {
  const commands = [];
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const quoted = files.slice(i, i + CHUNK_SIZE).map((file) => `"${file}"`);
    commands.push(`${command} ${quoted.join(' ')}`);
  }
  return commands;
}

export default {
  '*.{ts,tsx,mts,cts,js,mjs,cjs}': (files) => [
    ...chunked(files, 'eslint --fix --max-warnings=0 --no-warn-ignored'),
    ...chunked(files, 'prettier --write'),
  ],
  '*.{json,md,yml,yaml}': (files) => chunked(files, 'prettier --write'),
};
