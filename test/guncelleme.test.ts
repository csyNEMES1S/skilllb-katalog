import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { ErisimEngelliHatasi, KesikAgacHatasi, githubAdresleri, githubGetirici, type AgacGirdisi, type Getirici } from "../scripts/getirici.js";
import { guncellemeleriBul, kayitDosyasiGuncelle, kayitShaGuncelle, mdKod } from "../scripts/guncelleme.js";
import type { Kayit } from "../scripts/sema.js";
import { sahteGetirici, type SahteVeri } from "./sahteGetirici.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const REPO = "anthropics/skills";

function kayit(ek: Partial<Kayit> = {}): Kayit {
  return {
    id: "pdf-ustasi",
    ad: "PDF Ustası",
    kisaAciklama: "PDF dosyalarıyla çalışır",
    neIseYarar: ["PDF birleştirir"],
    kategori: "belge-ofis",
    kaynak: { repo: REPO, yol: "skills/pdf", dal: "main", sha: A },
    ornekCumleler: ["Bu PDF'leri birleştir"],
    uyumluluk: {
      claude: { durum: "calisir", sahibiDenedi: true },
      antigravity: { durum: "bilinmiyor", sahibiDenedi: false },
    },
    ...ek,
  };
}

/** Eski (A) ve yeni (B) sürümleri dosya içeriklerinden kurar; son commit B. */
function veri(eski: Record<string, string>, yeni: Record<string, string>, ek: Partial<SahteVeri[string]> = {}): SahteVeri {
  const onekle = (d: Record<string, string>) => Object.fromEntries(Object.entries(d).map(([y, i]) => [`skills/pdf/${y}`, i]));
  return {
    [REPO]: {
      commitler: { [A]: "2026-11-10T09:00:00Z", [B]: "2026-11-13T09:00:00Z" },
      sonCommitler: { main: { sha: B, tarih: "2026-11-13T09:00:00Z" } },
      dosyalar: { [A]: onekle(eski), [B]: onekle(yeni) },
      ...ek,
    },
  };
}

const blob = (yol: string, boyut: number, sha?: string): AgacGirdisi => ({ yol: `skills/pdf/${yol}`, tur: "blob", boyut, ...(sha ? { sha } : {}) });

