import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees under .claude hold whole copies of the repo; their tests are not ours to run.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
