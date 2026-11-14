import matter from "gray-matter";
import { parse } from "yaml";

/** Frontmatter bloğu ("---" ... "---"), YAML okunamazsa gövdeyi ayırmak için. */
const FRONTMATTER = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/;

const metinAl = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * SKILL.md metnini ayrıştırır. YAML "failsafe" şemasıyla okunur, böylece `version: 1.10` sayıya
 * dönüşüp "1.1" olmaz. Bozuk frontmatter derlemeyi durdurmaz: alanlar boş kalır, gövde korunur.
 */
export function skillMdAyristir(metin: string): { ad?: string; aciklama?: string; surum?: string; govde: string } {
  const temiz = metin.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

  let veri: Record<string, unknown> = {};
  let govde: string;
  try {
    // Seçenek verildiği için gray-matter önbelleği kullanılmaz.
    const sonuc = matter(temiz, { engines: { yaml: (s: string) => (parse(s, { schema: "failsafe" }) ?? {}) as object } });
    veri = typeof sonuc.data === "object" && sonuc.data !== null ? (sonuc.data as Record<string, unknown>) : {};
    govde = sonuc.content;
  } catch {
    govde = temiz.replace(FRONTMATTER, "");
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