describe("guncellemeleriBul", () => {
  it("guncelleme_yok_ayni_sha", async () => {
    const v = veri({ "SKILL.md": "x" }, { "SKILL.md": "y" });
    v[REPO].sonCommitler = { main: { sha: A, tarih: "2026-11-10T09:00:00Z" } };
    expect(await guncellemeleriBul([kayit()], sahteGetirici(v))).toEqual([]);
  });

  it("guncelleme_dosya_farklari", async () => {
    const g = sahteGetirici(veri({ "SKILL.md": "eski", "a.py": "print(1)" }, { "SKILL.md": "yepyeni", "b.py": "print(2)" }));
    const [u] = await guncellemeleriBul([kayit()], g);
    expect(u.eklenen).toEqual(["b.py"]);
    expect(u.silinen).toEqual(["a.py"]);
    expect(u.degisen).toEqual(["SKILL.md"]);
    expect(u.yeniBetikler).toEqual(["b.py"]);
    expect(u.agIpucuYeni).toBe(false);
    expect(u.id).toBe("pdf-ustasi");
    expect(u.eskiSha).toBe(A);
    expect(u.yeniSha).toBe(B);
    expect(u.baslik).toBe("Güncelleme: PDF Ustası (aaaaaaa → bbbbbbb)");
    expect(u.govde).toContain("`b.py`");
    expect(u.govde).toContain("⚠ Yeni betik: `b.py`");
    expect(u.govde).toContain(`https://github.com/${REPO}/compare/${A}...${B}`);
    // Betik içerikleri yalnız betik dosyaları için indirilir.
    const indirilen = g.cagrilar.filter((c) => c.ad === "dosya").map((c) => c.argumanlar[2]);
    expect(indirilen.sort()).toEqual(["skills/pdf/a.py", "skills/pdf/b.py"]);
  });

  it("guncelleme_dal_adi_sabit", async () => {
    const [u] = await guncellemeleriBul([kayit()], sahteGetirici(veri({ "SKILL.md": "x" }, { "SKILL.md": "xy" })));
    expect(u.dal).toBe("guncelleme/pdf-ustasi-bbbbbbb");
  });

  it("guncelleme_ag_ipucu_yeni", async () => {
    const g = sahteGetirici(veri({ "SKILL.md": "x", "a.py": "print(1)" }, { "SKILL.md": "x", "a.py": "import requests\n" }));
    const [u] = await guncellemeleriBul([kayit()], g);
    expect(u.agIpucuYeni).toBe(true);
    expect(u.degisen).toEqual(["a.py"]);
    expect(u.yeniBetikler).toEqual([]);
    expect(u.govde).toContain("Ağ erişimi");
  });

  it("guncelleme_ag_ipucu_zaten_vardiysa_yeni_sayilmaz", async () => {
    const g = sahteGetirici(veri({ "SKILL.md": "x", "a.py": "import requests\n" }, { "SKILL.md": "x", "a.py": "import requests\nx=1\n" }));
    const [u] = await guncellemeleriBul([kayit()], g);
    expect(u.agIpucuYeni).toBe(false);
    expect(u.govde).not.toContain("Ağ erişimi");
  });

  it("guncelleme_blob_sha_ayni_boyutta_degisikligi_yakalar", async () => {
    const v = veri({}, {});
    v[REPO].agaclar = {
      [A]: [blob("SKILL.md", 10, "1".repeat(40)), blob("ref.md", 5, "3".repeat(40))],
      [B]: [blob("SKILL.md", 10, "2".repeat(40)), blob("ref.md", 7, "3".repeat(40))],
    };
    const [u] = await guncellemeleriBul([kayit()], sahteGetirici(v));
    // sha varken boyuta bakılmaz: SKILL.md (aynı boyut, farklı sha) değişti, ref.md (aynı sha) değişmedi.
    expect(u.degisen).toEqual(["SKILL.md"]);
  });

  it("guncelleme_sha_yoksa_boyuta_duser", async () => {
    const v = veri({}, {});
    v[REPO].agaclar = {
      [A]: [blob("SKILL.md", 10), blob("ref.md", 5)],
      [B]: [blob("SKILL.md", 10), blob("ref.md", 7)],
    };
    const [u] = await guncellemeleriBul([kayit()], sahteGetirici(v));
    expect(u.degisen).toEqual(["ref.md"]);
  });

  it("guncelleme_klasorde_fark_yoksa_atlanir", async () => {
    // Sabit sha, klasörü etkileyen son commit'ten yeniyse (ör. dalın başına sabitlenmiş) PR açılmamalı.
    const g = sahteGetirici(veri({ "SKILL.md": "x" }, { "SKILL.md": "x" }));
    expect(await guncellemeleriBul([kayit()], g)).toEqual([]);
  });

  it("guncelleme_yeni_surumde_skill_yoksa_atlar_ve_uyarir", async () => {
    const uyar = vi.fn();
    const v = veri({ "SKILL.md": "x" }, {});
    v[REPO].dosyalar![B] = { "baska/SKILL.md": "y" };
    expect(await guncellemeleriBul([kayit()], sahteGetirici(v), uyar)).toEqual([]);
    expect(uyar).toHaveBeenCalledWith(expect.stringMatching(/pdf-ustasi/));
  });

  it("guncelleme_bulunamayan_kaynagi_atlar_digerlerini_surdurur", async () => {
    const uyar = vi.fn();
    const v: SahteVeri = { ...veri({ "SKILL.md": "x" }, { "SKILL.md": "xy" }) };
    const sonuc = await guncellemeleriBul(
      [kayit({ id: "silinmis", kaynak: { repo: "yok/boyle", yol: "s", dal: "main", sha: A } }), kayit()],
      sahteGetirici(v),
      uyar,
    );
    expect(sonuc.map((u) => u.id)).toEqual(["pdf-ustasi"]);
    expect(uyar).toHaveBeenCalledWith(expect.stringMatching(/silinmis/));
  });

  it("guncelleme_engelli_ve_kesik_agaci_atlar", async () => {
    const temel = sahteGetirici(veri({ "SKILL.md": "x" }, { "SKILL.md": "xy" }));
    for (const hata of [new ErisimEngelliHatasi("451"), new KesikAgacHatasi("kesik")]) {
      const uyar = vi.fn();
      const g: Getirici = { ...temel, agac: async () => { throw hata; } };
      expect(await guncellemeleriBul([kayit()], g, uyar)).toEqual([]);
      expect(uyar).toHaveBeenCalledTimes(1);
    }
  });

  it("guncelleme_genel_hata_durdurur", async () => {
    const temel = sahteGetirici(veri({ "SKILL.md": "x" }, { "SKILL.md": "xy" }));
    const g: Getirici = { ...temel, sonCommit: async () => { throw new Error("GitHub kota/hız sınırı (403)"); } };
    await expect(guncellemeleriBul([kayit()], g, () => {})).rejects.toThrow(/kota/);
  });

  it("guncelleme_govde_dosya_adi_enjeksiyonu", async () => {
    const kotu = "x`\n- [tıkla](https://kotu.example) @birisi\r\n## Başlık`.md";
    const g = sahteGetirici(veri({ "SKILL.md": "x" }, { "SKILL.md": "x", [kotu]: "z", "``a`": "q" }));
    const [u] = await guncellemeleriBul([kayit()], g);
    const satirlar = u.govde.split("\n");
    expect(satirlar.some((s) => s.startsWith("- [tıkla]") || s.startsWith("## Başlık"))).toBe(false);
    expect(u.govde).not.toContain("\r");
    expect(u.eklenen).toContain(kotu); // veri olduğu gibi kalır, yalnız Markdown kaçışlıdır
  });
});

