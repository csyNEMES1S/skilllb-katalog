import { cp, lstat, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";
import { BulunamadiHatasi, ErisimEngelliHatasi, KesikAgacHatasi, dosyaListesi, lisansBelirle, lisansDosyasiMi, type Getirici } from "./getirici.js";
import { KATEGORILER, KatalogSemasi, type Katalog, type Kayit, type Skill } from "./sema.js";
import { skillMdAyristir } from "./skillMd.js";
import { guvenlikTara } from "./tarama.js";

type Agac = Awaited<ReturnType<Getirici["agac"]>>;
type RepoBilgi = Awaited<ReturnType<Getirici["repoBilgi"]>>;

/** Kaynağın kendisinden gelen, yalnız o kaydı atlatan sorun (eksik SKILL.md, şemaya uymayan veri). */
class KayitAtlaHatasi extends Error {}

/**
 * Bu hatalar yalnız o kaydın kaynağının gittiğini ya da (kalıcı olarak) okunamadığını söyler:
 * kayıt atlanır, derleme sürer. Ağ, kota/limit, 401 ve 5xx gibi hatalar derlemeyi durdurur.
 */
const atlanabilirMi = (e: unknown) =>
  e instanceof BulunamadiHatasi ||
  e instanceof ErisimEngelliHatasi ||
  e instanceof KesikAgacHatasi ||
  e instanceof KayitAtlaHatasi;

/** "a/b c" -> "a/b%20c": parçalar ayrı kodlanır, "/" korunur. */
const yolKodla = (yol: string) => yol.split("/").map(encodeURIComponent).join("/");

/** Repo içi göreli görsel yolunu yayın adresine çevirir; https adresleri aynen kalır. */
function gorselUrl(deger: string, taban: string): string {
  if (deger.includes("://")) return deger;
  return `${taban.replace(/\/+$/, "")}/${yolKodla(deger)}`;
}

/** Aynı anahtar için yalnız bir kez çağırır (başarısız sonuç da önbellekte kalır). */
function onbellek<T>(): (anahtar: string, uret: () => Promise<T>) => Promise<T> {
  const harita = new Map<string, Promise<T>>();
  return (anahtar, uret) => {
    let p = harita.get(anahtar);
    if (!p) {
      p = uret();
      harita.set(anahtar, p);
    }
    return p;
  };
}

/**
 * Kayıtları kaynak repolardaki bilgilerle birleştirip kataloğu üretir. Her zaman kayıttaki sabit
 * `kaynak.sha` kullanılır; dalın son durumuna bakılmaz. Kaynağı bulunamayan (silinmiş, taşınmış,
 * ağacı kesik) kayıt `uyar` ile bildirilip atlanır. Ağ/yetki/kota gibi geçici hatalar ise derlemeyi
 * durdurur: eksik bir kataloğu yayınlamaktansa bir önceki yayın yerinde kalsın.
 */
export async function derle(
  kayitlar: Kayit[],
  g: Getirici,
  gorselTabanUrl: string,
  uyar: (m: string) => void,
): Promise<Katalog> {
  const agacAl = onbellek<Agac>();
  const bilgiAl = onbellek<RepoBilgi>();
  const olusturulma = new Date().toISOString();
  const skills: Skill[] = [];

  for (const kayit of kayitlar) {
    try {
      const skill = await skillDerle(kayit);
      // Kaynaktan gelen veri (ör. dosya adı) yayın şemasına uymuyorsa yalnız bu kayıt düşer.
      const denetim = KatalogSemasi.safeParse({ surum: 1, olusturulma, kategoriler: KATEGORILER, skills: [skill] });
      if (!denetim.success) {
        const sorun = denetim.error.issues[0];
        throw new KayitAtlaHatasi(`yayın şemasına uymuyor: ${sorun.path.slice(2).join(".")} ${sorun.message}`);
      }
      skills.push(skill);
    } catch (e) {
      if (!atlanabilirMi(e)) throw e;
      uyar(`/${kayit.id}/ atlandı (${kayit.kaynak.repo}/${kayit.kaynak.yol}@${kayit.kaynak.sha.slice(0, 7)}): ${(e as Error).message}`);
    }
  }

  const yayinda = new Set(skills.map((s) => s.id));
  for (const s of skills) {
    s.benzerler = s.benzerler.filter((b) => {
      if (b === s.id) uyar(`/${s.id}/ benzerler: skill kendisini gösteremez, çıkarıldı`);
      else if (!yayinda.has(b)) uyar(`/${s.id}/ benzerler: "${b}" katalogda yok, çıkarıldı`);
      else return true;
      return false;
    });
  }

  return { surum: 1, olusturulma, kategoriler: KATEGORILER, skills };

  async function skillDerle(kayit: Kayit): Promise<Skill> {
    const { repo, yol, sha } = kayit.kaynak;
    const agac = await agacAl(`${repo}@${sha}`, () => g.agac(repo, sha));
    const dosyalar = dosyaListesi(agac, yol);
    if (!dosyalar.some((d) => d.yol === "SKILL.md")) {
      throw new KayitAtlaHatasi(`"${yol}/SKILL.md" bulunamadı (klasör silinmiş ya da taşınmış olabilir)`);
    }
    const tamYol = (goreli: string) => (yol ? `${yol.replace(/\/+$/, "")}/${goreli}` : goreli);

    const md = skillMdAyristir(await g.dosya(repo, sha, tamYol("SKILL.md")));
    const commit = await g.commit(repo, sha);
    const bilgi = await bilgiAl(repo, () => g.repoBilgi(repo));

    const lisansDosyasi = dosyalar.find((d) => lisansDosyasiMi(d.yol));
    const lisansMetni = lisansDosyasi ? await g.dosya(repo, sha, tamYol(lisansDosyasi.yol)) : undefined;

    // Yalnız betik dosyalarının içeriği indirilir (ağ ipucu taraması için).
    const betikler = guvenlikTara(dosyalar).betikler;
    const icerikli = await Promise.all(
      dosyalar.map(async (d) => (betikler.includes(d.yol) ? { yol: d.yol, icerik: await g.dosya(repo, sha, tamYol(d.yol)) } : { yol: d.yol })),
    );

    const gorseller: Skill["gorseller"] = {
      onceSonra: (kayit.gorseller?.onceSonra ?? []).map((v) => gorselUrl(v, gorselTabanUrl)),
    };
    if (kayit.gorseller?.ikon) gorseller.ikon = gorselUrl(kayit.gorseller.ikon, gorselTabanUrl);
    if (kayit.gorseller?.kapak) gorseller.kapak = gorselUrl(kayit.gorseller.kapak, gorselTabanUrl);

    return {
      id: kayit.id,
      ad: kayit.ad,
      kisaAciklama: kayit.kisaAciklama,
      neIseYarar: kayit.neIseYarar,
      kategori: kayit.kategori,
      kaynak: { ...kayit.kaynak, url: `https://github.com/${repo}/tree/${sha}/${yolKodla(yol)}` },
      gorseller,
      ornekCumleler: kayit.ornekCumleler,
      nasilKullanilir: kayit.nasilKullanilir ?? {},
      uyumluluk: kayit.uyumluluk,
      dogrulandi: kayit.dogrulandi ?? false,
      oneCikan: kayit.oneCikan ?? false,
      haftaninSkilli: kayit.haftaninSkilli ?? false,
      ornekler: kayit.ornekler ?? [],
      benzerler: [...(kayit.benzerler ?? [])],
      otomatikGuncelle: kayit.otomatikGuncelle ?? false,
      surum: md.surum ?? commit.tarih.slice(0, 10),
      guncellemeTarihi: commit.tarih,
      lisans: lisansBelirle(bilgi.lisansSpdx, dosyalar, lisansMetni),
      yildiz: bilgi.yildiz,
      yazar: bilgi.sahip,
      readme: md.govde,
      dosyalar,
      boyut: dosyalar.reduce((t, d) => t + d.boyut, 0),
      guvenlik: guvenlikTara(icerikli),
    };
  }
}

/**
 * `alt` yolu `ust` ile aynı ya da onun içinde mi? ".." ile başlayan ama üst klasör olmayan adları
 * (ör. "..resimler") içeride sayar; farklı sürücüdeki yol (isAbsolute) dışarıdadır.
 */
export function icindeMi(ust: string, alt: string): boolean {
  const f = relative(resolve(ust), resolve(alt));
  return f === "" || (f !== ".." && !f.startsWith(".." + sep) && !isAbsolute(f));
}

/**
 * Kataloğu `ciktiYolu`na yazar, `gorselKlasoru` varsa yanına `gorseller/` olarak kopyalar
 * (eski kopya silinir) ve GitHub Pages için boş bir `.nojekyll` bırakır.
 */
export async function ciktiYaz(katalog: Katalog, ciktiYolu: string, gorselKlasoru: string): Promise<void> {
  const hedef = dirname(ciktiYolu);
  await mkdir(hedef, { recursive: true });

  const gorselHedef = join(hedef, "gorseller");
  // Hedef kaynağın kendisi/içindeyse (ör. --cikti catalog.json) ya da kaynak hedefin içindeyse
  // (ör. --gorseller dist/gorseller/x) rm kaynağı silerdi: hiçbir şey silmeden dur.
  if (icindeMi(gorselKlasoru, gorselHedef) || icindeMi(gorselHedef, gorselKlasoru)) {
    throw new Error(`çıktı klasörü görsel kaynağıyla çakışıyor: ${gorselHedef} (gorseller ${gorselKlasoru})`);
  }
  const kaynakVar = await stat(gorselKlasoru).then((s) => s.isDirectory(), () => false);
  if (kaynakVar) await sembolikBaglantiYok(gorselKlasoru);
  await rm(gorselHedef, { recursive: true, force: true });
  if (kaynakVar) await cp(gorselKlasoru, gorselHedef, { recursive: true });

  await writeFile(join(hedef, ".nojekyll"), "");
  // Önce geçici dosyaya yaz, sonra taşı: yarım yazılmış bir catalog.json kalmasın.
  const gecici = `${ciktiYolu}.tmp`;
  await writeFile(gecici, `${JSON.stringify(katalog, null, 2)}
`, "utf8");
  await rename(gecici, ciktiYolu);
}

/**
 * Görsel klasöründe sembolik bağlantı (ya da Windows junction) olmamalı: dist'e kopyalanınca Pages
 * paketi bağlantıyı izleyip repo dışındaki bir dosyayı yayınlayabilir. Kopyalamadan önce denetlenir.
 */
async function sembolikBaglantiYok(klasor: string): Promise<void> {
  for (const g of await readdir(klasor, { withFileTypes: true })) {
    const yol = join(klasor, g.name);
    const bilgi = await lstat(yol);
    if (bilgi.isSymbolicLink()) throw new Error(`görsel klasöründe sembolik bağlantı var, kopyalanmadı: ${yol}`);
    if (bilgi.isDirectory()) await sembolikBaglantiYok(yol);
    else if (!bilgi.isFile()) throw new Error(`görsel klasöründe olağan dışı dosya türü: ${yol}`);
  }
}
