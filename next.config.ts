import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The local embedding model (transformers.js + onnxruntime-node, ~300 MB) runs only on a developer machine. Free
  // serverless hosting caps a function at 250 MB and has a read-only disk, so hosted builds leave it out and use the
  // same model on Cloudflare (EMBEDDING_PROVIDERS=cloudflare); see docs/DEPLOY.md.
  outputFileTracingExcludes: {
    "*": ["node_modules/onnxruntime-node/**", "node_modules/onnxruntime-web/**", "node_modules/@huggingface/**"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
