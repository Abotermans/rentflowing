import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadEnv } from "vite";

const defaultOrigin = "https://rentflowing.lovable.app";
const defaultBackendOrigin = "https://othaxlwgtqpodncnlglv.supabase.co";

export function configureHeaderTemplate(template, configuredOrigin, configuredBackendOrigin) {
  const url = new URL(configuredOrigin);
  const backendUrl = new URL(configuredBackendOrigin);
  if (url.protocol !== "https:" || configuredOrigin.replace(/\/$/, "") !== url.origin) {
    throw new Error("PUBLIC_APP_ORIGIN must be an HTTPS origin without a path, query, or fragment");
  }
  if (backendUrl.protocol !== "https:" || configuredBackendOrigin !== backendUrl.origin) {
    throw new Error("VITE_SUPABASE_URL must be an HTTPS origin");
  }

  return template
    .replaceAll(defaultOrigin, url.origin)
    .replaceAll(defaultBackendOrigin, backendUrl.origin)
    .replaceAll(
      defaultBackendOrigin.replace(/^https:/, "wss:"),
      backendUrl.origin.replace(/^https:/, "wss:"),
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN ?? defaultOrigin;
  const configuredBackendOrigin = loadEnv("production", process.cwd(), "VITE_").VITE_SUPABASE_URL?.trim();
  const path = new URL("../dist/_headers", import.meta.url);
  const template = await readFile(path, "utf8");
  await writeFile(path, configureHeaderTemplate(template, configuredOrigin, configuredBackendOrigin));
}
