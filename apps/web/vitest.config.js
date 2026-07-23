import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";

// Reuse the app's Vite config (React plugin, aliases) and layer the test env.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.js"],
      css: false,
      include: ["src/**/*.{test,spec}.{js,jsx}"],
    },
  }),
);
