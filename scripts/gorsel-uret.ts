import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { isMap, isScalar, parse, parseDocument } from "yaml";
import { kayitlariOku } from "./kayitOku.js";
import { KATEGORILER, KayitSemasi, type KategoriId, type Kayit } from "./sema.js";

/**
 * Her skill için tutarlı tarzda ikon (128×128) ve kapak (640×320) SVG'si üretir.
 *
 * Kullanım: npm run gorsel [-- --zorla] [--kayitlar kayitlar] [--gorseller gorseller]
 *
 * Var olan görsellerin üzerine yazmaz (sahibin elle koyduğu görseller korunur); `--zorla` ile yazar.
 * Kayıtta `gorseller.ikon` / `gorseller.kapak` yoksa `gorseller/<id>/ikon.svg` / `kapak.svg` olarak
 * ekler; alan başka bir görseli gösteriyorsa o görsel için dosya üretmez.
 * SVG'ler tamamen kendi içindedir: harici font, betik, görsel ya da bağlantı yoktur.
 */

// ---- Renkler (uygulamanın src/stil/tokenlar.css değerleri) ----

export const VURGU = "#e2672f";
const KOYU = "#121119";

export const KATEGORI_RENKLERI: Record<KategoriId, { zemin: string; yazi: string }> = {
  "belge-ofis": { zemin: "#f3c9b3", yazi: "#7a3214" },
  tasarim: { zemin: "#f5c6dc", yazi: "#7d1f4b" },
  "kod-test": { zemin: "#d2cbf5", yazi: "#3b2f8a" },
  "veri-grafik": { zemin: "#bfe6d2", yazi: "#145c3a" },
  yazi: { zemin: "#f2e2a8", yazi: "#6a5208" },
  guvenlik: { zemin: "#c4dcf5", yazi: "#1b4a7d" },
  diger: { zemin: "#dedce8", yazi: "#45425a" },
};

/** İki #rrggbb rengini `oran` (0 = a, 1 = b) kadar karıştırır. */
function karistir(a: string, b: string, oran: number): string {
  const c = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return (
    "#" +
    [0, 1, 2]
      .map((i) => Math.round(c(a, i) + (c(b, i) - c(a, i)) * oran).toString(16).padStart(2, "0"))
      .join("")
  );
}

// ---- Piktogramlar (64×64 ızgara, düz çizgi) ----
//
// `c`: ana çizgiler (kategori yazı rengi), `v`: vurgu (turuncu). İçlerinde FG / VR / ZM yer tutucuları
// sırasıyla yazı, vurgu ve zemin rengiyle değiştirilir (dolgu gereken parçalar için).

type Piktogram = { c: string; v?: string };

