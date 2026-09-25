import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      ".local-ai/**",
      "outputs/**",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
      globals: {
        AudioContext: "readonly", Blob: "readonly", crypto: "readonly", document: "readonly",
        File: "readonly", FileReader: "readonly", HTMLAudioElement: "readonly", HTMLDivElement: "readonly",
        HTMLInputElement: "readonly", HTMLTextAreaElement: "readonly", HTMLVideoElement: "readonly",
        Image: "readonly", localStorage: "readonly", MediaDeviceInfo: "readonly", MediaRecorder: "readonly",
        MediaStream: "readonly", MediaStreamConstraints: "readonly", MouseEvent: "readonly",
        navigator: "readonly", Node: "readonly", requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly", setInterval: "readonly", clearInterval: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly", URL: "readonly", window: "readonly",
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
];
