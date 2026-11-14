import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { KATEGORILER, KatalogSemasi, KayitSemasi } from "../scripts/sema.js";
import { kayitlariOku } from "../scripts/kayitOku.js";

function ornekKayit(): Record<string, any> {
  return {
    id: "pdf-ustasi",
    ad: "PDF Ustası",
    kisaAciklama: "PDF dosyalarını okur, birleştirir ve düzenler.",
    neIseYarar: ["PDF birleştirme", "Metin çıkarma"],
    kategori: "belge-ofis",
    kaynak: {
      repo: "anthropics/skills",
      yol: "skills/pdf",
      dal: "main",
      sha: "0123456789abcdef0123456789abcdef01234567",
    },
    gorseller: { ikon: "gorseller/pdf-ustasi/ikon.png", kapak: "https://example.com/kapak.png", onceSonra: [] },
    ornekCumleler: ["Şu iki PDF'i birleştir"],
    nasilKullanilir: { claude: ["Skill'i yükle"] },
    uyumluluk: {
      claude: { durum: "calisir", sahibiDenedi: true },
      antigravity: { durum: "bilinmiyor", neden: "Denenmedi", sahibiDenedi: false },
    },
    dogrulandi: true,
    oneCikan: false,
    haftaninSkilli: false,
    ornekler: [{ tur: "gorsel", baslik: "Birleştirilmiş PDF", url: "https://example.com/a.png" }],
    benzerler: ["docx-ustasi"],
    otomatikGuncelle: false,
  };
}

const geciciler: string[] = [];
async function geciciKlasor(dosyalar: Record<string, unknown>): Promise<string> {
  const klasor = await mkdtemp(join(tmpdir(), "skilllb-"));
  geciciler.push(klasor);
  for (const [ad, icerik] of Object.entries(dosyalar)) {
    await writeFile(join(klasor, ad), stringify(icerik), "utf8");
  }
  return klasor;
}
afterEach(async () => {
  while (geciciler.length) await rm(geciciler.pop()!, { recursive: true, force: true });
});

describe("KayitSemasi", () => {
  it("kayit_gecerli_ornek", () => {
    expect(() => KayitSemasi.parse(ornekKayit())).not.toThrow();
  });

  it("kayit_hatali_kategori_dosya_adiyla", async () => {
    const klasor = await geciciKlasor({ "pdf-ustasi.yaml": { ...ornekKayit(), kategori: "ofis" } });
    await expect(kayitlariOku(klasor)).rejects.toThrow(/pdf-ustasi\.yaml: kategori/);
  });

  it("kayit_id_dosya_adiyla_ayni_olmali", async () => {
    const klasor = await geciciKlasor({ "a.yaml": { ...ornekKayit(), id: "b" } });
    await expect(kayitlariOku(klasor)).rejects.toThrow(/a\.yaml: id/);
  });

  it("kayit_sha_40_hex", () => {
    const k = ornekKayit();
    k.kaynak.sha = "main";
    expect(KayitSemasi.safeParse(k).success).toBe(false);
  });

  it("kayit_repo_bicimi", () => {
    const k = ornekKayit();
    k.kaynak.repo = "../x";
    expect(KayitSemasi.safeParse(k).success).toBe(false);
  });

  it("kayit_yol_guvenli", () => {
    const k1 = ornekKayit();
    k1.kaynak.yol = "skills/../gizli";
    expect(KayitSemasi.safeParse(k1).success).toBe(false);
    const k2 = ornekKayit();
    k2.kaynak.yol = "/etc/passwd";
    expect(KayitSemasi.safeParse(k2).success).toBe(false);
  });
});

// ---- İnceleme sonrası eklenen testler ----

function ornekSkill(): Record<string, any> {
  const k = ornekKayit();
  return {
    ...k,
    kaynak: { ...k.kaynak, url: `https://github.com/anthropics/skills/tree/${k.kaynak.sha}/skills/pdf` },
    gorseller: { ikon: "https://example.com/ikon.png", onceSonra: [] },
    nasilKullanilir: { claude: ["Skill'i yükle"] },
    surum: "1.0.0",
    guncellemeTarihi: "2026-11-01T10:00:00Z",
    lisans: { spdx: "MIT", durum: "acik" },
    yildiz: 10,
    yazar: "anthropics",
    readme: "# PDF",
    dosyalar: [{ yol: "SKILL.md", boyut: 100 }, { yol: "scripts/a.py", boyut: 50 }],
    boyut: 150,
    guvenlik: { betikler: ["scripts/a.py"], agIpucu: false },
  };
}
function ornekKatalog(): Record<string, any> {
  return {
    surum: 1,
    olusturulma: "2026-11-14T00:00:00Z",
    kategoriler: KATEGORILER.map((k) => ({ ...k })),
    skills: [ornekSkill()],
  };
}

