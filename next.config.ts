import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native PDF page rendering (decision 45) is imported at runtime and hidden
  // from the bundler (lib/visual/pdf-pages.ts), so ship it with the functions.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@napi-rs/canvas*/**/*"],
  },
};

export default nextConfig;
