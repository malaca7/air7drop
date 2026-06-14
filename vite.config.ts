// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Enable nitro for production builds, targeting static output for GitHub Pages
  nitro: {
    preset: "static",
    prerender: {
      routes: ["/"],
      ignore: ["/admin", "/dashboard", "/history", "/r/", "/send"],
      failOnError: false,
    },
  },
  vite: {
    plugins: [
      {
        name: "fix-nitro-vite-8",
        enforce: "post" as const,
        configResolved(config) {
          console.log("=== configResolved ===");
          console.log("environments keys:", Object.keys(config.environments || {}));
          if (config.environments?.nitro) {
            const build = config.environments.nitro.build;
            console.log("nitro build keys:", Object.keys(build || {}));
            console.log("nitro build.rolldownOptions:", build.rolldownOptions);
            console.log("nitro build.rollupOptions:", build.rollupOptions);
            if (build.rolldownOptions?.input && !build.rollupOptions?.input) {
              build.rollupOptions = {
                ...build.rollupOptions,
                input: build.rolldownOptions.input,
              };
              console.log("Patched nitro build.rollupOptions:", build.rollupOptions);
            }
          }
        },
      },
    ],
  },
});