const P = (d: string, ek = "") => `<path d="${d}"${ek}/>`;
const C = (x: number, y: number, r: number, ek = "") => `<circle cx="${x}" cy="${y}" r="${r}"${ek}/>`;
const R = (x: number, y: number, w: number, h: number, rx: number, ek = "") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${ek}/>`;
const DOLU = ' fill="VR" stroke="none"';
const DOLU_FG = ' fill="FG" stroke="none"';
const ZEMIN = ' fill="ZM"';

/** Dört köşeli parıltı (içbükey yıldız), dolu. */
const parilti = (x: number, y: number, s: number, ek = DOLU) =>
  P(`M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`, ek);

/** Dişli çark çevresi. */
function disliYolu(cx: number, cy: number, dis: number, ic: number, n: number): string {
  const nokta = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  const adim = (2 * Math.PI) / n;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = i * adim - Math.PI / 2;
    d += `${i ? "L" : "M"}${nokta(ic, a - adim * 0.32)}L${nokta(dis, a - adim * 0.18)}L${nokta(dis, a + adim * 0.18)}L${nokta(ic, a + adim * 0.32)}`;
  }
  return P(d + "Z");
}

const sayfa = P("M15 6h22l12 12v40H15z") + P("M37 6v12h12");
const pencere = R(6, 10, 52, 44, 6) + P("M6 22h52");
const pencereNoktalar = C(13, 16, 1.8, DOLU) + C(19, 16, 1.8, DOLU) + C(25, 16, 1.8, DOLU);
const balon = P("M12 10h40a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H28L16 52V42h-4a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z");

export const PIKTOGRAMLAR = {
  belge: { c: sayfa, v: P("M22 32h20M22 41h20M22 50h12") },
  "belge-etiket": { c: sayfa + P("M24 50h18"), v: R(8, 26, 32, 16, 3, DOLU) + P("M14 34h20", ' stroke="ZM" stroke-width="3"') },
  "belge-kalem": { c: sayfa + P("M22 30h18M22 39h10"), v: P("M30 58l2-9 18-18 7 7-18 18z", ZEMIN) + P("M45 36l7 7") },
  "belge-parilti": { c: sayfa + P("M22 32h20M22 41h20M22 50h12"), v: parilti(50, 44, 11, ' fill="VR" stroke="ZM" stroke-width="3"') },
  markdown: { c: sayfa, v: P("M27 28l-3 22M37 28l-3 22M21 35h20M20 43h20") },
  tablo: { c: R(8, 12, 48, 40, 5) + P("M8 39h48M24 26v26M40 26v26"), v: P("M8 26h48") },
  sunum: { c: P("M6 10h52") + R(10, 10, 44, 32, 2) + P("M32 42v8M24 57l8-7 8 7"), v: P("M20 34v-6M28 34v-12M36 34v-9M44 34v-15") },
  firca: { c: P("M54 8 38 26") + P("M33 22l9 9"), v: P("M31 28c-7 0-11 5-12 11-1 5-4 8-10 10 10 4 22 2 26-5 3-5 2-11-4-16z", ' fill="VR"') },
  palet: {
    c: P("M32 8C18 8 8 18 8 31c0 13 10 23 22 23 4 0 6-2 6-5 0-2-1-3-1-5 0-3 2-5 5-5h6c7 0 12-5 12-12C58 16 46 8 32 8z") + C(19, 38, 4, DOLU_FG),
    v: C(21, 24, 4, DOLU) + C(33, 17, 4, DOLU) + C(45, 24, 4, DOLU),
  },
  "renk-ornekleri": { c: R(7, 24, 14, 26, 3, ' fill="FG"') + R(43, 24, 14, 26, 3) + P("M7 14h24"), v: R(25, 24, 14, 26, 3, ' fill="VR"') },
  cerceve: { c: R(10, 6, 44, 52, 4) + P("M17 47l11-14 8 9 5-5 7 10z"), v: C(40, 20, 5, DOLU) },
  uretken: { c: P("M6 22c6-10 12-10 18 0s12 10 18 0 10-9 16-3") + P("M6 38c6-10 12-10 18 0s12 10 18 0 10-9 16-3"), v: C(14, 52, 3, DOLU) + C(32, 52, 3, DOLU) + C(50, 52, 3, DOLU) },
  diyagram: { c: R(6, 8, 20, 14, 3) + R(38, 8, 20, 14, 3) + R(22, 44, 20, 14, 3), v: P("M16 22v8h32v-8M32 30v14") },
  tuval: { c: R(6, 8, 24, 18, 3) + R(36, 36, 22, 18, 3) + R(6, 42, 16, 12, 3), v: P("M30 17c10 0 17 5 17 19M22 48h14") },
  tarayici: { c: pencere + R(14, 30, 16, 16, 2) + P("M36 32h14M36 39h14M36 46h8"), v: pencereNoktalar },
  "tarayici-onay": { c: pencere, v: pencereNoktalar + P("M21 38l8 8 14-15") },
  kaydiricilar: { c: P("M10 18h44M10 32h44M10 46h44"), v: C(22, 18, 5, ' fill="VR"') + C(42, 32, 5, ' fill="VR"') + C(28, 46, 5, ' fill="VR"') },
  film: { c: R(6, 12, 52, 40, 6) + P("M16 12v8M26 12v8M38 12v8M48 12v8M16 44v8M26 44v8M38 44v8M48 44v8"), v: P("M27 25v14l11-7z", ' fill="VR"') },
  "sihirli-degnek": { c: P("M10 54 38 26"), v: parilti(45, 19, 9) + parilti(54, 38, 5) + parilti(26, 10, 5) },
  katmanlar: { c: P("M32 8 56 20 32 32 8 20z") + P("M8 32l24 12 24-12"), v: P("M8 44l24 12 24-12") },
  kod: { c: P("M22 18 8 32l14 14M42 18l14 14-14 14"), v: P("M36 12 28 52") },
  suslu: {
    c: P("M24 10c-6 0-8 3-8 8v6c0 4-2 7-6 8 4 1 6 4 6 8v6c0 5 2 8 8 8M40 10c6 0 8 3 8 8v6c0 4 2 7 6 8-4 1-6 4-6 8v6c0 5-2 8-8 8"),
    v: C(32, 32, 4, DOLU),
  },
  terminal: { c: R(6, 10, 52, 44, 6) + P("M6 20h52"), v: P("M16 31l7 6-7 6M28 44h14") },
  bocek: {
    c: `<ellipse cx="32" cy="38" rx="12" ry="15"/>` + P("M24 24a8 8 0 0 1 16 0") + P("M20 32l-9-4M20 41H9M21 49l-8 5M44 32l9-4M44 41h11M43 49l8 5M27 17l-4-6M37 17l4-6"),
    v: P("M32 27v25"),
  },
  "buyutec-bocek": {
    c: C(27, 27, 18) + P("M40 40l15 15"),
    v: `<ellipse cx="27" cy="30" rx="6" ry="8"/>` + P("M21 26l-4-2M21 33h-4M33 26l4-2M33 33h4M24 20l-2-3M30 20l2-3"),
  },
  "git-dali": { c: P("M18 17v30") + C(18, 12, 5) + C(18, 52, 5), v: C(46, 20, 5) + P("M46 25c0 14-26 9-28 22") },
  bayrak: { c: P("M14 58V8"), v: P("M14 10h32l-7 10 7 10H14z", ' fill="VR"') },
  "test-tupu": { c: P("M22 8h20M26 8v40a6 6 0 0 0 12 0V8"), v: P("M26 32h12v16a6 6 0 0 1-12 0z", DOLU) + C(48, 22, 2.5, DOLU) + C(50, 12, 2, DOLU) },
  dongu: { c: P("M52 32a20 20 0 1 1-6-14") + P("M48 8v10H38"), v: P("M23 32l6 6 11-12") },
  fis: { c: P("M22 6v12M42 6v12") + P("M14 18h36v10a18 18 0 0 1-36 0z") + P("M32 46v12"), v: P("M34 22l-5 8h6l-5 8") },
  yapboz: { c: P("M8 20h12c0-9 12-9 12 0h12v11c9 0 9 12 0 12v11H8z"), v: parilti(26, 38, 7) },
  hiz: { c: P("M6 50a26 26 0 1 1 52 0") + P("M13 33l4 3M32 24v6M51 33l-4 3"), v: P("M32 50l13-15") + C(32, 50, 4.5, DOLU) },
  tabela: { c: P("M32 6v52M24 58h16") + P("M32 32H15l-6 6 6 6h17"), v: P("M32 12h18l6 6-6 6H32") },
  harita: { c: P("M6 14l16-6 20 6 16-6v42l-16 6-20-6-16 6z") + P("M22 8v42M42 14v42"), v: P("M12 42c5-3 7-11 13-11s9 9 15 5 7-12 12-14") },
  klipbord: { c: R(12, 10, 40, 48, 5) + R(24, 6, 16, 8, 3, ZEMIN), v: P("M20 27h4M29 27h15M20 37h4M29 37h15M20 47h4M29 47h10") },
  liste: { c: P("M28 16h26M28 32h26M28 48h18") + R(8, 43, 10, 10, 2), v: P("M8 16l4 4 7-7M8 32l4 4 7-7") },
  "rozet-onay": { c: C(32, 27, 20) + P("M22 44 18 58l8-4 6 6M42 44l4 14-8-4-6 6"), v: P("M23 27l6 6 12-12") },
  goz: { c: P("M4 32s10-18 28-18 28 18 28 18-10 18-28 18S4 32 4 32z"), v: C(32, 32, 8) + C(32, 32, 3, DOLU) },
  yorum: { c: balon, v: P("M18 22h28M18 31h18") },
  soru: { c: balon, v: P("M26 21a6 6 0 1 1 9 5c-2 1-3 2-3 5") + C(32, 37, 2, DOLU) },
  sohbet: {
    c: P("M10 8h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22l-8 7v-7h-4a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z"),
    v: P("M48 26h6a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4h-2v7l-8-7H30a4 4 0 0 1-4-4v-8"),
  },
  mikrofon: { c: R(24, 6, 16, 30, 8) + P("M16 28a16 16 0 0 0 32 0M32 44v10M24 56h16"), v: P("M29 16h6M29 24h6") },
  kalem: { c: P("M12 50l3-12L42 11a5 5 0 0 1 7 0l2 2a5 5 0 0 1 0 7L24 47z") + P("M38 15l9 9"), v: P("M32 56c4-3 8 3 12 0s8 3 12 0") },
  megafon: { c: P("M8 25h10l22-12v38L18 39H8z") + P("M14 39l4 12h6l-3-12"), v: P("M48 24a10 10 0 0 1 0 16M53 18a18 18 0 0 1 0 28") },
  takvim: { c: R(8, 12, 48, 44, 5) + P("M8 24h48M20 6v12M44 6v12"), v: P("M18 34h4M30 34h4M42 34h4M18 45h4M30 45h4", ' stroke-width="5"') },
  zarf: { c: R(8, 14, 48, 36, 5), v: P("M10 18l22 17 22-17") },
  parilti: { c: parilti(30, 36, 20, ""), v: parilti(50, 14, 8) + parilti(13, 14, 5) },
  ampul: { c: P("M24 44c0-5-8-9-8-19a16 16 0 0 1 32 0c0 10-8 14-8 19z") + P("M25 51h14M28 57h8"), v: P("M27 35l5-9 5 9") },
  beyin: {
    c: P("M31 10c-5-4-13-1-13 6-6 1-9 7-7 12-5 3-5 11 0 14-1 6 4 11 10 10 2 4 7 5 10 3z") + P("M33 10c5-4 13-1 13 6 6 1 9 7 7 12 5 3 5 11 0 14 1 6-4 11-10 10-2 4-7 5-10 3z"),
    v: P("M23 27a5 5 0 0 1 6 4M41 27a5 5 0 0 0-6 4M24 42h4M36 42h4"),
  },
  kitap: {
    c: P("M32 16c-6-5-14-6-24-5v38c10-1 18 0 24 5 6-5 14-6 24-5V11c-10-1-18 0-24 5z") + P("M32 16v38"),
    v: P("M14 22c5 0 9 1 12 3M14 31c5 0 9 1 12 3M50 22c-5 0-9 1-12 3"),
  },
  kep: { c: P("M4 24 32 12l28 12-28 12z") + P("M16 30v12c0 4 7 8 16 8s16-4 16-8V30"), v: P("M56 26v14") + C(56, 43, 3, DOLU) },
  hedef: { c: C(32, 32, 24) + C(32, 32, 14), v: C(32, 32, 5, DOLU) + P("M32 32 50 14M44 12h8v8") },
  kartlar: { c: R(8, 8, 21, 21, 4) + R(35, 8, 21, 21, 4) + R(8, 35, 21, 21, 4), v: R(35, 35, 21, 21, 4, ' fill="VR"') },
  grafik: { c: P("M10 8v46h46"), v: P("M18 42l10-12 9 7 15-18") + C(52, 19, 3.5, DOLU) },
  veritabani: { c: `<ellipse cx="32" cy="14" rx="18" ry="7"/>` + P("M14 14v36c0 4 8 7 18 7s18-3 18-7V14"), v: P("M14 32c0 4 8 7 18 7s18-3 18-7") },
  donusum: { c: P("M10 22h40M40 12l10 10-10 10"), v: P("M54 42H14M24 32 14 42l10 10") },
  huni: { c: P("M8 10h48L37 32v18l-10 6V32z"), v: P("M18 18h28") },
  kalkan: { c: P("M32 6l20 8v16c0 14-9 23-20 28C21 53 12 44 12 30V14z"), v: P("M23 31l6 6 12-12") },
  kilit: { c: R(12, 28, 40, 28, 6) + P("M20 28v-8a12 12 0 0 1 24 0v8"), v: P("M32 40v7") + C(32, 39, 3.5, DOLU) },
  buyutec: { c: C(27, 27, 17) + P("M39 39l16 16"), v: P("M18 24a10 10 0 0 1 8-8") },
  uyari: { c: P("M32 8 58 54H6z"), v: P("M32 24v14") + C(32, 46, 2.8, DOLU) },
  radar: { c: C(32, 32, 24) + C(32, 32, 13), v: P("M32 32 50 16") + C(32, 32, 3.5, DOLU) + C(41, 41, 3, DOLU) },
  akis: { c: R(4, 24, 16, 16, 4) + R(44, 8, 16, 16, 4) + R(44, 40, 16, 16, 4), v: P("M20 32h10M30 16v32M30 16h14M30 48h14") },
  diff: { c: R(6, 10, 24, 44, 4) + R(34, 10, 24, 44, 4) + P("M12 34h12M12 42h8M40 36h12M40 44h8"), v: P("M12 24h12M40 24h12M46 18v12") },
  olcek: { c: R(8, 40, 10, 14, 2) + R(21, 32, 10, 22, 2) + R(34, 22, 10, 32, 2), v: R(47, 10, 10, 44, 2, ' fill="VR"') },
  disli: { c: disliYolu(32, 32, 26, 19, 8), v: C(32, 32, 8) },
} satisfies Record<string, Piktogram>;

export type PiktogramAdi = keyof typeof PIKTOGRAMLAR;

/** Katalogdaki her skill için seçilmiş piktogram. */
export const ESLEME: Record<string, PiktogramAdi> = {
  "academy-guide": "kep",
  "algorithmic-art": "uretken",
  "brand-guidelines": "renk-ornekleri",
  "canvas-design": "cerceve",
  "claude-api": "suslu",
  "claude-md-improver": "belge-parilti",
  "content-strategy": "takvim",
  "copy-editing": "kalem",
  copywriting: "megafon",
  "cvss-scoring": "olcek",
  defuddle: "huni",
  "diagram-design": "diyagram",
  "differential-review": "diff",
  "discernment-nudge": "soru",
  "doc-coauthoring": "belge-kalem",
  "documentation-and-adrs": "tabela",
  docx: "belge",
  "duckdb-convert-file": "donusum",
  "duckdb-read-file": "veritabani",
  "find-bugs": "bocek",
  "finishing-a-development-branch": "bayrak",
  "frontend-design": "tarayici",
  "gha-security-review": "akis",
  "git-workflow-and-versioning": "git-dali",
  "idea-refine": "ampul",
  "i-have-adhd": "beyin",
  "internal-comms": "sohbet",
  "interview-me": "mikrofon",
  "json-canvas": "tuval",
  "marketing-emails": "zarf",
  "mcp-builder": "fis",
  "modern-python": "terminal",
  "obsidian-bases": "kartlar",
  "obsidian-markdown": "markdown",
  pdf: "belge-etiket",
  "performance-optimization": "hiz",
  playground: "kaydiricilar",
  pptx: "sunum",
  "prompt-optimizer": "parilti",
  "property-based-testing": "test-tupu",
  "receiving-code-review": "yorum",
  "requesting-code-review": "goz",
  "security-and-hardening": "kilit",
  "security-audit": "liste",
  "security-review": "kalkan",
  semgrep: "buyutec",
  "seo-audit": "hedef",
  "sharp-edges": "uyari",
  "skill-creator": "yapboz",
  "skill-scanner": "radar",
  "slack-gif-creator": "film",
  "spec-driven-development": "klipbord",
  "systematic-debugging": "buyutec-bocek",
  teach: "kitap",
  "test-driven-development": "dongu",
  "theme-factory": "palet",
  unslop: "sihirli-degnek",
  "verification-before-completion": "rozet-onay",
  "webapp-testing": "tarayici-onay",
  "web-artifacts-builder": "katmanlar",
  "writing-plans": "harita",
  xlsx: "tablo",
  // 2026-11-15 eklenenler
  "a11y-audit": "goz",
  "avenox-graphics": "katmanlar",
  "avenox-roughcut": "kaydiricilar",
  "avenox-thumbnail": "cerceve",
  brag: "megafon",
  "brag-slim": "film",
  "bugcrowd-reporting": "bocek",
  caveman: "sohbet",
  chainscan: "veritabani",
  "codex-fleet": "terminal",
  "design-qa": "tarayici-onay",
  "developer-tutorial": "kep",
  "diagnosing-bugs": "buyutec-bocek",
  "evidence-hygiene": "kilit",
  "fable-orchestration": "akis",
  "find-skills": "buyutec",
  gptpro: "donusum",
  "gptpro-handoff": "klipbord",
  "hackatomy-studyo": "kitap",
  handoff: "belge-kalem",
  "no-ai-slop": "kalem",
  "offensive-reporting": "belge-etiket",
  "omp-fleet": "disli",
  "owasp-security": "kalkan",
  ponytail: "hiz",
  "recon-scope-triage": "radar",
  "report-writing": "belge",
  "semgrep-rule-creator": "liste",
  "session-report": "grafik",
  supabase: "veritabani",
  "supabase-postgres-best-practices": "tablo",
  "supply-chain-risk-auditor": "yapboz",
  "triage-validation": "rozet-onay",
  tutor: "kartlar",
  "vibe-learn": "ampul",
  "video-watch": "film",
};

/** Eşlemede olmayan yeni kayıtlar için id/ad anahtar kelimeleri (sırayla denenir). */
const ANAHTAR_KELIMELER: [RegExp, PiktogramAdi][] = [
  [/test/i, "test-tupu"],
  [/g[üu]venlik|security|audit/i, "kalkan"],
  [/pdf/i, "belge-etiket"],
  [/tablo|excel|xlsx|csv|sheet/i, "tablo"],
  [/sunum|pptx|slide/i, "sunum"],
  [/\bgit\b|git-/i, "git-dali"],
  [/bug|hata|debug/i, "bocek"],
  [/veri|data|sql|db\b|duckdb/i, "veritabani"],
  [/e-?posta|mail/i, "zarf"],
  [/grafik|chart|plot/i, "grafik"],
  [/tasar[ıi]m|design/i, "firca"],
  [/ayar|config/i, "disli"],
  [/fikir|idea/i, "ampul"],
];

const KATEGORI_VARSAYILANI: Record<KategoriId, PiktogramAdi> = {
  "belge-ofis": "belge",
  tasarim: "firca",
  "kod-test": "kod",
  "veri-grafik": "grafik",
  yazi: "kalem",
  guvenlik: "kalkan",
  diger: "ampul",
};

export function piktogramSec(kayit: Pick<Kayit, "id" | "ad" | "kategori">): PiktogramAdi {
  const acik = ESLEME[kayit.id];
  if (acik) return acik;
  const metin = `${kayit.id} ${kayit.ad}`;
  for (const [desen, ad] of ANAHTAR_KELIMELER) if (desen.test(metin)) return ad;
  return KATEGORI_VARSAYILANI[kayit.kategori];
}

// ---- SVG ----

export function xmlKacis(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

const FONT = "Space Grotesk, Inter, Segoe UI, sans-serif";

function renkler(kategori: KategoriId) {
  const { zemin, yazi } = KATEGORI_RENKLERI[kategori] ?? KATEGORI_RENKLERI.diger;
  return { zemin, yazi, acik: karistir(zemin, "#ffffff", 0.5), derin: karistir(zemin, yazi, 0.12) };
}

/** Piktogramı (64 ızgara) `x,y` noktasına `olcek` ile yerleştirir. */
function piktogramG(ad: PiktogramAdi, x: number, y: number, olcek: number, r: ReturnType<typeof renkler>, kalinlik: number): string {
  const p: Piktogram = PIKTOGRAMLAR[ad];
  const doldur = (s: string) => s.replace(/"FG"/g, `"${r.yazi}"`).replace(/"VR"/g, `"${VURGU}"`).replace(/"ZM"/g, `"${r.zemin}"`);
  const ortak = `fill="none" stroke-width="${kalinlik}" stroke-linecap="round" stroke-linejoin="round"`;
  return (
    `<g transform="translate(${x} ${y}) scale(${olcek})" ${ortak}>` +
    `<g stroke="${r.yazi}">${doldur(p.c)}</g>` +
    (p.v ? `<g stroke="${VURGU}">${doldur(p.v)}</g>` : "") +
    `</g>`
  );
}

function zeminDegrade(id: string, r: ReturnType<typeof renkler>) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r.acik}"/><stop offset="1" stop-color="${r.derin}"/></linearGradient>`;
}

