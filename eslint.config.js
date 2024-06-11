import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  name => `${name}`,
);

// TODO: Prettier?
const noArrayLengthMinusOne = createRule({
  name: 'no-array-length-minus-one',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Suggest using array.at(-1) instead of array[array.length - 1]',
      recommended: 'warn',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useAtMethod: 'Use array.at(-1) instead of array[array.length - 1]',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.computed &&
          node.property.type === 'BinaryExpression' &&
          node.property.operator === '-' &&
          node.property.left.type === 'MemberExpression' &&
          node.property.left.object.type === 'Identifier' &&
          node.property.left.property.type === 'Identifier' &&
          node.property.left.property.name === 'length' &&
          node.property.left.object.name === node.object.name &&
          node.property.right.type === 'Literal' &&
          node.property.right.value === 1
        ) {
          context.report({
            node,
            messageId: 'useAtMethod',
            fix(fixer) {
              return fixer.replaceText(node, `${node.object.name}.at(-1)`);
            },
          });
        }
      },
    };
  },
});

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
      }
    },
    plugins: {
      custom: {
        rules: {
          noArrayLengthMinusOne,
        }
      }
    },
    rules: {
      'custom/noArrayLengthMinusOne': 'error',
      // Conflicts with prettier.
      'no-unexpected-multiline': 'off',
      'no-constant-binary-expression': 'error',
      'no-constant-condition': [
        'error',
        {
          checkLoops: false,
        }
      ],
      'no-inner-declarations': 'off',
      // Will still be checked before calls/assignment.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Used in lit event bindings.
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    } 
  }
);



