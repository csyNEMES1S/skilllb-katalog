import { describe, it, expect, vi } from "vitest";
import { ciktiYaz, derle } from "../scripts/derle.js";
import { ErisimEngelliHatasi, KesikAgacHatasi, type Getirici } from "../scripts/getirici.js";
import { KatalogSemasi, type Kayit } from "../scripts/sema.js";
import { sahteGetirici, type SahteVeri } from "./sahteGetirici.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const TABAN = "https://csynemes1s.github.io/skilllb-katalog/";

const SKILL_MD = "---\nname: pdf\ndescription: PDF işleri\nversion: 1.4\n---\n\n# PDF\n\nGövde metni.\n";

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

function veri(skillMd = SKILL_MD): SahteVeri {
  return {
    "anthropics/skills": {
      bilgi: { yildiz: 1234, sahip: "anthropics", lisansSpdx: "Apache-2.0" },
      commitler: { [A]: "2026-11-10T09:00:00Z", [B]: "2026-11-13T09:00:00Z" },
      sonCommitler: { main: { sha: B, tarih: "2026-11-13T09:00:00Z" } },
      dosyalar: {
        [A]: {
          "skills/pdf/SKILL.md": skillMd,
          "skills/pdf/scripts/birlestir.py": "import requests\n",
          "skills/pdf/reference.md": "ref",
          "skills/docx/SKILL.md": "---\nname: docx\n---\nDOCX\n",
        },
        [B]: { "skills/pdf/SKILL.md": "---\nversion: 9.9\n---\nYENİ\n" },
      },
    },
  };
}

const sessiz = () => {};