export function ikonSvg(kayit: Pick<Kayit, "id" | "ad" | "kategori">): string {
  const r = renkler(kayit.kategori);
  const gid = `ik-${kayit.id}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="${xmlKacis(kayit.ad)}">` +
    `<defs>${zeminDegrade(gid, r)}</defs>` +
    `<rect width="128" height="128" rx="28" fill="url(#${gid})"/>` +
    `<rect x="1.5" y="1.5" width="125" height="125" rx="26.5" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="3"/>` +
    piktogramG(piktogramSec(kayit), 28, 28, 1.125, r, 4) +
    `</svg>\n`
  );
}

/** Kaba metin genişliği tahmini (yazı tipi ölçülemiyor; biraz fazla tahmin eder). */
function genislik(s: string, boyut: number, kalin: boolean): number {
  let t = 0;
  for (const ch of s) {
    if (ch === " ") t += 0.28;
    else if (/[il.,:;'’!|ıIİjtfr()\[\]]/.test(ch)) t += 0.34;
    else if (/[mwMWŞĞ]/.test(ch)) t += 0.86;
    else if (/[A-ZÇÖÜ0-9&]/.test(ch)) t += 0.68;
    else t += 0.57;
  }
  return t * boyut * (kalin ? 1.06 : 1);
}

/** Sözcükleri `en` genişliğe sığacak satırlara böler; tek sözcük sığmıyorsa null. */
function sar(metin: string, boyut: number, en: number, kalin: boolean): string[] | null {
  const satirlar: string[] = [];
  let satir = "";
  for (const soz of metin.split(/\s+/).filter(Boolean)) {
    if (genislik(soz, boyut, kalin) > en) return null;
    const aday = satir ? `${satir} ${soz}` : soz;
    if (genislik(aday, boyut, kalin) <= en) satir = aday;
    else {
      satirlar.push(satir);
      satir = soz;
    }
  }
  if (satir) satirlar.push(satir);
  return satirlar;
}

/** Sığan ilk boyutu ve satırları seçer; hiçbiri sığmazsa en küçük boyutta kırpar. */
function yerlestir(metin: string, boyutlar: number[], en: number, enCokSatir: number, kalin: boolean) {
  for (const boyut of boyutlar) {
    const s = sar(metin, boyut, en, kalin);
    if (s && s.length <= enCokSatir) return { boyut, satirlar: s };
  }
  const boyut = boyutlar[boyutlar.length - 1];
  // Kırpma: karakter karakter doldur, son satırı üç noktayla bitir.
  const satirlar: string[] = [];
  let satir = "";
  for (const ch of metin.replace(/\s+/g, " ").trim()) {
    if (genislik(satir + ch, boyut, kalin) > en) {
      satirlar.push(satir.trimEnd());
      satir = ch.trimStart();
      if (satirlar.length === enCokSatir) break;
    } else satir += ch;
  }
  if (satirlar.length < enCokSatir && satir) satirlar.push(satir);
  if (satirlar.length === enCokSatir) {
    let son = satirlar[enCokSatir - 1];
    while (son && genislik(son + "…", boyut, kalin) > en) son = son.slice(0, -1);
    satirlar[enCokSatir - 1] = son.trimEnd() + "…";
  }
  return { boyut, satirlar };
}

export function kapakSvg(kayit: Pick<Kayit, "id" | "ad" | "kategori" | "kisaAciklama">): string {
  const r = renkler(kayit.kategori);
  const gid = `kp-${kayit.id}`;
  const tid = `kt-${kayit.id}`;
  const koyu = karistir(r.yazi, KOYU, 0.62);
  const katAd = (KATEGORILER.find((k) => k.id === kayit.kategori)?.ad ?? "Diğer").toLocaleUpperCase("tr-TR");

  const X = 256;
  const EN = 344;
  const baslik = yerlestir(kayit.ad, [42, 38, 34, 31, 28, 25, 22], EN, 2, true);
  if (baslik.boyut <= 28 && baslik.satirlar.length > 2) Object.assign(baslik, yerlestir(kayit.ad, [25, 22], EN, 3, true));
  const aciklama = yerlestir(kayit.kisaAciklama, [17, 15.5, 14], EN, 3, false);

  const etiketY = 13;
  const bSatir = baslik.boyut * 1.12;
  const aSatir = aciklama.boyut * 1.42;
  const yukseklik = etiketY + 16 + baslik.satirlar.length * bSatir + 14 + 5 + 16 + aciklama.satirlar.length * aSatir;
  let y = Math.round(160 - yukseklik / 2);

  const parcalar: string[] = [];
  parcalar.push(
    `<text x="${X}" y="${y + etiketY}" font-size="13" font-weight="700" letter-spacing="2" fill="${r.zemin}">${xmlKacis(katAd)}</text>`,
  );
  y += etiketY + 16;
  const bTspan = baslik.satirlar
    .map((s, i) => `<tspan x="${X}" dy="${i ? bSatir.toFixed(1) : (baslik.boyut * 0.88).toFixed(1)}">${xmlKacis(s)}</tspan>`)
    .join("");
  parcalar.push(`<text x="${X}" y="${y}" font-size="${baslik.boyut}" font-weight="700" fill="#ffffff">${bTspan}</text>`);
  y += baslik.satirlar.length * bSatir + 14;
  parcalar.push(`<rect x="${X}" y="${Math.round(y)}" width="48" height="5" rx="2.5" fill="${VURGU}"/>`);
  y += 5 + 16;
  const aTspan = aciklama.satirlar
    .map((s, i) => `<tspan x="${X}" dy="${i ? aSatir.toFixed(1) : (aciklama.boyut * 0.95).toFixed(1)}">${xmlKacis(s)}</tspan>`)
    .join("");
  parcalar.push(`<text x="${X}" y="${Math.round(y)}" font-size="${aciklama.boyut}" fill="#ffffff" fill-opacity=".8">${aTspan}</text>`);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" width="640" height="320" role="img" aria-label="${xmlKacis(kayit.ad)}">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r.yazi}"/><stop offset="1" stop-color="${koyu}"/></linearGradient>` +
    zeminDegrade(tid, r) +
    `</defs>` +
    `<rect width="640" height="320" fill="url(#${gid})"/>` +
    `<circle cx="610" cy="-10" r="150" fill="#ffffff" fill-opacity=".05"/>` +
    `<circle cx="80" cy="330" r="110" fill="#ffffff" fill-opacity=".04"/>` +
    `<rect x="40" y="70" width="180" height="180" rx="40" fill="url(#${tid})"/>` +
    `<rect x="42" y="72" width="176" height="176" rx="38" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="4"/>` +
    piktogramG(piktogramSec(kayit), 58, 88, 2.25, r, 3.6) +
    `<g font-family="${FONT}">${parcalar.join("")}</g>` +
    `</svg>\n`
  );
}

// ---- Kayıt düzenleme ----

/**
 * Kayıtta `gorseller.ikon` / `gorseller.kapak` yoksa varsayılan yolları ekler. Metin, yaml Document
 * API'sinin verdiği konumlara eklenerek değiştirilir: yorumlar, sıra, tırnaklar ve satır sonları kalır.
 * `gorseller` yoksa `kaynak` bloğunun hemen ardına (şemadaki sıra) eklenir. Değişiklik yoksa metni aynen döndürür.
 */
export function kayitGorselEkle(yamlMetni: string, id: string): string {
  const belge = parseDocument(yamlMetni);
  if (belge.errors.length) throw new Error(`YAML okunamadı: ${belge.errors[0].message}`);
  if (!isMap(belge.contents)) throw new Error("kayıt bir YAML haritası değil");
  const sl = yamlMetni.includes("\r\n") ? "\r\n" : "\n";
  const yollar = { ikon: `gorseller/${id}/ikon.svg`, kapak: `gorseller/${id}/kapak.svg` };

  /** `konum`dan sonraki ilk satır başı (gerekirse sona satır sonu ekleyerek). */
  const satirSonu = (metin: string, konum: number): [string, number] => {
    if (konum > 0 && metin[konum - 1] === "\n") return [metin, konum];
    const i = metin.indexOf("\n", konum);
    if (i >= 0) return [metin, i + 1];
    return [metin + sl, metin.length + sl.length];
  };

  const mevcut = belge.get("gorseller", true);
  let cikti: string;
  if (mevcut === undefined) {
    const kaynak = belge.get("kaynak", true);
    const son = isMap(kaynak) && kaynak.range ? kaynak.range[1] : yamlMetni.length;
    const [metin, konum] = satirSonu(yamlMetni, son);
    const blok = `gorseller:${sl}  ikon: ${yollar.ikon}${sl}  kapak: ${yollar.kapak}${sl}`;
    cikti = metin.slice(0, konum) + blok + metin.slice(konum);
  } else if (isMap(mevcut)) {
    const eksik = (["ikon", "kapak"] as const).filter((a) => !mevcut.has(a));
    if (!eksik.length) return yamlMetni;
    const ilk = mevcut.items[0]?.key;
    if (mevcut.flow || !mevcut.range || !isScalar(ilk) || !ilk.range) {
      for (const a of eksik) mevcut.set(a, yollar[a]);
      cikti = belge.toString({ lineWidth: 0 });
    } else {
      const satirBasi = yamlMetni.lastIndexOf("\n", ilk.range[0] - 1) + 1;
      const girinti = yamlMetni.slice(satirBasi, ilk.range[0]);
      const [metin, konum] = satirSonu(yamlMetni, mevcut.range[1]);
      const blok = eksik.map((a) => `${girinti}${a}: ${yollar[a]}${sl}`).join("");
      cikti = metin.slice(0, konum) + blok + metin.slice(konum);
    }
  } else if (isScalar(mevcut) && mevcut.value === null) {
    belge.set("gorseller", belge.createNode(yollar));
    cikti = belge.toString({ lineWidth: 0 });
  } else {
    throw new Error("gorseller alanı bir harita olmalı");
  }

  const sonuc = parse(cikti);
  if (!sonuc?.gorseller?.ikon || !sonuc?.gorseller?.kapak) throw new Error("gorseller alanı eklenemedi (beklenmedik YAML biçimi)");
  return cikti;
}

// ---- Dosyalar ----

const varMi = (yol: string) => stat(yol).then(() => true, () => false);

async function atomikYaz(yol: string, icerik: string) {
  const gecici = `${yol}.tmp`;
  await writeFile(gecici, icerik, "utf8");
  await rename(gecici, yol);
}

export type UretimSonucu = { yazilan: string[]; atlanan: string[]; guncellenenKayit: string[] };

export async function gorselleriUret(s: { kayitKlasoru: string; gorselKlasoru: string; zorla?: boolean }): Promise<UretimSonucu> {
  const kayitlar = await kayitlariOku(s.kayitKlasoru);
  const sonuc: UretimSonucu = { yazilan: [], atlanan: [], guncellenenKayit: [] };

  for (const kayit of kayitlar) {
    const varsayilan = { ikon: `gorseller/${kayit.id}/ikon.svg`, kapak: `gorseller/${kayit.id}/kapak.svg` };
    const uretici = { ikon: () => ikonSvg(kayit), kapak: () => kapakSvg(kayit) };

    for (const tur of ["ikon", "kapak"] as const) {
      const kayittaki = kayit.gorseller?.[tur];
      if (kayittaki && kayittaki !== varsayilan[tur]) continue; // kayıt başka bir görseli gösteriyor
      const goreli = `${kayit.id}/${tur}.svg`;
      const hedef = join(s.gorselKlasoru, kayit.id, `${tur}.svg`);
      if (!s.zorla && (await varMi(hedef))) {
        sonuc.atlanan.push(goreli);
        continue;
      }
      await mkdir(join(s.gorselKlasoru, kayit.id), { recursive: true });
      await atomikYaz(hedef, uretici[tur]());
      sonuc.yazilan.push(goreli);
    }

    const dosya = join(s.kayitKlasoru, `${kayit.id}.yaml`);
    const eski = await readFile(dosya, "utf8");
    const yeni = kayitGorselEkle(eski, kayit.id);
    if (yeni !== eski) {
      const denetim = KayitSemasi.safeParse(parse(yeni));
      if (!denetim.success) {
        const sorun = denetim.error.issues[0];
        throw new Error(`${kayit.id}.yaml: ${sorun.path.join(".") || "(kök)"} ${sorun.message}`);
      }
      await atomikYaz(dosya, yeni);
      sonuc.guncellenenKayit.push(kayit.id);
    }
  }
  return sonuc;
}

async function ana(): Promise<number> {
  const { values } = parseArgs({
    options: {
      kayitlar: { type: "string", default: "kayitlar" },
      gorseller: { type: "string", default: "gorseller" },
      zorla: { type: "boolean", default: false },
    },
  });
  const s = await gorselleriUret({ kayitKlasoru: resolve(values.kayitlar), gorselKlasoru: resolve(values.gorseller), zorla: values.zorla });
  console.log(`${s.yazilan.length} görsel yazıldı, ${s.atlanan.length} var olan görsel korundu, ${s.guncellenenKayit.length} kayıt güncellendi`);
  if (s.atlanan.length && !values.zorla) console.log("Var olanların üzerine yazmak için: npm run gorsel -- --zorla");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  ana().then(
    (kod) => process.exit(kod),
    (e) => {
      console.error(`hata: ${(e as Error).message}`);
      process.exit(1);
    },
  );
}
