import type { Skill } from "./sema.js";

const BETIK_UZANTILARI = new Set([".py", ".js", ".mjs", ".cjs", ".ts", ".sh", ".ps1", ".bat", ".cmd", ".rb"]);
const AG_IFADELERI = ["requests.", "urllib", "http.client", "fetch(", "axios", "curl ", "wget ", "Invoke-WebRequest", "socket."];

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
  const agIpucu = betikDosyalari.some((d) => d.icerik !== undefined && AG_IFADELERI.some((i) => d.icerik!.includes(i)));
  return { betikler: betikDosyalari.map((d) => d.yol), agIpucu };
}
