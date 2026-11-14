import { describe, it, expect, afterEach, vi } from "vitest";
import { BulunamadiHatasi, ErisimEngelliHatasi, KesikAgacHatasi, dosyaListesi, githubAdresleri, githubGetirici, lisansBelirle } from "../scripts/getirici.js";
import { skillMdAyristir } from "../scripts/skillMd.js";
import { sahteGetirici } from "./sahteGetirici.js";

const SHA = "a".repeat(40);

describe("dosyaListesi", () => {
  it("dosyaListesi_ozyinelemeli", () => {
    const agac = [
      { yol: "skills/pdf/SKILL.md", tur: "blob" as const, boyut: 10 },
      { yol: "skills/pdf/scripts", tur: "tree" as const, boyut: 0 },
      { yol: "skills/pdf/scripts/a.py", tur: "blob" as const, boyut: 20 },
      { yol: "skills/pdf/scripts/lib/b.py", tur: "blob" as const, boyut: 30 },
      { yol: "skills/docx/SKILL.md", tur: "blob" as const, boyut: 40 },
    ];
    expect(dosyaListesi(agac, "skills/pdf").map((d) => d.yol)).toEqual(["SKILL.md", "scripts/a.py", "scripts/lib/b.py"]);
    expect(dosyaListesi(agac, "skills/pdf").map((d) => d.boyut)).toEqual([10, 20, 30]);
  });

  it("dosyaListesi_ad_oneki_ayni_klasoru_karistirmaz", () => {
    const agac = [
      { yol: "skills/pdf/SKILL.md", tur: "blob" as const, boyut: 1 },
      { yol: "skills/pdf-pro/SKILL.md", tur: "blob" as const, boyut: 2 },
      { yol: "skills/pdf", tur: "tree" as const, boyut: 0 },
    ];
    expect(dosyaListesi(agac, "skills/pdf")).toEqual([{ yol: "SKILL.md", boyut: 1 }]);
  });

  it("dosyaListesi_sirali", () => {
    const agac = [
      { yol: "s/z.md", tur: "blob" as const, boyut: 1 },
      { yol: "s/SKILL.md", tur: "blob" as const, boyut: 1 },
      { yol: "s/a/b.md", tur: "blob" as const, boyut: 1 },
    ];
    expect(dosyaListesi(agac, "s").map((d) => d.yol)).toEqual(["SKILL.md", "a/b.md", "z.md"]);
  });
});

describe("lisansBelirle", () => {
  it("lisans_skill_klasorundeki_dosyadan", () => {
    const dosyalar = [{ yol: "SKILL.md" }, { yol: "LICENSE.txt" }];
    expect(lisansBelirle("Apache-2.0", dosyalar, "© Anthropic. All rights reserved... source-available")).toEqual({
      spdx: null,
      durum: "kisitli",
    });
  });

  it("lisans_repo_apache", () => {
    expect(lisansBelirle("Apache-2.0", [{ yol: "SKILL.md" }])).toEqual({ spdx: "Apache-2.0", durum: "acik" });
  });

  it("lisans_yok", () => {
    expect(lisansBelirle(null, [{ yol: "SKILL.md" }]).durum).toBe("yok");
    expect(lisansBelirle("NOASSERTION", [{ yol: "SKILL.md" }])).toEqual({ spdx: null, durum: "yok" });
  });

  it("lisans_klasordeki_acik_metinden_spdx", () => {
    const d = [{ yol: "LICENSE" }];
    expect(lisansBelirle(null, d, "Apache License\nVersion 2.0, January 2004")).toEqual({ spdx: "Apache-2.0", durum: "acik" });
    expect(lisansBelirle(null, d, "MIT License\n\nCopyright (c) 2026")).toEqual({ spdx: "MIT", durum: "acik" });
    expect(lisansBelirle(null, d, "BSD 3-Clause License\nNeither the name of")).toEqual({ spdx: "BSD-3-Clause", durum: "acik" });
    expect(lisansBelirle(null, d, "BSD 2-Clause License")).toEqual({ spdx: "BSD-2-Clause", durum: "acik" });
  });

  it("lisans_baska_lisans_adini_anan_kapali_metin_kisitli", () => {
    const d = [{ yol: "LICENSE.txt" }];
    const kapali =
      "Proprietary License\n\n© Anthropic, PBC. All rights reserved.\nThis software is source-available only.\n\n" +
      "You may not redistribute it.\n\nThird-party components are distributed under the MIT License and BSD terms.";
    expect(lisansBelirle(null, d, kapali)).toEqual({ spdx: null, durum: "kisitli" });
    expect(lisansBelirle(null, d, 'Copyright 2026 X\n\nLicensed under the Apache License, Version 2.0 (the "License");')).toEqual({
      spdx: "Apache-2.0",
      durum: "acik",
    });
  });

  it("lisans_klasorde_dosya_var_metin_yok_kisitli", () => {
    expect(lisansBelirle("MIT", [{ yol: "LICENSE.md" }])).toEqual({ spdx: null, durum: "kisitli" });
  });

  it("lisans_alt_klasordeki_dosya_sayilmaz", () => {
    expect(lisansBelirle("MIT", [{ yol: "vendor/LICENSE" }], "All rights reserved")).toEqual({ spdx: "MIT", durum: "acik" });
  });
});