describe("mdKod", () => {
  it("mdKod_ters_tirnak_ve_satir_sonu_kacisli", () => {
    expect(mdKod("a.py")).toBe("`a.py`");
    expect(mdKod("a`b")).toBe("``a`b``");
    expect(mdKod("``x")).toBe("``` ``x ```");
    expect(mdKod("a\nb\r\tc")).toBe("`a\\nb\\r\\tc`");
    expect(mdKod("a\u2028b")).toBe("`a\\u2028b`");
  });
});

describe("kayitShaGuncelle", () => {
  it("kayitShaGuncelle_yorumu_korur", () => {
    const cikti = kayitShaGuncelle("# not\nkaynak:\n  sha: aaa\n", "bbb");
    expect(cikti).toContain("# not");
    expect(cikti).toContain("sha: bbb");
    expect(cikti).not.toContain("aaa");
  });

  it("kayitShaGuncelle_geri_kalani_birebir_korur", () => {
    const uzun = "ç".repeat(120);
    const metin = `# baş yorum\r\nid: pdf-ustasi\r\nkisaAciklama: ${uzun}\r\nkaynak:\r\n  repo: a/b # satır sonu yorumu\r\n  sha: "${A}"  # sabit\r\n  dal: main\r\n`;
    const cikti = kayitShaGuncelle(metin, B);
    expect(cikti).toBe(metin.replace(A, B));
    expect(parse(cikti).kaynak.sha).toBe(B);
  });

  it("kayitShaGuncelle_sayiya_benzeyen_sha_metin_kalir", () => {
    const sayisal = "1".repeat(40);
    const cikti = kayitShaGuncelle(`kaynak:\n  sha: ${A}\n`, sayisal);
    expect(parse(cikti).kaynak.sha).toBe(sayisal);
  });

  it("kayitShaGuncelle_sha_yoksa_hata", () => {
    expect(() => kayitShaGuncelle("kaynak:\n  repo: a/b\n", B)).toThrow(/sha/);
    expect(() => kayitShaGuncelle("id: x\n", B)).toThrow(/sha/);
  });
});

describe("kayitDosyasiGuncelle", () => {
  const YAML = `# Sahibin notu
id: pdf-ustasi
ad: PDF Ustası
kisaAciklama: PDF dosyalarıyla çalışır
neIseYarar: [PDF birleştirir]
kategori: belge-ofis
kaynak:
  repo: anthropics/skills
  yol: skills/pdf
  dal: main
  sha: ${A}
ornekCumleler: [Bu PDF'leri birleştir]
uyumluluk:
  claude: { durum: calisir, sahibiDenedi: true }
  antigravity: { durum: bilinmiyor, sahibiDenedi: false }
`;

  it("kayitDosyasiGuncelle_dosyayi_yazar", async () => {
    const klasor = await mkdtemp(join(tmpdir(), "güncelle kayıt "));
    await writeFile(join(klasor, "pdf-ustasi.yaml"), YAML, "utf8");
    await kayitDosyasiGuncelle(klasor, "pdf-ustasi", B);
    const yeni = await readFile(join(klasor, "pdf-ustasi.yaml"), "utf8");
    expect(yeni).toBe(YAML.replace(A, B));
  });

  it("kayitDosyasiGuncelle_gecersiz_id_ve_sha_reddedilir", async () => {
    const klasor = await mkdtemp(join(tmpdir(), "güncelle kayıt "));
    await writeFile(join(klasor, "pdf-ustasi.yaml"), YAML, "utf8");
    await expect(kayitDosyasiGuncelle(klasor, "../pdf-ustasi", B)).rejects.toThrow(/id/);
    await expect(kayitDosyasiGuncelle(klasor, "PDF", B)).rejects.toThrow(/id/);
    await expect(kayitDosyasiGuncelle(klasor, "pdf-ustasi", "main")).rejects.toThrow(/sha/);
    expect(await readFile(join(klasor, "pdf-ustasi.yaml"), "utf8")).toBe(YAML);
  });
});

describe("githubGetirici ağaç sha", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("getirici_agac_blob_sha_dondurur", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url !== githubAdresleri.agac(REPO, A)) return new Response("yok", { status: 404 });
      return new Response(JSON.stringify({
        truncated: false,
        tree: [
          { path: "skills/pdf", type: "tree", sha: "9".repeat(40) },
          { path: "skills/pdf/SKILL.md", type: "blob", size: 12, sha: "1".repeat(40) },
        ],
      }));
    }));
    expect(await githubGetirici().agac(REPO, A)).toEqual([
      { yol: "skills/pdf", tur: "tree", boyut: 0, sha: "9".repeat(40) },
      { yol: "skills/pdf/SKILL.md", tur: "blob", boyut: 12, sha: "1".repeat(40) },
    ]);
  });
});
