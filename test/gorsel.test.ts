import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import {
  ESLEME,
  KATEGORI_RENKLERI,
  PIKTOGRAMLAR,
  gorselleriUret,
  ikonSvg,
  kapakSvg,
  kayitGorselEkle,
  piktogramSec,
  xmlKacis,
} from "../scripts/gorsel-uret.js";
import { KATEGORILER, type Kayit } from "../scripts/sema.js";

const A = "a".repeat(40);

function kayit(ek: Partial<Kayit> = {}): Kayit {
  return {
    id: "pdf-ustasi",
    ad: "PDF Ustası",
    kisaAciklama: "PDF dosyalarıyla çalışır",
    neIseYarar: ["PDF birleştirir"],
    kategori: "belge-ofis",
    kaynak: { repo: "anthropics/skills", yol: "skills/pdf", dal: "main", sha: A },
    ornekCumleler: ["Bu PDF'leri birleştir"],
    uyumluluk: {
      claude: { durum: "calisir", sahibiDenedi: true },
      antigravity: { durum: "bilinmiyor", sahibiDenedi: false },
    },
    ...ek,
  };
}

const YAML = `# Sahibin notu: bu kayıt elle yazıldı
id: pdf-ustasi
ad: "PDF Ustası" # kartta görünen ad
kisaAciklama: "PDF dosyalarıyla çalışır"
neIseYarar:
  - "PDF birleştirir"
kategori: belge-ofis
kaynak:
  repo: anthropics/skills
  yol: skills/pdf
  dal: main
  sha: ${A} # sabit commit
# örnekler aşağıda
ornekCumleler:
  - "Bu PDF'leri birleştir"
uyumluluk:
  claude:
    durum: calisir
    sahibiDenedi: true
  antigravity:
    durum: bilinmiyor
    sahibiDenedi: false
benzerler: [docx, xlsx]
`;

async function klasorKur(yaml = YAML) {
  const kok = await mkdtemp(join(tmpdir(), "gorsel-"));
  await mkdir(join(kok, "kayitlar"));
  await writeFile(join(kok, "kayitlar", "pdf-ustasi.yaml"), yaml, "utf8");
  return { kok, kayitlar: join(kok, "kayitlar"), gorseller: join(kok, "gorseller") };
}

