/** @type {import('next').NextConfig} */
// NOVA_BASE_PATH — префикс для GitHub Pages (/Nova-mesenger). Десктоп и
// мобильный клиенты собираются без него и раздают сборку с корня.
const base = (process.env.NOVA_BASE_PATH || "").trim();

const nextConfig = {
  output: "export",
  trailingSlash: true,
  ...(base ? { basePath: base, assetPrefix: base } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
