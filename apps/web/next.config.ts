import type { NextConfig } from "next";
import path from "path";

// output: 'standalone' + outputFileTracingRoot give the minimal-boot CI job (and Docker,
// from M8) a deterministic, self-contained server bundle regardless of where the pnpm
// workspace lives on disk.
const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@factory/config"],
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
