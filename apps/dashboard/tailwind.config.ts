import desktopPlugin from "@connorco/desktop-client/desktop-variants";
import baseConfig from "@connorco/ui/tailwind.config";
import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/invoice/src/**/*.{ts,tsx}",
  ],
  presets: [baseConfig],
  plugins: [desktopPlugin],
} satisfies Config;
