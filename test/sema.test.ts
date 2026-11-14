import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { KayitSemasi } from "../scripts/sema.js";
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