describe("skillMdAyristir", () => {
  it("skillMd_frontmatter", () => {
    expect(skillMdAyristir("---\nname: pdf\ndescription: PDF işleri\nversion: 1.4\n---\n# Başlık")).toEqual({
      ad: "pdf",
      aciklama: "PDF işleri",
      surum: "1.4",
      govde: "# Başlık",
    });
  });

  it("skillMd_surum_sayi_gibi_bozulmaz", () => {
    expect(skillMdAyristir("---\nversion: 1.10\n---\nx").surum).toBe("1.10");
  });

  it("skillMd_frontmatter_yok", () => {
    expect(skillMdAyristir("# Sadece gövde\n")).toEqual({ govde: "# Sadece gövde\n" });
  });

  it("skillMd_crlf_ve_bom", () => {
    expect(skillMdAyristir("﻿---\r\nname: pdf\r\n---\r\n# B\r\n")).toEqual({ ad: "pdf", govde: "# B\n" });
  });

  it("skillMd_bozuk_yaml_govdeyi_korur", () => {
    expect(skillMdAyristir("---\nname: [kapanmamis\n---\n# B")).toEqual({ govde: "# B" });
  });

  it("skillMd_js_frontmatter_calistirilmaz", () => {
    const g = globalThis as Record<string, unknown>;
    delete g.__skillMdIsaret;
    const cikis = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    try {
      const girdi = "---js\nprocess.exit(1)\n---\nGövde";
      expect(skillMdAyristir(girdi)).toEqual({ govde: girdi });
      expect(cikis).not.toHaveBeenCalled();
      for (const dil of ["js", "javascript", "coffee", " js"]) {
        const sonuc = skillMdAyristir(`---${dil}\nglobalThis.__skillMdIsaret = 1; ({ name: "x" })\n---\nGövde`);
        expect(sonuc.ad).toBeUndefined();
        expect(g.__skillMdIsaret).toBeUndefined();
      }
    } finally {
      cikis.mockRestore();
    }
  });

  it("skillMd_kapanmayan_frontmatter_govde_sayilir", () => {
    expect(skillMdAyristir("---\nname: x\n# B")).toEqual({ govde: "---\nname: x\n# B" });
  });

  it("skillMd_bos_frontmatter_ve_bosluklu_ayrac", () => {
    expect(skillMdAyristir("---\n---\n# B")).toEqual({ govde: "# B" });
    expect(skillMdAyristir("--- \nname: pdf\n---\t\n# B")).toEqual({ ad: "pdf", govde: "# B" });
  });

  it("skillMd_metin_olmayan_alanlar_atlanir", () => {
    expect(skillMdAyristir("---\nname:\n  - a\ndescription: ''\n---\nx")).toEqual({ govde: "x" });
  });
});

