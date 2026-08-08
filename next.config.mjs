/** @type {import('next').NextConfig} */

// STATIC=1 builds a fully static site for GitHub Pages. See README "Hosting".
const isStatic = process.env.STATIC === '1';
const base = process.env.BASE_PATH || ''; // '/repo-name' for a project Pages site

export default {
  // Routes ending .server.tsx exist only in the server build. Runtime-only features
  // (generated OG images) live behind that extension so the static export stays valid.
  pageExtensions: isStatic ? ['tsx', 'ts'] : ['server.tsx', 'tsx', 'ts'],

  ...(isStatic
    ? {
        output: 'export',
        images: { unoptimized: true },
        basePath: base,
        assetPrefix: base || undefined,
        trailingSlash: true
      }
    : {}),

  webpack: (config, { isServer }) => {
    // kokoro-js pulls onnxruntime-web; it's browser-only and ships its own wasm.
    if (!isServer) config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false };
    return config;
  },

  // Not applied on a static export — Pages can't set headers. Kokoro still runs there
  // via WebGPU; only multi-threaded WASM needs cross-origin isolation.
  ...(isStatic
    ? {}
    : {
        async headers() {
          return [
            {
              source: '/read/:path*',
              headers: [
                { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
                { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }
              ]
            }
          ];
        }
      })
};