describe("KatalogSemasi ileriye uyumluluk", () => {
  it("katalog_gecerli_ornek", () => {
    expect(() => KatalogSemasi.parse(ornekKatalog())).not.toThrow();
  });

  it("katalog_bilinmeyen_alanlari_yoksayar", () => {
    const k = ornekKatalog();
    k.yeniUstAlan = 1;
    k.skills[0].yeniAlan = "x";
    k.skills[0].kaynak.yeni = true;
    k.skills[0].lisans.yeni = true;
    k.skills[0].uyumluluk.claude.yeni = true;
    k.skills[0].uyumluluk.cursor = { durum: "calisir", sahibiDenedi: true };
    k.skills[0].dosyalar[0].sha = "abc";
    k.skills[0].ornekler[0].sure = 12;
    expect(KatalogSemasi.safeParse(k).success).toBe(true);
  });

  it("katalog_yeni_kategori_eski_surumu_bozmaz", () => {
    const k = ornekKatalog();
    k.kategoriler.push({ id: "muzik", ad: "Müzik" });
    k.skills[0].kategori = "muzik";
    const sonuc = KatalogSemasi.parse(k);
    expect(sonuc.skills[0].kategori).toBe("diger");
    expect(sonuc.kategoriler).toEqual(KATEGORILER);
  });

  it("katalog_kategoriler_bicimsizse_reddeder", () => {
    const k = ornekKatalog();
    k.kategoriler = "x";
    expect(KatalogSemasi.safeParse(k).success).toBe(false);
  });

  it("katalog_dosya_yolu_kacaklari_reddedilir", () => {
    for (const yol of ["../x", "a/../b", "/x", "\\x", "a\\b", "a/./b", "a//b", ".", "a/", "C:/x", "C:x", "a/.. /b", "a/x\u0000"]) {
      const k = ornekKatalog();
      k.skills[0].dosyalar[0].yol = yol;
      expect(KatalogSemasi.safeParse(k).success, yol).toBe(false);
    }
  });
});

describe("KayitSemasi sıkılık ve kaçaklar", () => {
  it("kayit_bilinmeyen_alan_reddedilir", () => {
    const k = ornekKayit();
    k.kategory = "yazi";
    expect(KayitSemasi.safeParse(k).success).toBe(false);
  });

  it("kayit_otomatikGuncelle_varsayilan_false", () => {
    const k = ornekKayit();
    delete k.otomatikGuncelle;
    expect(KayitSemasi.parse(k).otomatikGuncelle).toBe(false);
  });

  it("kayit_yol_kacaklari", () => {
    for (const yol of ["a/./b", "a//b", "a\\..\\b", "skills\\pdf", ".", "skills/pdf/", "C:/x", "a/.. /b"]) {
      const k = ornekKayit();
      k.kaynak.yol = yol;
      expect(KayitSemasi.safeParse(k).success, yol).toBe(false);
    }
    const k = ornekKayit();
    k.kaynak.yol = "skills/my skill";
    expect(KayitSemasi.safeParse(k).success).toBe(true);
  });

  it("kayit_repo_kacaklari", () => {
    for (const repo of ["a/b/c", "./x", "a/.", "a/..", " a/b", "a /b", "a\\b"]) {
      const k = ornekKayit();
      k.kaynak.repo = repo;
      expect(KayitSemasi.safeParse(k).success, repo).toBe(false);
    }
  });

  it("kayit_sha_buyuk_harf_ve_kisa_reddedilir", () => {
    for (const sha of ["0123456789ABCDEF0123456789abcdef01234567", "0123456", "0123456789abcdef0123456789abcdef012345678"]) {
      const k = ornekKayit();
      k.kaynak.sha = sha;
      expect(KayitSemasi.safeParse(k).success, sha).toBe(false);
    }
  });

  it("kayit_dal_kacaklari", () => {
    for (const dal of ["../x", "a b", "-x", "a..b", "a\\b"]) {
      const k = ornekKayit();
      k.kaynak.dal = dal;
      expect(KayitSemasi.safeParse(k).success, dal).toBe(false);
    }
    const k = ornekKayit();
    k.kaynak.dal = "release/v1.2";
    expect(KayitSemasi.safeParse(k).success).toBe(true);
  });
});
