import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { githubGetirici } from "./getirici.js";
import { gunlukSatiri } from "./gunluk.js";
import { kayitlariOku } from "./kayitOku.js";
import { githubModelsSohbet, turkceTaslak } from "./cevir.js";
import { ACIK_LISANSLAR, adaylariBul, kesifGovdesi, taslakYaml, VARSAYILAN_SORGULAR, yerelKaynaklar, type RepoArayici, type RepoSonucu } from "./kesif.js";

/**
 * Kullanım:
 *   npm run kesif -- [--kayitlar kayitlar] [--cikti dist/kesif.json] [--govde dist/kesif.md]
 *                    [--sinir 10] [--en-az-yildiz 50] [--yaz] [--yerel ~/.agents/.skill-lock.json]
 *     GitHub'da kataloğa girmemiş, açık lisanslı skill'leri arar. Adayları JSON'a, PR gövdesini
 *     Markdown'a yazar. --yaz verilirse her aday için kayitlar/<id>.yaml taslağı oluşturur
 *     (var olan dosyaya dokunmaz). --yerel verilirse arama yerine yalnız o kilit dosyasındaki
 *     (bilgisayarda kurulu) skill'lere bakar. GITHUB_TOKEN varsa istekler onunla yapılır.
 *     --kuyruk kesif-kuyruk.txt: önce bu dosyadaki "sahip/ad:klasör" satırlarını sırayla işler (aramaya
 *     gitmez); --yaz ile incelenen satırlar dosyadan silinir. --cevir: taslak metinleri GitHub Models ile
 *     Türkçeye çevirir (yalnız GitHub Actions'ta, iş akışı token'ıyla); çeviri olmazsa İngilizce kalır.
 * Çıkış kodu: 0 = başarılı, 1 = hata.
 */

const API = "https://api.github.com";

function githubArayici(token?: string): RepoArayici {
  return async (sorgu) => {
    const url = `${API}/search/repositories?${new URLSearchParams({ q: `${sorgu} fork:false archived:false`, sort: "stars", order: "desc", per_page: "50" })}`;
    const basliklar: Record<string, string> = { "User-Agent": "skilllb-katalog", Accept: "application/vnd.github+json" };
    if (token) basliklar.Authorization = `Bearer ${token}`;
    const yanit = await fetch(url, { headers: basliklar });
    if (!yanit.ok) throw new Error(`GitHub araması başarısız (${yanit.status}): ${sorgu}`);
    const veri = (await yanit.json()) as {
      items: { full_name: string; default_branch: string; stargazers_count: number; license: { spdx_id: string | null } | null }[];
    };
    return veri.items.map((i): RepoSonucu => ({
      repo: i.full_name, dal: i.default_branch, yildiz: i.stargazers_count, lisansSpdx: i.license?.spdx_id ?? null,
    }));
  };
}

async function varMi(yol: string): Promise<boolean> {
  try {
    await access(yol);
    return true;
  } catch {
    return false;
  }
}

async function atomikYaz(yol: string, metin: string) {
  await mkdir(dirname(yol), { recursive: true });
  await writeFile(`${yol}.tmp`, metin, "utf8");
  await rename(`${yol}.tmp`, yol);
}

