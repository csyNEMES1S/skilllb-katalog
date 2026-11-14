import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isScalar, parse, parseDocument, Scalar } from "yaml";
import { BulunamadiHatasi, ErisimEngelliHatasi, KesikAgacHatasi, type AgacGirdisi, type Getirici } from "./getirici.js";
import { KayitSemasi, type Kayit } from "./sema.js";
import { guvenlikTara } from "./tarama.js";

export type Guncelleme = {
  id: string; eskiSha: string; yeniSha: string; dal: string; baslik: string; govde: string;
  eklenen: string[]; silinen: string[]; degisen: string[]; yeniBetikler: string[]; agIpucuYeni: boolean;
};

const ID_DESENI = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA_DESENI = /^[0-9a-f]{40}$/;
/** PR gövdesi GitHub'da 65 536 karakterle sınırlı; çok uzun listeler kısaltılır. */
const LISTE_SINIRI = 200;

/** Kaynağın kendisinden gelen, yalnız o kaydı atlatan sorun. */
class KayitAtlaHatasi extends Error {}

/** derle.ts ile aynı kural: kaynak gitmiş ya da kalıcı olarak okunamıyorsa kayıt atlanır, diğer hatalar durdurur. */
const atlanabilirMi = (e: unknown) =>
  e instanceof BulunamadiHatasi ||
  e instanceof ErisimEngelliHatasi ||
  e instanceof KesikAgacHatasi ||
  e instanceof KayitAtlaHatasi;

type DosyaBilgisi = { boyut: number; sha?: string };

/** Ağaçtan skill klasöründeki dosyalar: klasöre göre göreli yol -> boyut/blob sha. */
function klasorDosyalari(agac: AgacGirdisi[], skillYolu: string): Map<string, DosyaBilgisi> {
  const onek = skillYolu ? `${skillYolu.replace(/\/+$/, "")}/` : "";
  const harita = new Map<string, DosyaBilgisi>();
  for (const g of agac) {
    if (g.tur === "blob" && g.yol.startsWith(onek)) harita.set(g.yol.slice(onek.length), { boyut: g.boyut, sha: g.sha });
  }
  return harita;
}

/** Blob sha iki tarafta da varsa ona, yoksa boyuta göre karşılaştırır (aynı boyutlu değişiklik o zaman kaçabilir). */
const farkliMi = (a: DosyaBilgisi, b: DosyaBilgisi) => (a.sha && b.sha ? a.sha !== b.sha : a.boyut !== b.boyut);

const sirala = (l: string[]) => l.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * Metni Markdown satır içi kod olarak yazar. Üçüncü taraf dosya adları PR gövdesine Markdown/HTML
 * sokamasın diye: denetim ve satır sonu karakterleri görünür kaçışa (`\n`, `\u2028`) çevrilir, ayraç
 * içerikteki en uzun ters tırnak dizisinden bir uzun seçilir ve gerekirse boşlukla doldurulur.
 */
