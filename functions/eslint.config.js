const eslint = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["node_modules/**"],
  },
  eslint.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      indent: ["error", 2, {SwitchCase: 1}],
      "max-len": ["error", {code: 100, ignoreComments: true}],
      quotes: ["error", "double", {allowTemplateLiterals: true}],
      semi: ["error", "always"],
    },
  },
];
