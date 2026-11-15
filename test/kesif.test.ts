import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { adaylariBul, kategoriTahmin, kesifGovdesi, skillKlasorleri, taslakYaml, yerelKaynaklar, type RepoSonucu } from "../scripts/kesif.js";
import { KayitSemasi, type Kayit } from "../scripts/sema.js";
import { sahteGetirici } from "./sahteGetirici.js";

const SHA = "a".repeat(40);
const SHA2 = "b".repeat(40);
const uzunGovde = "Bu skill bir işi adım adım yapar. ".repeat(10);
const skillMd = (ad: string, aciklama: string) => `---\nname: ${ad}\ndescription: ${aciklama}\n---\n\n${uzunGovde}`;

const mevcutKayit = (id: string, repo: string, yol: string): Kayit => ({
  id, ad: id, kisaAciklama: "x", neIseYarar: ["a"], kategori: "diger",
  kaynak: { repo, yol, dal: "main", sha: SHA }, ornekCumleler: ["x"],
  uyumluluk: { claude: { durum: "calisir", sahibiDenedi: false }, antigravity: { durum: "bilinmiyor", sahibiDenedi: false } },
});

describe("skillKlasorleri", () => {
  it("SKILL.md içeren klasörleri bulur; kök, node_modules ve yarım klasörleri atlar", () => {
    const agac = [
      { yol: "SKILL.md", tur: "blob" as const, boyut: 1 },
      { yol: "skills/a/SKILL.md", tur: "blob" as const, boyut: 1 },
      { yol: "skills/b/README.md", tur: "blob" as const, boyut: 1 },
      { yol: "node_modules/x/SKILL.md", tur: "blob" as const, boyut: 1 },
      { yol: "skills/in-progress/c/SKILL.md", tur: "blob" as const, boyut: 1 },
      { yol: ".agents/skills/d/SKILL.md", tur: "blob" as const, boyut: 1 },
    ];
    expect(skillKlasorleri(agac)).toEqual(["skills/a"]);
  });
});

describe("skillKlasorleri tekrarları", () => {
  it("aynı adlı klasörlerden birini tutar; noktalı klasörleri yalnız başka skill yoksa alır", () => {
    const b = (yol: string) => ({ yol, tur: "blob" as const, boyut: 1 });
    expect(skillKlasorleri([b("skills/x/SKILL.md"), b(".openclaw/skills/x/SKILL.md"), b(".agents/skills/ic/SKILL.md")])).toEqual(["skills/x"]);
    expect(skillKlasorleri([b(".agents/skills/tek/SKILL.md"), b(".claude/skills/tek/SKILL.md")])).toEqual([".agents/skills/tek"]);
  });
});

describe("kategoriTahmin", () => {
  it("açıklamadaki sözcüklerden kategori seçer", () => {
    expect(kategoriTahmin("Security audit for web apps")).toBe("guvenlik");
    expect(kategoriTahmin("Write unit tests and debug failures")).toBe("kod-test");
    expect(kategoriTahmin("Create PDF and Word documents")).toBe("belge-ofis");
    expect(kategoriTahmin("Design beautiful UI")).toBe("tasarim");
    expect(kategoriTahmin("Something else")).toBe("diger");
  });
});

