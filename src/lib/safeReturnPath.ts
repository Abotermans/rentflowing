export function safeReturnPath(pathname: unknown): string {
  if (typeof pathname !== "string") return "/";
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return "/";
  if (pathname.includes("\\") || [...pathname].some(char => char.charCodeAt(0) < 32) || /%(?:2f|5c)/i.test(pathname)) return "/";
  return pathname;
}
