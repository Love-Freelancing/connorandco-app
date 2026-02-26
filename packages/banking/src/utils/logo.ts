export function getLogoURL(id: string, ext?: string) {
  return `https://cdn-engine.connorandco.vercel.app/${id}.${ext || "jpg"}`;
}

export function getFileExtension(url: string) {
  return url.split(".").at(-1);
}
