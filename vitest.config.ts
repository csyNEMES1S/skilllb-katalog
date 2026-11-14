import { defineConfig } from "vitest/config";

// Kendi yapılandırması olmazsa vitest üst klasördeki uygulama yapılandırmasını (src/**, jsdom) bulur.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
