import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'dist-server', 're', 'public/assets', 'node_modules', 'scripts/local'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ['eslint.config.js'] }, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-warning-comments': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.name="Math"][property.name="random"]',
          message: 'Inject an Rng instead of calling Math.random.',
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/net/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/adapters/**', '**/services/**', '**/entry/**', '**/ui/**', '**/server/**', '**/config/env*'], message: 'Domain rules must stay pure.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'performance', 'Date', 'console'],
    },
  },
);
