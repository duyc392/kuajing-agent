import type { Config } from "tailwindcss";

// Tailwind 配置：扫描 src 下的页面与组件，shadcn/ui 的主题变量在初始化时并入。
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