export function mdKod(metin: string): string {
  const kacisli = metin.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, (c) => {
    if (c === "\n") return "\\n";
    if (c === "\r") return "\\r";
    if (c === "\t") return "\\t";
    return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
  const enUzun = Math.max(0, ...(kacisli.match(/`+/g) ?? []).map((d) => d.length));
  const ayrac = "`".repeat(enUzun + 1);
  const doldur = kacisli.startsWith("`") || kacisli.endsWith("`") || (kacisli.startsWith(" ") && kacisli.endsWith(" "));
  return doldur ? `${ayrac} ${kacisli} ${ayrac}` : `${ayrac}${kacisli}${ayrac}`;
}

/** Sahibin yazdığı tek satırlık metin (ad): satır sonları boşluğa indirilir. */
const tekSatir = (m: string) => m.replace(/\s+/g, " ").trim();

function liste(baslik: string, dosyalar: string[]): string[] {
  if (!dosyalar.length) return [];
  const satirlar = [`### ${baslik} (${dosyalar.length})`, ""];
  for (const d of dosyalar.slice(0, LISTE_SINIRI)) satirlar.push(`- ${mdKod(d)}`);
  if (dosyalar.length > LISTE_SINIRI) satirlar.push(`- … ve ${dosyalar.length - LISTE_SINIRI} dosya daha`);
  satirlar.push("");
  return satirlar;
}

function govdeYaz(kayit: Kayit, yeni: { sha: string; tarih: string }, f: Omit<Guncelleme, "id" | "eskiSha" | "yeniSha" | "dal" | "baslik" | "govde">): string {
  const { repo, yol, sha: eski } = kayit.kaynak;
  const satirlar = [
    `## ${tekSatir(kayit.ad)} için kaynak güncellemesi`,
    "",
    `${mdKod(repo)} deposundaki ${mdKod(yol)} klasöründe yeni bir sürüm var.`,
    "",
    `- Şu anki sürüm: ${mdKod(eski.slice(0, 7))}`,
    `- Yeni sürüm: ${mdKod(yeni.sha.slice(0, 7))} (${mdKod(yeni.tarih)})`,
    "",
  ];
  const uyarilar = f.yeniBetikler.slice(0, LISTE_SINIRI).map((b) => `⚠ Yeni betik: ${mdKod(b)}`);
  if (f.yeniBetikler.length > LISTE_SINIRI) uyarilar.push(`⚠ … ve ${f.yeniBetikler.length - LISTE_SINIRI} yeni betik daha`);
  if (f.agIpucuYeni) uyarilar.push("⚠ Ağ erişimi ipucu belirdi: yeni sürümdeki betiklerde ağa bağlanan kod izi var.");
  if (uyarilar.length) satirlar.push(...uyarilar.flatMap((u) => [u, ""]), "Birleştirmeden önce bu betikleri okuyun.", "");
  satirlar.push(
    ...liste("Eklenen dosyalar", f.eklenen),
    ...liste("Silinen dosyalar", f.silinen),
    ...liste("Değişen dosyalar", f.degisen),
    `[Tüm farkları GitHub'da gör](https://github.com/${repo}/compare/${eski}...${yeni.sha})`,
    "",
    `Bu PR yalnız ${mdKod(`kayitlar/${kayit.id}.yaml`)} içindeki ${mdKod("kaynak.sha")} değerini değiştirir. Birleştirilene kadar kullanıcılar şu anki sürümü görür.`,
    "",
  );
  return satirlar.join("\n");
}

/**
 * Her kayıt için kaynak dalda skill klasörünü etkileyen son commit'e bakar; sabit sha'dan farklıysa
 * ve klasörde gerçekten dosya farkı varsa bir PR önerisi üretir. Hiçbir kaydı değiştirmez.
 * Kaynağı bulunamayan/engelli/kesik ağaçlı kayıt `uyar` ile bildirilip atlanır; kota, 5xx ve ağ
 * hataları bütün işlemi durdurur.
 */
export async function guncellemeleriBul(
  kayitlar: Kayit[],
  g: Getirici,
  uyar: (m: string) => void = (m) => console.error(`uyarı: ${m}`),
): Promise<Guncelleme[]> {
  const agaclar = new Map<string, Promise<AgacGirdisi[]>>();
  const agacAl = (repo: string, sha: string) => {
    const anahtar = `${repo}@${sha}`;
    let p = agaclar.get(anahtar);
    if (!p) agaclar.set(anahtar, (p = g.agac(repo, sha)));
    return p;
  };
  const sonuc: Guncelleme[] = [];

  for (const kayit of kayitlar) {
    try {
      const u = await kayitIncele(kayit);
      if (u) sonuc.push(u);
    } catch (e) {
      if (!atlanabilirMi(e)) throw e;
      uyar(`/${kayit.id}/ güncelleme denetimi atlandı (${kayit.kaynak.repo}/${kayit.kaynak.yol}): ${(e as Error).message}`);
    }
  }
  return sonuc;

  async function kayitIncele(kayit: Kayit): Promise<Guncelleme | undefined> {
    const { repo, yol, dal, sha: eskiSha } = kayit.kaynak;
    const yeni = await g.sonCommit(repo, dal, yol);
    if (yeni.sha === eskiSha) return undefined;
    if (!SHA_DESENI.test(yeni.sha)) throw new KayitAtlaHatasi(`son commit sha'sı beklenmedik biçimde: ${JSON.stringify(yeni.sha)}`);

    const eski = klasorDosyalari(await agacAl(repo, eskiSha), yol);
    const son = klasorDosyalari(await agacAl(repo, yeni.sha), yol);
    if (!son.has("SKILL.md")) {
      throw new KayitAtlaHatasi(`yeni sürümde (${yeni.sha.slice(0, 7)}) "${yol}/SKILL.md" yok (klasör silinmiş ya da taşınmış olabilir)`);
    }

    const eklenen = sirala([...son.keys()].filter((y) => !eski.has(y)));
    const silinen = sirala([...eski.keys()].filter((y) => !son.has(y)));
    const degisen = sirala([...son.keys()].filter((y) => eski.has(y) && farkliMi(eski.get(y)!, son.get(y)!)));
    // Sabit sha klasörü etkileyen son commit'ten yeni olabilir (dalın başına sabitlenmiş kayıt): fark yoksa PR yok.
    if (!eklenen.length && !silinen.length && !degisen.length) return undefined;

    // Betik içerikleri yalnız betik dosyaları için indirilir; aynı blob iki kez indirilmez.
    const icerikler = new Map<string, Promise<string>>();
    const tamYol = (goreli: string) => (yol ? `${yol.replace(/\/+$/, "")}/${goreli}` : goreli);
    const icerikAl = (sha: string, goreli: string, bilgi: DosyaBilgisi) => {
      const anahtar = bilgi.sha ? `blob:${bilgi.sha}` : `${sha}:${goreli}`;
      let p = icerikler.get(anahtar);
      if (!p) icerikler.set(anahtar, (p = g.dosya(repo, sha, tamYol(goreli))));
      return p;
    };
    const tara = async (sha: string, dosyalar: Map<string, DosyaBilgisi>, icerikle: boolean) => {
      const liste = [...dosyalar.keys()].map((yol) => ({ yol }));
      const betikler = guvenlikTara(liste).betikler;
      if (!icerikle) return { betikler, agIpucu: false };
      return guvenlikTara(
        await Promise.all(betikler.map(async (b) => ({ yol: b, icerik: await icerikAl(sha, b, dosyalar.get(b)!) }))),
      );
    };
    const eskiGuvenlik = await tara(eskiSha, eski, true);
    // Eski sürümde ipucu zaten varsa "yeni belirdi" denemez; yeni betiklerin içeriğine gerek yok.
    const yeniGuvenlik = await tara(yeni.sha, son, !eskiGuvenlik.agIpucu);
    const eskiBetikler = new Set(eskiGuvenlik.betikler);
    const yeniBetikler = sirala(yeniGuvenlik.betikler.filter((b) => !eskiBetikler.has(b)));
    const agIpucuYeni = !eskiGuvenlik.agIpucu && yeniGuvenlik.agIpucu;

    const farklar = { eklenen, silinen, degisen, yeniBetikler, agIpucuYeni };
    return {
      id: kayit.id,
      eskiSha,
      yeniSha: yeni.sha,
      dal: `guncelleme/${kayit.id}-${yeni.sha.slice(0, 7)}`,
      baslik: `Güncelleme: ${tekSatir(kayit.ad)} (${eskiSha.slice(0, 7)} → ${yeni.sha.slice(0, 7)})`,
      govde: govdeYaz(kayit, yeni, farklar),
      ...farklar,
    };
  }
}

/**
 * Kayıt YAML'ındaki `kaynak.sha` değerini değiştirir. Konum yaml Document API ile bulunur, ama yalnız
 * o değerin karakterleri değiştirilir: yorumlar, sıra, tırnaklar, satır sonları (CRLF) ve satır
 * katlaması birebir kalır. `kaynak.sha` yoksa ya da düz/tırnaklı bir metin değilse hata fırlatır.
 */
export function kayitShaGuncelle(yamlMetni: string, yeniSha: string): string {
  const belge = parseDocument(yamlMetni);
  if (belge.errors.length) throw new Error(`YAML okunamadı: ${belge.errors[0].message}`);
  const dugum = belge.getIn(["kaynak", "sha"], true);
  if (!isScalar(dugum) || !dugum.range) throw new Error("kaynak.sha alanı bulunamadı");

  let yeniDeger: string;
  switch (dugum.type) {
    case Scalar.QUOTE_DOUBLE:
      yeniDeger = JSON.stringify(yeniSha);
      break;
    case Scalar.QUOTE_SINGLE:
      yeniDeger = `'${yeniSha.replace(/'/g, "''")}'`;
      break;
    case Scalar.PLAIN:
      // Düz yazınca metin olarak okunmayacaksa (ör. yalnız rakamdan oluşan sha) tırnakla.
      yeniDeger = /^[0-9a-zA-Z]+$/.test(yeniSha) && parse(yeniSha) === yeniSha ? yeniSha : JSON.stringify(yeniSha);
      break;
    default:
      throw new Error("kaynak.sha düz ya da tırnaklı tek satırlık bir değer olmalı");
  }

  const [bas, son] = dugum.range;
  const cikti = yamlMetni.slice(0, bas) + yeniDeger + yamlMetni.slice(son);
  if (parseDocument(cikti).getIn(["kaynak", "sha"]) !== yeniSha) throw new Error("kaynak.sha güncellenemedi (beklenmedik YAML biçimi)");
  return cikti;
}

/**
 * `klasor/<id>.yaml` kaydının `kaynak.sha` değerini `yeniSha` yapar. Yazmadan önce sonucu şemayla
 * doğrular; geçersiz id/sha ya da bozuk kayıt dosyaya dokunmadan hata verir. (İş akışındaki
 * `npm run guncelle -- --uygula <id> <sha>` bunu çağırır.)
 */
export async function kayitDosyasiGuncelle(klasor: string, id: string, yeniSha: string): Promise<void> {
  if (!ID_DESENI.test(id)) throw new Error(`geçersiz kayıt id'si: ${JSON.stringify(id)}`);
  if (!SHA_DESENI.test(yeniSha)) throw new Error(`geçersiz sha (40 karakterlik commit sha olmalı): ${JSON.stringify(yeniSha)}`);
  const dosya = join(klasor, `${id}.yaml`);
  const yeni = kayitShaGuncelle(await readFile(dosya, "utf8"), yeniSha);

  const denetim = KayitSemasi.safeParse(parse(yeni));
  if (!denetim.success) {
    const sorun = denetim.error.issues[0];
    throw new Error(`${id}.yaml: ${sorun.path.join(".") || "(kök)"} ${sorun.message}`);
  }
  if (denetim.data.id !== id) throw new Error(`${id}.yaml: id dosya adıyla aynı olmalı`);

  const gecici = `${dosya}.tmp`;
  await writeFile(gecici, yeni, "utf8");
  await rename(gecici, dosya);
}