async function ana(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      kayitlar: { type: "string", default: "kayitlar" },
      cikti: { type: "string", default: "dist/kesif.json" },
      govde: { type: "string", default: "dist/kesif.md" },
      sinir: { type: "string", default: "10" },
      "en-az-yildiz": { type: "string", default: "50" },
      yaz: { type: "boolean", default: false },
      yerel: { type: "string" },
      kuyruk: { type: "string" },
      cevir: { type: "boolean", default: false },
    },
  });
  if (positionals.length) throw new Error(`beklenmeyen argüman: ${positionals.join(" ")}`);
  const sinir = Number(values.sinir);
  const enAzYildiz = Number(values["en-az-yildiz"]);
  if (!Number.isInteger(sinir) || sinir < 0 || !Number.isInteger(enAzYildiz) || enAzYildiz < 0) {
    throw new Error("--sinir ve --en-az-yildiz negatif olmayan tam sayı olmalı");
  }

  const token = process.env.GITHUB_TOKEN || undefined;
  const arayici = githubArayici(token);
  const klasor = resolve(values.kayitlar);
  const kayitlar = await kayitlariOku(klasor);
  const uyar = (m: string) => console.error(gunlukSatiri("uyarı", m));

  // kesif-haric.txt: her satırda "sahip/ad:klasör" (# ile başlayan satır ve satır sonu yorumları atlanır).
  const haricDosyasi = resolve("kesif-haric.txt");
  const haric = (await varMi(haricDosyasi) ? await readFile(haricDosyasi, "utf8") : "")
    .split(/\r?\n/).map((s) => s.replace(/#.*$/, "").trim()).filter(Boolean);

  let secenekler: Parameters<typeof adaylariBul>[3] = { sorgular: VARSAYILAN_SORGULAR, enAzYildiz, sinir, haric };
  /** Verilen repo:klasör listesi için repoları bulur; bulunamayan ya da lisansı açık olmayan repolar `elenen`e girer. */
  async function yollaraGore(kaynaklar: { repo: string; yol: string }[], ustSinir: number) {
    const yollar: Record<string, string[]> = {};
    for (const k of kaynaklar) (yollar[k.repo] ??= []).push(k.yol);
    const ekRepolar: RepoSonucu[] = [];
    const elenen = new Set<string>();
    for (const repo of Object.keys(yollar)) {
      try {
        const bulunan = (await arayici(`repo:${repo}`)).find((r) => r.repo.toLowerCase() === repo.toLowerCase());
        if (bulunan && bulunan.lisansSpdx && ACIK_LISANSLAR.has(bulunan.lisansSpdx)) ekRepolar.push(bulunan);
        else elenen.add(repo.toLowerCase());
      } catch (e) {
        uyar(`${repo}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { secenek: { sorgular: [], enAzYildiz: 0, sinir: ustSinir, ekRepolar, yollar, haric }, elenen };
  }

  // Kuyruk: kesif-kuyruk.txt'deki "sahip/ad:klasör" satırları sırayla işlenir; incelenenler kuyruktan düşer.
  let kuyrukSatirlari: string[] = [];
  const incelenen = new Set<string>();
  let elenenRepolar = new Set<string>();
  if (values.kuyruk && (await varMi(values.kuyruk))) {
    kuyrukSatirlari = (await readFile(values.kuyruk, "utf8")).split(/\r?\n/);
  }
  const kuyrukGirdileri = kuyrukSatirlari
    .map((s) => s.replace(/#.*$/, "").trim())
    .filter((s) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+:.+$/.test(s))
    .map((s) => ({ repo: s.slice(0, s.indexOf(":")), yol: s.slice(s.indexOf(":") + 1) }));

  if (values.yerel) {
    const kaynaklar = yerelKaynaklar(await readFile(values.yerel, "utf8"));
    secenekler = { ...(await yollaraGore(kaynaklar, Math.max(sinir, kaynaklar.length))).secenek, repoBasinaSinir: Infinity };
  } else if (kuyrukGirdileri.length) {
    // Reddedilenler yer kaplamasın diye sınırın üç katı satır birden incelenir.
    const parti = kuyrukGirdileri.slice(0, sinir * 3);
    const { secenek, elenen } = await yollaraGore(parti, sinir);
    elenenRepolar = elenen;
    secenekler = { ...secenek, incelendi: (r, y) => incelenen.add(`${r}:${y}`.toLowerCase()) };
  }

  const adaylar = await adaylariBul(arayici, githubGetirici(token), kayitlar, secenekler, uyar);
  await atomikYaz(resolve(values.cikti), `${JSON.stringify(adaylar, null, 2)}\n`);
  await atomikYaz(resolve(values.govde), kesifGovdesi(adaylar));

  let yazilan = 0;
  let cevrilen = 0;
  if (values.yaz) {
    const sohbet = values.cevir && token ? githubModelsSohbet(token) : null;
    for (const a of adaylar) {
      const dosya = join(klasor, `${a.id}.yaml`);
      if (await varMi(dosya)) continue;
      const tr = sohbet ? await turkceTaslak(a, sohbet) : null;
      if (tr) cevrilen++;
      await writeFile(dosya, taslakYaml(a, tr), "utf8");
      yazilan++;
    }
    if (values.kuyruk && kuyrukSatirlari.length) {
      const kalan = kuyrukSatirlari.filter((s) => {
        const t = s.replace(/#.*$/, "").trim();
        if (!t.includes(":")) return true; // yorum ve boş satırlar korunur
        const repo = t.slice(0, t.indexOf(":")).toLowerCase();
        return !incelenen.has(t.toLowerCase()) && !elenenRepolar.has(repo);
      });
      await atomikYaz(resolve(values.kuyruk), kalan.join("\n").replace(/\n*$/, "\n"));
      console.log(`kuyruk: ${kuyrukGirdileri.length} -> ${kalan.filter((s) => /^[^#\s].*:/.test(s)).length} satır`);
    }
  }
  console.log(`${adaylar.length} aday bulundu${values.yaz ? `, ${yazilan} taslak kayıt yazıldı (${cevrilen} tanesi Türkçeye çevrildi)` : ""}.`);
  return 0;
}

ana().then(
  (kod) => {
    process.exitCode = kod;
  },
  (e: unknown) => {
    console.error(gunlukSatiri("hata", e instanceof Error ? e.message : String(e)));
    process.exitCode = 1;
  },
);