describe("githubAdresleri", () => {
  it("adresler_dogru_kurulur", () => {
    expect(githubAdresleri.commit("anthropics/skills", SHA)).toBe(`https://api.github.com/repos/anthropics/skills/commits/${SHA}`);
    expect(githubAdresleri.sonCommit("anthropics/skills", "release/v1", "skills/my skill")).toBe(
      "https://api.github.com/repos/anthropics/skills/commits?sha=release%2Fv1&path=skills%2Fmy+skill&per_page=1",
    );
    expect(githubAdresleri.agac("anthropics/skills", SHA)).toBe(
      `https://api.github.com/repos/anthropics/skills/git/trees/${SHA}?recursive=1`,
    );
    expect(githubAdresleri.repo("anthropics/skills")).toBe("https://api.github.com/repos/anthropics/skills");
    expect(githubAdresleri.dosya("anthropics/skills", SHA, "skills/my skill/SKILL.md")).toBe(
      `https://raw.githubusercontent.com/anthropics/skills/${SHA}/skills/my%20skill/SKILL.md`,
    );
  });
});

describe("githubGetirici (fetch taklit edilir, ağa çıkılmaz)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const aninda = async (_ms: number) => {};

  function fetchTaklidi(yanitlar: Record<string, { durum?: number; govde: unknown; basliklar?: Record<string, string> }>) {
    const sahte = vi.fn(async (url: string, _init?: RequestInit) => {
      const y = yanitlar[url];
      if (!y) return new Response("yok", { status: 404 });
      const govde = typeof y.govde === "string" ? y.govde : JSON.stringify(y.govde);
      return new Response(govde, { status: y.durum ?? 200, headers: y.basliklar });
    });
    vi.stubGlobal("fetch", sahte);
    return sahte;
  }

  it("getirici_yanitlari_donusturur_ve_token_gonderir", async () => {
    const repo = "anthropics/skills";
    const sahte = fetchTaklidi({
      [githubAdresleri.commit(repo, SHA)]: { govde: { sha: SHA, commit: { committer: { date: "2026-11-10T09:00:00Z" } } } },
      [githubAdresleri.sonCommit(repo, "main", "skills/pdf")]: {
        govde: [{ sha: "b".repeat(40), commit: { committer: { date: "2026-11-12T09:00:00Z" } } }],
      },
      [githubAdresleri.agac(repo, SHA)]: {
        govde: {
          truncated: false,
          tree: [
            { path: "skills/pdf", type: "tree" },
            { path: "skills/pdf/SKILL.md", type: "blob", size: 12 },
            { path: "vendor/alt", type: "commit" },
          ],
        },
      },
      [githubAdresleri.repo(repo)]: { govde: { stargazers_count: 42, owner: { login: "anthropics" }, license: { spdx_id: "Apache-2.0" } } },
      [githubAdresleri.dosya(repo, SHA, "skills/pdf/SKILL.md")]: { govde: "# PDF" },
    });
    const g = githubGetirici("gizli");

    expect(await g.commit(repo, SHA)).toEqual({ sha: SHA, tarih: "2026-11-10T09:00:00Z" });
    expect(await g.sonCommit(repo, "main", "skills/pdf")).toEqual({ sha: "b".repeat(40), tarih: "2026-11-12T09:00:00Z" });
    expect(await g.agac(repo, SHA)).toEqual([
      { yol: "skills/pdf", tur: "tree", boyut: 0 },
      { yol: "skills/pdf/SKILL.md", tur: "blob", boyut: 12 },
    ]);
    expect(await g.repoBilgi(repo)).toEqual({ yildiz: 42, sahip: "anthropics", lisansSpdx: "Apache-2.0" });
    expect(await g.dosya(repo, SHA, "skills/pdf/SKILL.md")).toBe("# PDF");

    expect(sahte).toHaveBeenCalledTimes(5);
    for (const cagri of sahte.mock.calls) {
      expect(new Headers(cagri[1]?.headers).get("Authorization")).toBe("Bearer gizli");
    }
  });

  it("getirici_tokensiz_authorization_gondermez", async () => {
    const sahte = fetchTaklidi({ [githubAdresleri.repo("a/b")]: { govde: { stargazers_count: 0, owner: { login: "a" }, license: null } } });
    expect(await githubGetirici().repoBilgi("a/b")).toEqual({ yildiz: 0, sahip: "a", lisansSpdx: null });
    expect(new Headers(sahte.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });

  it("getirici_404_bulunamadi_hatasi", async () => {
    fetchTaklidi({});
    await expect(githubGetirici().dosya("a/b", SHA, "x.md")).rejects.toBeInstanceOf(BulunamadiHatasi);
  });

  it("getirici_diger_hatalar_genel_hata", async () => {
    fetchTaklidi({ [githubAdresleri.repo("a/b")]: { durum: 500, govde: "patladı" } });
    const hata = await githubGetirici(undefined, { bekle: aninda }).repoBilgi("a/b").catch((e) => e);
    expect(hata).toBeInstanceOf(Error);
    expect(hata).not.toBeInstanceOf(BulunamadiHatasi);
    expect(hata.message).toMatch(/500/);
  });

  it("getirici_repoya_ozel_kalici_engel_erisim_engelli_hatasi", async () => {
    // 451 (DMCA), 410 ve kota başlığı taşımayan 403 ("Repository access blocked") yalnız o repoyu ilgilendirir.
    const url = githubAdresleri.repo("a/b");
    const durumlar: { durum: number; govde: unknown; basliklar?: Record<string, string> }[] = [
      { durum: 451, govde: { message: "Repository access blocked" } },
      { durum: 410, govde: { message: "Gone" } },
      { durum: 403, govde: { message: "Repository access blocked" }, basliklar: { "x-ratelimit-remaining": "4999" } },
    ];
    for (const y of durumlar) {
      fetchTaklidi({ [url]: y });
      const hata = await githubGetirici().repoBilgi("a/b").catch((e) => e);
      expect(hata, String(y.durum)).toBeInstanceOf(ErisimEngelliHatasi);
      expect(hata.message).toMatch(String(y.durum));
    }
  });

  it("getirici_kota_ve_yetki_hatalari_genel_hata", async () => {
    // Bunlar tüm derlemeyi ilgilendirir: kayıt atlatmamalı, derleme durmalı.
    const url = githubAdresleri.repo("a/b");
    const durumlar: { durum: number; govde: unknown; basliklar?: Record<string, string> }[] = [
      { durum: 403, govde: { message: "API rate limit exceeded" }, basliklar: { "x-ratelimit-remaining": "0" } },
      { durum: 403, govde: { message: "You have exceeded a secondary rate limit" } },
      { durum: 403, govde: "", basliklar: { "retry-after": "60" } },
      { durum: 429, govde: "Too Many Requests" },
      { durum: 401, govde: { message: "Bad credentials" } },
      { durum: 502, govde: "Bad Gateway" },
    ];
    for (const y of durumlar) {
      fetchTaklidi({ [url]: y });
      const hata = await githubGetirici(undefined, { bekle: aninda }).repoBilgi("a/b").catch((e) => e);
      expect(hata, String(y.durum)).toBeInstanceOf(Error);
      expect(hata, String(y.durum)).not.toBeInstanceOf(ErisimEngelliHatasi);
      expect(hata, String(y.durum)).not.toBeInstanceOf(BulunamadiHatasi);
    }
  });

  it("getirici_son_commit_bos_liste_bulunamadi", async () => {
    fetchTaklidi({ [githubAdresleri.sonCommit("a/b", "main", "yok")]: { govde: [] } });
    await expect(githubGetirici().sonCommit("a/b", "main", "yok")).rejects.toBeInstanceOf(BulunamadiHatasi);
  });

  it("getirici_kesik_agaci_reddeder", async () => {
    fetchTaklidi({ [githubAdresleri.agac("a/b", SHA)]: { govde: { truncated: true, tree: [] } } });
    await expect(githubGetirici().agac("a/b", SHA)).rejects.toThrow(/eksik/);
    fetchTaklidi({ [githubAdresleri.agac("a/b", SHA)]: { govde: { truncated: true, tree: [] } } });
    await expect(githubGetirici().agac("a/b", SHA)).rejects.toBeInstanceOf(KesikAgacHatasi);
  });

  it("getirici_gecici_5xx_yeniden_dener", async () => {
    const url = githubAdresleri.dosya("a/b", SHA, "x.md");
    const yanitlar = [
      () => new Response("Transfer-Encoding not supported", { status: 501 }),
      () => Promise.reject(new TypeError("fetch failed")),
      () => new Response("# tamam", { status: 200 }),
    ];
    const sahte = vi.fn(async (_url: string, _init?: RequestInit) => yanitlar[sahte.mock.calls.length - 1]());
    vi.stubGlobal("fetch", sahte);
    const beklemeler: number[] = [];
    const g = githubGetirici(undefined, { bekle: async (ms) => void beklemeler.push(ms) });
    expect(await g.dosya("a/b", SHA, "x.md")).toBe("# tamam");
    expect(sahte).toHaveBeenCalledTimes(3);
    expect(sahte.mock.calls.every((c) => c[0] === url)).toBe(true);
    expect(beklemeler).toEqual([1000, 3000]);
  });

  it("getirici_404_yeniden_denemez", async () => {
    for (const durum of [404, 403, 451, 410, 429]) {
      const sahte = fetchTaklidi({ [githubAdresleri.repo("a/b")]: { durum, govde: { message: "x" } } });
      const bekle = vi.fn(aninda);
      await githubGetirici(undefined, { bekle }).repoBilgi("a/b").catch(() => {});
      expect(sahte, String(durum)).toHaveBeenCalledTimes(1);
      expect(bekle, String(durum)).not.toHaveBeenCalled();
    }
  });

  it("getirici_uc_denemeden_sonra_hata", async () => {
    const sahte = fetchTaklidi({ [githubAdresleri.repo("a/b")]: { durum: 503, govde: "Service Unavailable" } });
    const hata = await githubGetirici(undefined, { bekle: aninda }).repoBilgi("a/b").catch((e) => e);
    expect(sahte).toHaveBeenCalledTimes(3);
    expect(hata).toBeInstanceOf(Error);
    expect(hata).not.toBeInstanceOf(BulunamadiHatasi);
    expect(hata.message).toMatch(/503/);

    const agHatasi = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    vi.stubGlobal("fetch", agHatasi);
    await expect(githubGetirici(undefined, { bekle: aninda }).repoBilgi("a/b")).rejects.toThrow(/fetch failed/);
    expect(agHatasi).toHaveBeenCalledTimes(3);
  });
});

describe("sahteGetirici", () => {
  it("sahte_agaci_dosyalardan_turetir_ve_cagrilari_kaydeder", async () => {
    const g = sahteGetirici({
      "a/b": { dosyalar: { [SHA]: { "s/SKILL.md": "ğ", "s/x/y.py": "1" } }, commitler: { [SHA]: "2026-11-10T09:00:00Z" } },
    });
    expect(await g.agac("a/b", SHA)).toEqual([
      { yol: "s", tur: "tree", boyut: 0 },
      { yol: "s/SKILL.md", tur: "blob", boyut: 2 },
      { yol: "s/x", tur: "tree", boyut: 0 },
      { yol: "s/x/y.py", tur: "blob", boyut: 1 },
    ]);
    expect(await g.dosya("a/b", SHA, "s/x/y.py")).toBe("1");
    await expect(g.dosya("a/b", SHA, "yok")).rejects.toBeInstanceOf(BulunamadiHatasi);
    await expect(g.commit("a/b", "c".repeat(40))).rejects.toBeInstanceOf(BulunamadiHatasi);
    expect(await g.repoBilgi("a/b")).toEqual({ yildiz: 0, sahip: "a", lisansSpdx: null });
    expect(g.cagrilar.map((c) => c.ad)).toEqual(["agac", "dosya", "dosya", "commit", "repoBilgi"]);
  });
});