describe("adaylariBul", () => {
  const sonuclar: RepoSonucu[] = [
    { repo: "ali/iyi", dal: "main", yildiz: 500, lisansSpdx: "MIT" },
    { repo: "ali/lisanssiz", dal: "main", yildiz: 900, lisansSpdx: null },
    { repo: "ali/az", dal: "main", yildiz: 3, lisansSpdx: "MIT" },
  ];
  const veri = {
    "ali/iyi": {
      sonCommitler: { main: { sha: SHA2, tarih: "2026-11-01T00:00:00Z" } },
      agaclar: {
        main: [
          { yol: "skills/yeni/SKILL.md", tur: "blob" as const, boyut: 10 },
          { yol: "skills/yeni/run.py", tur: "blob" as const, boyut: 10 },
          { yol: "skills/eski/SKILL.md", tur: "blob" as const, boyut: 10 },
          { yol: "skills/bos/SKILL.md", tur: "blob" as const, boyut: 10 },
        ],
      },
      dosyalar: {
        main: {
          "skills/yeni/SKILL.md": skillMd("yeni", "Writes tests for your code. Finds bugs fast."),
          "skills/yeni/run.py": "import requests\n",
          "skills/bos/SKILL.md": "---\nname: bos\n---\nkısa",
        },
      },
    },
    "ali/az": { agaclar: { main: [{ yol: "s/SKILL.md", tur: "blob" as const, boyut: 1 }] } },
  };

  it("lisanssız, az yıldızlı, katalogda olan ve yarım skill'leri eler; betik ve ağ ipucunu bildirir", async () => {
    const g = sahteGetirici(veri);
    const kayitlar = [mevcutKayit("eski", "ali/iyi", "skills/eski")];
    const adaylar = await adaylariBul(async () => sonuclar, g, kayitlar, { sorgular: ["x"], enAzYildiz: 50 });
    expect(adaylar).toHaveLength(1);
    expect(adaylar[0]).toMatchObject({
      id: "yeni", repo: "ali/iyi", yol: "skills/yeni", dal: "main", sha: SHA2,
      yildiz: 500, lisans: "MIT", betikler: ["run.py"], agIpucu: true,
    });
  });

  it("katalogdaki bir skill'in aynı repodaki başka klasördeki kopyasını atlar", async () => {
    const g = sahteGetirici(veri);
    const kayitlar = [mevcutKayit("yeni-skill", "ALI/iyi", "baska/yer/yeni")];
    const adaylar = await adaylariBul(async () => sonuclar, g, kayitlar, { sorgular: ["x"], enAzYildiz: 50 });
    expect(adaylar).toEqual([]);
  });

  it("id katalogda varsa sahip önekiyle ayırır ve sınırı uygular", async () => {
    const g = sahteGetirici(veri);
    const kayitlar = [mevcutKayit("yeni", "baska/repo", "skills/yeni")];
    const adaylar = await adaylariBul(async () => sonuclar, g, kayitlar, { sorgular: ["x"], enAzYildiz: 50, sinir: 5 });
    expect(adaylar.map((a) => a.id)).toEqual(["ali-yeni"]);
    const hic = await adaylariBul(async () => sonuclar, sahteGetirici(veri), [], { sorgular: ["x"], enAzYildiz: 50, sinir: 0 });
    expect(hic).toEqual([]);
  });

  it("yollar verilen repoda yalnız o klasörlere bakar", async () => {
    const g = sahteGetirici(veri);
    const adaylar = await adaylariBul(async () => [], g, [], {
      sorgular: [], enAzYildiz: 50, ekRepolar: [sonuclar[0]], yollar: { "ALI/Iyi": ["skills/bos"] },
    });
    expect(adaylar).toEqual([]);
  });

  it("hariç listesindeki (reddedilmiş) skill'leri önermez", async () => {
    const adaylar = await adaylariBul(async () => sonuclar, sahteGetirici(veri), [], {
      sorgular: ["x"], enAzYildiz: 50, haric: ["Ali/IYI:skills/yeni"],
    });
    expect(adaylar).toEqual([]);
  });

  it("bir reponun hatası yalnız o repoyu atlar", async () => {
    const g = sahteGetirici(veri);
    const uyarilar: string[] = [];
    const adaylar = await adaylariBul(
      async () => [{ repo: "yok/repo", dal: "main", yildiz: 999, lisansSpdx: "MIT" }, sonuclar[0]],
      g, [], { sorgular: ["x"], enAzYildiz: 50 }, (m) => uyarilar.push(m),
    );
    expect(adaylar.map((a) => a.id)).toEqual(["yeni"]);
    expect(uyarilar[0]).toContain("yok/repo");
  });
});

describe("taslakYaml", () => {
  it("şemadan geçen bir kayıt üretir", () => {
    const yaml = taslakYaml({
      id: "yeni", repo: "ali/iyi", yol: "skills/yeni", dal: "main", sha: SHA2, ad: "yeni-skill",
      aciklama: "Writes tests for your code. Finds bugs fast. Very helpful for teams that ship often and want a long sentence here.",
      lisans: "MIT", yildiz: 5, betikler: [], agIpucu: false,
    });
    expect(yaml.startsWith("# TASLAK")).toBe(true);
    expect(yaml).not.toMatch(/[&*]a\d/); // elle düzeltilecek; YAML takma adı olmamalı
    const kayit = KayitSemasi.parse(parse(yaml));
    expect(kayit.kisaAciklama.length).toBeLessThanOrEqual(60);
    expect(kayit.neIseYarar).toHaveLength(3);
    expect(kayit.kategori).toBe("kod-test");
    expect(kayit.en?.ad).toBe("Yeni Skill");
    expect(kayit.dogrulandi).toBe(false);
  });
});

describe("kesifGovdesi", () => {
  it("adayları tabloya yazar ve ağ ipucunu uyarır; üçüncü taraf metni kaçışlar", () => {
    const govde = kesifGovdesi([
      { id: "yeni", repo: "ali/iyi", yol: "skills/yeni", dal: "main", sha: SHA2, aciklama: "a | <b>", lisans: "MIT", yildiz: 5, betikler: ["run.py"], agIpucu: true },
    ]);
    expect(govde).toContain("ali/iyi");
    expect(govde).toContain("⚠");
    // Tablo ayracı "|" bozulmaz, HTML satır içi kod içinde kalır (Markdown onu işlemez).
    expect(govde).toContain("`a / <b>`");
  });
});

describe("yerelKaynaklar", () => {
  it("skills CLI kilit dosyasından GitHub kaynaklarını okur", () => {
    const kilit = JSON.stringify({
      skills: {
        a: { source: "ali/iyi", sourceType: "github", skillPath: "skills/a/SKILL.md" },
        b: { source: "x", sourceType: "local", skillPath: "SKILL.md" },
      },
    });
    expect(yerelKaynaklar(kilit)).toEqual([{ repo: "ali/iyi", yol: "skills/a" }]);
  });
});