describe("gorsel-uret", () => {
  it("svg_kacis_ve_script_yok", () => {
    expect(xmlKacis(`a & <b> "c" 'd'`)).toBe("a &amp; &lt;b&gt; &quot;c&quot; &apos;d&apos;");
    const k = kayit({ ad: "<script>alert(1)</script> & Ortak", kisaAciklama: `"Tırnak" <img src=x onerror=alert(1)>` });
    for (const svg of [ikonSvg(k), kapakSvg(k)]) {
      expect(svg).not.toMatch(/<script/i);
      expect(svg).not.toMatch(/<img|<image|<foreignObject|href=|@import|url\(http/i);
      expect(parseXmlBasit(svg)).toBe(true);
    }
    const kapak = kapakSvg(k);
    expect(kapak).toContain("&lt;script&gt;");
    expect(kapak).toContain("&amp;");
    expect(kapak).toContain("&quot;Tırnak&quot;");
  });

  it("svg_boyut_ve_viewbox", () => {
    const uzun = kayit({ ad: "Çok Uzun Bir Skill Adı Ki Satıra Sığmayacak Kadar Uzun Ve Daha Da Uzun", kisaAciklama: "x ".repeat(40) });
    const ikon = ikonSvg(uzun);
    const kapak = kapakSvg(uzun);
    expect(ikon).toContain('viewBox="0 0 128 128"');
    expect(kapak).toContain('viewBox="0 0 640 320"');
    expect(Buffer.byteLength(ikon)).toBeLessThanOrEqual(4096);
    expect(Buffer.byteLength(kapak)).toBeLessThanOrEqual(10240);
    expect(kapak).toContain('font-family="Space Grotesk, Inter, Segoe UI, sans-serif"');
  });

  it("var_olan_gorselin_uzerine_yazmaz", async () => {
    const d = await klasorKur();
    await mkdir(join(d.gorseller, "pdf-ustasi"), { recursive: true });
    await writeFile(join(d.gorseller, "pdf-ustasi", "ikon.svg"), "ELLE", "utf8");

    const s1 = await gorselleriUret({ kayitKlasoru: d.kayitlar, gorselKlasoru: d.gorseller });
    expect(await readFile(join(d.gorseller, "pdf-ustasi", "ikon.svg"), "utf8")).toBe("ELLE");
    expect(await readFile(join(d.gorseller, "pdf-ustasi", "kapak.svg"), "utf8")).toContain("<svg");
    expect(s1.atlanan).toContain("pdf-ustasi/ikon.svg");
    expect(s1.yazilan).toEqual(["pdf-ustasi/kapak.svg"]);

    const s2 = await gorselleriUret({ kayitKlasoru: d.kayitlar, gorselKlasoru: d.gorseller, zorla: true });
    expect(await readFile(join(d.gorseller, "pdf-ustasi", "ikon.svg"), "utf8")).toContain("<svg");
    expect(s2.yazilan.sort()).toEqual(["pdf-ustasi/ikon.svg", "pdf-ustasi/kapak.svg"]);
  });

  it("kayitta_baska_gorsel_varsa_uretmez", async () => {
    const d = await klasorKur(YAML.replace("ornekCumleler:", "gorseller:\n  ikon: https://ornek.com/i.png\nornekCumleler:"));
    const s = await gorselleriUret({ kayitKlasoru: d.kayitlar, gorselKlasoru: d.gorseller });
    expect(s.yazilan).toEqual(["pdf-ustasi/kapak.svg"]);
    const y = parse(await readFile(join(d.kayitlar, "pdf-ustasi.yaml"), "utf8"));
    expect(y.gorseller).toEqual({ ikon: "https://ornek.com/i.png", kapak: "gorseller/pdf-ustasi/kapak.svg" });
  });

  it("kayda_gorsel_alani_ekler_yorumlari_korur", async () => {
    const yeni = kayitGorselEkle(YAML, "pdf-ustasi");
    const beklenen = YAML.replace(
      "# örnekler aşağıda",
      "gorseller:\n  ikon: gorseller/pdf-ustasi/ikon.svg\n  kapak: gorseller/pdf-ustasi/kapak.svg\n# örnekler aşağıda",
    );
    expect(yeni).toBe(beklenen);
    expect(kayitGorselEkle(yeni, "pdf-ustasi")).toBe(yeni); // ikinci kez değiştirmez

    // Var olan gorseller haritasına yalnız eksik alanlar eklenir.
    const onceSonraVar = YAML.replace("# örnekler", "gorseller:\n  onceSonra:\n    - gorseller/pdf-ustasi/a.png # önce\n# örnekler");
    const y2 = kayitGorselEkle(onceSonraVar, "pdf-ustasi");
    expect(y2).toContain("# önce");
    expect(y2).toContain("# Sahibin notu");
    expect(parse(y2).gorseller).toEqual({
      onceSonra: ["gorseller/pdf-ustasi/a.png"],
      ikon: "gorseller/pdf-ustasi/ikon.svg",
      kapak: "gorseller/pdf-ustasi/kapak.svg",
    });

    // CRLF korunur.
    const crlf = kayitGorselEkle(YAML.replace(/\n/g, "\r\n"), "pdf-ustasi");
    expect(crlf).toBe(beklenen.replace(/\n/g, "\r\n"));

    // Dosya üzerinden: kayıt güncellenir, sıra ve yorumlar kalır.
    const d = await klasorKur();
    const s = await gorselleriUret({ kayitKlasoru: d.kayitlar, gorselKlasoru: d.gorseller });
    expect(s.guncellenenKayit).toEqual(["pdf-ustasi"]);
    expect(await readFile(join(d.kayitlar, "pdf-ustasi.yaml"), "utf8")).toBe(beklenen);
    expect((await readdir(d.kayitlar)).sort()).toEqual(["pdf-ustasi.yaml"]);
  });

  it("her_kategoriye_renk", () => {
    for (const k of KATEGORILER) {
      const r = KATEGORI_RENKLERI[k.id];
      expect(r.zemin).toMatch(/^#[0-9a-f]{6}$/);
      expect(r.yazi).toMatch(/^#[0-9a-f]{6}$/);
      const svg = ikonSvg(kayit({ kategori: k.id }));
      expect(svg).toContain(r.yazi);
      expect(kapakSvg(kayit({ kategori: k.id }))).toContain(r.yazi);
    }
    // Uygulamanın tokenlar.css değerleriyle aynı.
    expect(KATEGORI_RENKLERI["belge-ofis"]).toEqual({ zemin: "#f3c9b3", yazi: "#7a3214" });
    expect(KATEGORI_RENKLERI.guvenlik).toEqual({ zemin: "#c4dcf5", yazi: "#1b4a7d" });
    expect(new Set(KATEGORILER.map((k) => KATEGORI_RENKLERI[k.id].zemin)).size).toBe(KATEGORILER.length);
    expect(ikonSvg(kayit())).toContain("#e2672f");
  });

  it("piktogram_esleme", async () => {
    for (const p of Object.values(ESLEME)) expect(PIKTOGRAMLAR[p]).toBeDefined();
    // Katalogdaki her kayıt açık bir eşlemeye sahip.
    const ids = (await readdir(join(import.meta.dirname, "..", "kayitlar"))).filter((f) => f.endsWith(".yaml")).map((f) => f.slice(0, -5));
    for (const id of ids) expect(ESLEME[id], id).toBeDefined();
    // Eşlemesi olmayan: anahtar kelime, sonra kategori varsayılanı.
    expect(piktogramSec(kayit({ id: "yeni-test-araci", ad: "Yeni", kategori: "diger" }))).toBe("test-tupu");
    expect(piktogramSec(kayit({ id: "zzz", ad: "Zzz", kategori: "guvenlik" }))).toBe("kalkan");
  });
});

/** Basit iyi biçimlilik denetimi: etiketler dengeli, kaçışsız & yok. */
function parseXmlBasit(svg: string): boolean {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(svg)) return false;
  const yigin: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) {
      if (yigin.pop() !== m[2]) return false;
    } else yigin.push(m[2]);
  }
  return yigin.length === 0;
}
