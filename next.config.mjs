/** @type {import('next').NextConfig} */
const nextConfig = {
  // 基础安全响应头：防点击劫持、禁 Referrer 泄露、禁 MIME 嗅探（单机工具不引入严格 CSP，避免破坏开发热更新）
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