describe("derle", () => {
  it("derle_sabit_sha_kullanir", async () => {
    const g = sahteGetirici(veri());
    const k = await derle([kayit()], g, TABAN, sessiz);
    expect(k.skills[0].kaynak.sha).toBe(A);
    const dosyaCagrilari = g.cagrilar.filter((c) => c.ad === "dosya");
    expect(dosyaCagrilari.length).toBeGreaterThan(0);
    expect(dosyaCagrilari.every((c) => c.argumanlar[1] === A)).toBe(true);
    expect(g.cagrilar.filter((c) => c.ad === "agac" || c.ad === "commit").every((c) => c.argumanlar[1] === A)).toBe(true);
    expect(g.cagrilar.some((c) => c.ad === "sonCommit")).toBe(false);
  });

  it("derle_alanlari_doldurur", async () => {
    const k = await derle([kayit()], sahteGetirici(veri()), TABAN, sessiz);
    const s = k.skills[0];
    expect(s.surum).toBe("1.4");
    expect(s.readme).toBe("# PDF\n\nGövde metni.\n");
    expect(s.yazar).toBe("anthropics");
    expect(s.yildiz).toBe(1234);
    const toplam = [SKILL_MD, "import requests\n", "ref"].reduce((t, m) => t + Buffer.byteLength(m, "utf8"), 0);
    expect(s.boyut).toBe(toplam);
    expect(s.dosyalar.map((d) => d.yol)).toEqual(["SKILL.md", "reference.md", "scripts/birlestir.py"]);
    expect(s.kaynak.url).toBe(`https://github.com/anthropics/skills/tree/${A}/skills/pdf`);
    expect(s.guncellemeTarihi).toBe("2026-11-10T09:00:00Z");
    expect(s.lisans).toEqual({ spdx: "Apache-2.0", durum: "acik" });
    expect(s.guvenlik).toEqual({ betikler: ["scripts/birlestir.py"], agIpucu: true });
    expect(s.dogrulandi).toBe(false);
    expect(s.oneCikan).toBe(false);
    expect(s.haftaninSkilli).toBe(false);
    expect(s.otomatikGuncelle).toBe(false);
    expect(s.ornekler).toEqual([]);
    expect(s.benzerler).toEqual([]);
    expect(s.gorseller).toEqual({ onceSonra: [] });
    expect(s.nasilKullanilir).toEqual({});
  });

  it("derle_yalniz_betik_icerigini_indirir", async () => {
    const g = sahteGetirici(veri());
    await derle([kayit()], g, TABAN, sessiz);
    const yollar = g.cagrilar.filter((c) => c.ad === "dosya").map((c) => c.argumanlar[2]);
    expect(yollar.sort()).toEqual(["skills/pdf/SKILL.md", "skills/pdf/scripts/birlestir.py"]);
  });

  it("derle_surum_yoksa_tarih", async () => {
    const k = await derle([kayit()], sahteGetirici(veri("---\nname: pdf\n---\nGövde\n")), TABAN, sessiz);
    expect(k.skills[0].surum).toBe("2026-11-10");
  });

  it("derle_gorsel_goreli_yol_mutlak_olur", async () => {
    const k = await derle(
      [
        kayit({
          gorseller: {
            ikon: "gorseller/pdf/ikon.png",
            kapak: "https://ornek.com/kapak.png",
            onceSonra: ["gorseller/pdf/once.png", "https://ornek.com/sonra.png"],
          },
        }),
      ],
      sahteGetirici(veri()),
      TABAN,
      sessiz,
    );
    expect(k.skills[0].gorseller).toEqual({
      ikon: "https://csynemes1s.github.io/skilllb-katalog/gorseller/pdf/ikon.png",
      kapak: "https://ornek.com/kapak.png",
      onceSonra: ["https://csynemes1s.github.io/skilllb-katalog/gorseller/pdf/once.png", "https://ornek.com/sonra.png"],
    });
  });

  it("derle_eksik_kaynagi_atlar", async () => {
    const uyar = vi.fn();
    const kayitlar = [
      kayit({ kaynak: { repo: "anthropics/skills", yol: "skills/tasindi", dal: "main", sha: A } }),
      kayit({ id: "docx-ustasi", kaynak: { repo: "anthropics/skills", yol: "skills/docx", dal: "main", sha: A } }),
    ];
    const k = await derle(kayitlar, sahteGetirici(veri()), TABAN, uyar);
    expect(k.skills.map((s) => s.id)).toEqual(["docx-ustasi"]);
    expect(uyar).toHaveBeenCalledWith(expect.stringMatching(/pdf-ustasi/));
  });

  it("derle_bulunamayan_repoyu_atlar", async () => {
    const uyar = vi.fn();
    const kayitlar = [
      kayit({ id: "silinmis", kaynak: { repo: "yok/boyle", yol: "s", dal: "main", sha: A } }),
      kayit(),
    ];
    const k = await derle(kayitlar, sahteGetirici(veri()), TABAN, uyar);
    expect(k.skills.map((s) => s.id)).toEqual(["pdf-ustasi"]);
    expect(uyar).toHaveBeenCalledWith(expect.stringMatching(/silinmis/));
  });

  it("derle_kesik_agaci_atlar", async () => {
    const uyar = vi.fn();
    const sahte = sahteGetirici({
      ...veri(),
      "buyuk/repo": { commitler: { [A]: "2026-11-10T09:00:00Z" }, dosyalar: { [A]: { "s/SKILL.md": "x" } } },
    });
    const g: Getirici = {
      ...sahte,
      async agac(repo, sha) {
        if (repo === "buyuk/repo") throw new KesikAgacHatasi(`${repo}@${sha}: ağaç eksik (truncated)`);
        return sahte.agac(repo, sha);
      },
    };
    const kayitlar = [kayit({ id: "buyuk", kaynak: { repo: "buyuk/repo", yol: "s", dal: "main", sha: A } }), kayit()];
    const k = await derle(kayitlar, g, TABAN, uyar);
    expect(k.skills.map((s) => s.id)).toEqual(["pdf-ustasi"]);
    expect(uyar).toHaveBeenCalledWith(expect.stringMatching(/buyuk/));
  });

  it("derle_erisimi_engellenen_repoyu_atlar", async () => {
    // DMCA (451) gibi kalıcı, repoya özel bir engel bütün kataloğun yayınını sonsuza dek durdurmamalı.
    const uyar = vi.fn();
    const sahte = sahteGetirici(veri());
    const g: Getirici = {
      ...sahte,
      async agac(repo, sha) {
        if (repo === "engelli/repo") throw new ErisimEngelliHatasi(`erişim engelli (451): ${repo}`);
        return sahte.agac(repo, sha);
      },
    };
    const kayitlar = [kayit({ id: "engelli", kaynak: { repo: "engelli/repo", yol: "s", dal: "main", sha: A } }), kayit()];
    const k = await derle(kayitlar, g, TABAN, uyar);
    expect(k.skills.map((s) => s.id)).toEqual(["pdf-ustasi"]);
    expect(uyar).toHaveBeenCalledWith(expect.stringMatching(/engelli.*451/));
  });

  it("derle_beklenmeyen_hatada_durur", async () => {
    // Ağ / yetki / kota hataları kayıt atlatmaz: yarım bir katalog yayınlamaktansa derleme durur.
    const sahte = sahteGetirici(veri());
    const g: Getirici = { ...sahte, repoBilgi: async () => Promise.reject(new Error("GitHub isteği başarısız (403)")) };
    await expect(derle([kayit()], g, TABAN, sessiz)).rejects.toThrow(/403/);
  });

  it("derle_agac_ve_repo_bilgisi_onbellekli", async () => {
    const g = sahteGetirici(veri());
    await derle(
      [kayit(), kayit({ id: "docx-ustasi", kaynak: { repo: "anthropics/skills", yol: "skills/docx", dal: "main", sha: A } })],
      g,
      TABAN,
      sessiz,
    );
    expect(g.cagrilar.filter((c) => c.ad === "agac")).toHaveLength(1);
    expect(g.cagrilar.filter((c) => c.ad === "repoBilgi")).toHaveLength(1);
  });

  it("derle_lisans_dosyasi_metniyle_belirlenir", async () => {
    const v = veri();
    v["anthropics/skills"].dosyalar![A]["skills/pdf/LICENSE.txt"] = "© 2025 Anthropic, PBC. All rights reserved.\n";
    const g = sahteGetirici(v);
    const k = await derle([kayit()], g, TABAN, sessiz);
    expect(k.skills[0].lisans).toEqual({ spdx: null, durum: "kisitli" });
    expect(g.cagrilar.some((c) => c.ad === "dosya" && c.argumanlar[2] === "skills/pdf/LICENSE.txt")).toBe(true);

    const v2 = veri();
    v2["anthropics/skills"].dosyalar![A]["skills/pdf/LICENSE"] = "MIT License\n\nCopyright (c) 2025\n";
    const k2 = await derle([kayit()], sahteGetirici(v2), TABAN, sessiz);
    expect(k2.skills[0].lisans).toEqual({ spdx: "MIT", durum: "acik" });
  });

  it("derle_cikti_semaya_uyar", async () => {
    const k = await derle(
      [kayit({ gorseller: { ikon: "gorseller/pdf/ikon.png" }, benzerler: ["docx-ustasi"] }),
        kayit({ id: "docx-ustasi", kaynak: { repo: "anthropics/skills", yol: "skills/docx", dal: "main", sha: A } })],
      sahteGetirici(veri()),
      TABAN,
      sessiz,
    );
    expect(() => KatalogSemasi.parse(k)).not.toThrow();
    expect(k.surum).toBe(1);
    expect(k.skills).toHaveLength(2);
  });

  it("derle_benzerler_bilinmeyeni_atar", async () => {
    const uyar = vi.fn();
    const k = await derle([kayit({ benzerler: ["yok-boyle"] })], sahteGetirici(veri()), TABAN, uyar);
    expect(k.skills[0].benzerler).toEqual([]);
    expect(uyar).toHaveBeenCalledWith(expect.stringMatching(/yok-boyle/));
  });

  it("derle_benzerler_atlanan_skilli_atar", async () => {
    const uyar = vi.fn();
    const k = await derle(
      [kayit({ benzerler: ["tasinmis"] }), kayit({ id: "tasinmis", kaynak: { repo: "anthropics/skills", yol: "yok", dal: "main", sha: A } })],
      sahteGetirici(veri()),
      TABAN,
      uyar,
    );
    expect(k.skills.map((s) => s.id)).toEqual(["pdf-ustasi"]);
    expect(k.skills[0].benzerler).toEqual([]);
  });
});

