/**
 * Conventional Commits policy. Scopes map to workspaces and cross-cutting areas
 * so `git log --grep` can filter thesis-relevant history per component.
 * @type {import('@commitlint/types').UserConfig}
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'api',
        'web',
        'ml',
        'contracts',
        'tokens',
        'eslint',
        'tsconfig',
        'infra',
        'ci',
        'docs',
        'adr',
        'deps',
        'repo',
      ],
    ],
    'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'body-max-line-length': [1, 'always', 120],
  },
};
