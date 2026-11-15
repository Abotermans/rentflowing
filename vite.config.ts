import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export function contentSecurityPolicy(
  mode: string,
  origin = "https://rentflowing.lovable.app",
  supabaseOrigin?: string,
) {
  const development = mode === "development";
  const deploymentOrigin = new URL(origin).origin;
  if (!development && !supabaseOrigin) {
    throw new Error("Production CSP requires VITE_SUPABASE_URL");
  }
  const backendOrigin = supabaseOrigin ? new URL(supabaseOrigin).origin : "https://*.supabase.co";
  const backendWebsocket = supabaseOrigin
    ? backendOrigin.replace(/^https:/, "wss:")
    : "wss://*.supabase.co";
  const scripts = development
    ? `'self' 'unsafe-inline' ${deploymentOrigin}/assets/ ${deploymentOrigin}/security/ http://localhost:* http://127.0.0.1:*`
    : `${deploymentOrigin}/assets/ ${deploymentOrigin}/security/`;
  const localConnections = development ? " ws://localhost:* ws://127.0.0.1:*" : "";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src ${scripts}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${backendOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self'${localConnections} ${backendOrigin} ${backendWebsocket}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob: data:",
    "upgrade-insecure-requests",
  ].join("; ");
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    {
      name: "csp-meta",
      transformIndexHtml() {
        const origin = process.env.PUBLIC_APP_ORIGIN ?? "https://rentflowing.lovable.app";
        const backendOrigin = loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL;
        return [{
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: contentSecurityPolicy(mode, origin, backendOrigin) },
          injectTo: "head-prepend" as const,
        }];
      },
    },
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase/") || id.includes("supabase-js")) return "supabase";
          if (id.includes("react-router") || id.includes("@remix-run/router")
            || id.includes("react-dom") || id.includes("/react/")
            || id.includes("@radix-ui/") || id.includes("@floating-ui/")) return "ui";
        },
      },
    },
  },
}));