describe("ciktiYaz", () => {
  it("derle_cikti_yazar_gorsel_ve_nojekyll", async () => {
    const { mkdtemp, mkdir, writeFile, readFile, stat } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const kok = await mkdtemp(join(tmpdir(), "derle çıktı "));
    await mkdir(join(kok, "gorseller", "pdf"), { recursive: true });
    await writeFile(join(kok, "gorseller", "pdf", "ikon.png"), "png");
    const k = await derle([kayit()], sahteGetirici(veri()), TABAN, sessiz);

    await ciktiYaz(k, join(kok, "dist", "catalog.json"), join(kok, "gorseller"));

    expect(KatalogSemasi.parse(JSON.parse(await readFile(join(kok, "dist", "catalog.json"), "utf8"))).skills).toHaveLength(1);
    expect(await readFile(join(kok, "dist", "gorseller", "pdf", "ikon.png"), "utf8")).toBe("png");
    expect((await stat(join(kok, "dist", ".nojekyll"))).size).toBe(0);
  });

  it("cikti_gorsel_kaynagini_silmez", async () => {
    // --cikti catalog.json verilirse hedef "./gorseller" kaynağın kendisi olur; rm onu silmemeli.
    const { mkdtemp, mkdir, writeFile, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const kok = await mkdtemp(join(tmpdir(), "derle "));
    await mkdir(join(kok, "gorseller", "pdf"), { recursive: true });
    await writeFile(join(kok, "gorseller", "pdf", "ikon.png"), "png");
    const k = await derle([kayit()], sahteGetirici(veri()), TABAN, sessiz);
    await expect(ciktiYaz(k, join(kok, "catalog.json"), join(kok, "gorseller"))).rejects.toThrow(/gorseller/);
    await expect(ciktiYaz(k, join(kok, "gorseller", "pdf", "catalog.json"), join(kok, "gorseller"))).rejects.toThrow(/gorseller/);
    expect(await readFile(join(kok, "gorseller", "pdf", "ikon.png"), "utf8")).toBe("png");
  });

  it("cikti_gorsellerde_sembolik_baglanti_reddedilir", async () => {
    // Bağlantı dist'e kopyalanırsa Pages paketi (tar --dereference) repo dışındaki dosyayı yayınlayabilir.
    const { mkdtemp, mkdir, writeFile, symlink, stat } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const kok = await mkdtemp(join(tmpdir(), "derle "));
    await mkdir(join(kok, "gizli"), { recursive: true });
    await writeFile(join(kok, "gizli", "anahtar.txt"), "sir");
    await mkdir(join(kok, "gorseller"), { recursive: true });
    await symlink(join(kok, "gizli"), join(kok, "gorseller", "baglanti"), "junction");
    const k = await derle([kayit()], sahteGetirici(veri()), TABAN, sessiz);
    await expect(ciktiYaz(k, join(kok, "dist", "catalog.json"), join(kok, "gorseller"))).rejects.toThrow(/sembolik/);
    await expect(stat(join(kok, "dist", "catalog.json"))).rejects.toThrow();
  });

  it("derle_gorsel_klasoru_yoksa_sorun_yok", async () => {
    const { mkdtemp, readFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const kok = await mkdtemp(join(tmpdir(), "derle "));
    const k = await derle([kayit()], sahteGetirici(veri()), TABAN, sessiz);
    await ciktiYaz(k, join(kok, "dist", "catalog.json"), join(kok, "gorseller"));
    expect(JSON.parse(await readFile(join(kok, "dist", "catalog.json"), "utf8")).surum).toBe(1);
  });
});
