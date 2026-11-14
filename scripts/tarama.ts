import type { Skill } from "./sema.js";

const BETIK_UZANTILARI = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".ps1", ".bat", ".cmd", ".rb"]);
const AG_IFADELERI = ["requests.", "urllib", "http.client", "fetch(", "axios", "curl ", "wget ", "Invoke-WebRequest", "socket."];
/** Plandaki ifadelerin kaçırdığı içe aktarma biçimleri (ör. `import requests`, `from socket import x`). */
const AG_DESENLERI = [
  /^\s*(?:import|from)\s+(?:requests|httpx|aiohttp|urllib3?|socket|http\.client|websockets?|paramiko|ftplib|smtplib)\b/m,
  /\brequire\(\s*["'](?:node:)?(?:https?|net|tls|dgram|node-fetch|axios|undici|got)["']\s*\)/,
  /\bfrom\s+["'](?:node:)?(?:https?|net|tls|dgram|node-fetch|axios|undici|got)["']/,
  /\b(?:Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient|Start-BitsTransfer)\b/i,
];

const agIpucuVar = (icerik: string) => AG_IFADELERI.some((i) => icerik.includes(i)) || AG_DESENLERI.some((d) => d.test(icerik));

function betikMi(yol: string): boolean {
  const ad = yol.slice(yol.lastIndexOf("/") + 1);
  const nokta = ad.lastIndexOf(".");
  return nokta > 0 && BETIK_UZANTILARI.has(ad.slice(nokta).toLowerCase());
}

/**
 * Basit sezgisel tarama: betik dosyalarını listeler ve betik içeriklerinde ağ erişimi ipucu arar.
 * Betik olmayan dosyaların (ör. README) içeriği ipucu sayılmaz. Bu bir güvenlik garantisi değildir.
 */
export function guvenlikTara(dosyalar: { yol: string; icerik?: string }[]): Skill["guvenlik"] {
  const betikDosyalari = dosyalar.filter((d) => betikMi(d.yol));
  const agIpucu = betikDosyalari.some((d) => d.icerik !== undefined && agIpucuVar(d.icerik));
  return { betikler: betikDosyalari.map((d) => d.yol), agIpucu };
}
