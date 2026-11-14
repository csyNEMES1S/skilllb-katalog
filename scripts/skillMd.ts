import { parse } from "yaml";

/**
 * Frontmatter: metin tam olarak "---" satırıyla (ardından yalnız boşluk/tab) başlar ve bir sonraki tam
 * "---" satırına kadar sürer. "---js" gibi dil ekli açılışlar frontmatter SAYILMAZ: üçüncü taraf
 * içerik hiçbir koşulda kod olarak çalıştırılmaz (gray-matter bunları eval ederdi).
 */
const FRONTMATTER = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;

const metinAl = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * SKILL.md metnini ayrıştırır. YAML "failsafe" şemasıyla okunur, böylece `version: 1.10` sayıya
 * dönüşüp "1.1" olmaz. Bozuk frontmatter derlemeyi durdurmaz: alanlar boş kalır, gövde korunur.
 */
export function skillMdAyristir(metin: string): { ad?: string; aciklama?: string; surum?: string; govde: string } {
  const temiz = metin.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  let veri: Record<string, unknown> = {};
  let govde = temiz;
  const eslesme = FRONTMATTER.exec(temiz);
  if (eslesme) {
    govde = temiz.slice(eslesme[0].length);
    try {
      const okunan: unknown = parse(eslesme[1] ?? "", { schema: "failsafe" });
      if (typeof okunan === "object" && okunan !== null && !Array.isArray(okunan)) veri = okunan as Record<string, unknown>;
    } catch {
      // Bozuk YAML: alanlar boş kalır.
    }
  }

  const cikti: { ad?: string; aciklama?: string; surum?: string; govde: string } = { govde: "" };
  const ad = metinAl(veri.name);
  const aciklama = metinAl(veri.description);
  const surum = metinAl(veri.version);
  if (ad) cikti.ad = ad;
  if (aciklama) cikti.aciklama = aciklama;
  if (surum) cikti.surum = surum;
  cikti.govde = govde.replace(/^\n+/, "");
  return cikti;
}
