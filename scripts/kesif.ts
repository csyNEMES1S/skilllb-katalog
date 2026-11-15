import { stringify } from "yaml";
import { type AgacGirdisi, type Getirici } from "./getirici.js";
import { mdKod } from "./guncelleme.js";
import type { Kayit, KategoriId } from "./sema.js";
import { skillMdAyristir } from "./skillMd.js";
import { guvenlikTara } from "./tarama.js";
import type { TurkceMetin } from "./cevir.js";

/**
 * Haftalık keşif: GitHub'da kataloğa henüz girmemiş, açık lisanslı skill klasörlerini bulur ve
 * sahibinin incelemesi için taslak kayıt üretir. Hiçbir şey kendiliğinden yayınlanmaz: taslaklar
 * bir PR'a girer, sahibi düzeltip birleştirince katalog yayınlanır.
 */

export type RepoSonucu = { repo: string; dal: string; yildiz: number; lisansSpdx: string | null };
export type RepoArayici = (sorgu: string) => Promise<RepoSonucu[]>;

export type Aday = {
  id: string; repo: string; yol: string; dal: string; sha: string;
  ad?: string; aciklama: string; lisans: string; yildiz: number;
  betikler: string[]; agIpucu: boolean;
};

export type KesifSecenekleri = {
  sorgular: string[];
  /** Bu sayıdan az yıldızlı repolar atlanır. */
  enAzYildiz?: number;
  /** En çok kaç aday döner (yıldıza göre). */
  sinir?: number;
  /** Bir repodan en çok kaç aday alınır (yüzlerce skill'lik paketler PR'ı boğmasın). */
  repoBasinaSinir?: number;
  /** Arama dışında doğrudan taranacak repolar (ör. bilgisayardaki skill'lerin kaynakları). */
  ekRepolar?: RepoSonucu[];
  /** Repo ("sahip/ad") -> yalnız bakılacak skill klasörleri. Verilmeyen repolarda bütün klasörlere bakılır. */
  yollar?: Record<string, string[]>;
  /** "sahip/ad:klasör" biçiminde, bir daha önerilmeyecek (reddedilmiş) skill'ler. Büyük/küçük harf duyarsız. */
  haric?: string[];
  /** `yollar` ile verilen her klasör incelendiğinde (aday olsun olmasın) çağrılır; kuyruktan düşmek için. */
  incelendi?: (repo: string, yol: string) => void;
};

/** Kataloğun kabul ettiği açık lisanslar (README "Kabul kriterleri"). */
export const ACIK_LISANSLAR = new Set([
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "0BSD", "ISC", "MPL-2.0", "CC-BY-4.0", "CC-BY-SA-4.0", "Unlicense",
]);

export const VARSAYILAN_SORGULAR = [
  "topic:claude-skills",
  "topic:agent-skills",
  "topic:claude-code-skills",
  "topic:claude-skill",
  "SKILL.md claude skills in:readme",
];

const ATLANAN_PARCALAR = new Set(["node_modules", "in-progress", "deprecated", "archive", "test", "tests", "fixtures", "examples", "templates", "template"]);
const ID_DESENI = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** Gövdesi bundan kısa SKILL.md yarım sayılır. */
const EN_KISA_GOVDE = 200;
const BETIK_OKUMA_SINIRI = 20;

const klasorAdi = (yol: string) => yol.slice(yol.lastIndexOf("/") + 1).toLowerCase();
/** ".agents/...", ".claude/..." gibi noktalı klasörler çoğunlukla projenin kendi iç skill'leridir. */
const noktaliMi = (yol: string) => yol.split("/").some((p) => p.startsWith("."));

/**
 * Ağaçta `SKILL.md` içeren klasörler (kök hariç; şema kök klasörü desteklemez), sıralı. Aynı adlı
 * klasörlerden yalnız biri tutulur (birçok repo aynı skill'i farklı araçlar için kopyalar). Noktalı
 * klasörler yalnız repoda başka skill yoksa alınır.
 */
export function skillKlasorleri(agac: AgacGirdisi[]): string[] {
  const hepsi: string[] = [];
  for (const g of agac) {
    if (g.tur !== "blob" || !g.yol.endsWith("/SKILL.md")) continue;
    const klasor = g.yol.slice(0, -"/SKILL.md".length);
    if (klasor.split("/").some((p) => ATLANAN_PARCALAR.has(p.toLowerCase()))) continue;
    hepsi.push(klasor);
  }
  const acik = hepsi.filter((k) => !noktaliMi(k));
  const secilen = (acik.length ? acik : hepsi).sort();
  const gorulen = new Set<string>();
  return secilen.filter((k) => !gorulen.has(klasorAdi(k)) && (gorulen.add(klasorAdi(k)), true));
}

const KATEGORI_SOZCUKLERI: [KategoriId, RegExp][] = [
  ["guvenlik", /\b(security|vulnerab\w*|pentest\w*|owasp|exploit\w*|threat|audit\w*|cve|secure)\b/i],
  ["belge-ofis", /\b(pdf|docx?|word|excel|xlsx|spreadsheet|powerpoint|pptx|slides?|documents?)\b/i],
  ["veri-grafik", /\b(data|charts?|graphs?|sql|csv|analytics|visuali[sz]\w*|dashboards?)\b/i],
  ["tasarim", /\b(design\w*|ui|ux|css|figma|frontend|illustrat\w*|images?|video|animation)\b/i],
  ["kod-test", /\b(code|coding|tests?|testing|debug\w*|bugs?|refactor\w*|git|review|typescript|python|api)\b/i],
  ["yazi", /\b(writ\w*|blog|copy|essay|prose|edit\w*|content)\b/i],
];

export function kategoriTahmin(metin: string): KategoriId {
  return KATEGORI_SOZCUKLERI.find(([, d]) => d.test(metin))?.[0] ?? "diger";
}

function idOner(ad: string | undefined, yol: string, sahip: string, kullanilan: Set<string>): string | null {
  const ham = (ad ?? yol.slice(yol.lastIndexOf("/") + 1)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const sahipParca = sahip.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  for (const aday of [ham, `${sahipParca}-${ham}`.slice(0, 64).replace(/-+$/, "")]) {
    if (ID_DESENI.test(aday) && !kullanilan.has(aday)) return aday;
  }
  return null;
}

/**
 * Sorgularla repo arar, her repoda katalogda olmayan skill klasörlerini inceler. Lisanssız, az
 * yıldızlı, açıklaması ya da gövdesi olmayan skill'ler elenir. Bir reponun hatası yalnız o repoyu
 * atlatır (`uyar` ile bildirilir).
 */
export async function adaylariBul(
  arayici: RepoArayici,
  g: Getirici,
  kayitlar: Kayit[],
  s: KesifSecenekleri,
  uyar: (m: string) => void = (m) => console.error(`uyarı: ${m}`),
): Promise<Aday[]> {
  const enAzYildiz = s.enAzYildiz ?? 50;
  const sinir = s.sinir ?? 10;
  const repoBasina = s.repoBasinaSinir ?? 3;
  if (sinir <= 0) return [];

  // Repo + klasör adı: aynı skill'in aynı repoda başka bir klasördeki kopyası da katalogda sayılır.
  const katalogdaki = new Set(kayitlar.map((k) => `${k.kaynak.repo.toLowerCase()}:${klasorAdi(k.kaynak.yol)}`));
  const kullanilanIdler = new Set(kayitlar.map((k) => k.id));
  const haric = new Set((s.haric ?? []).map((h) => h.trim().toLowerCase()));
  const yollar = new Map(Object.entries(s.yollar ?? {}).map(([r, y]) => [r.toLowerCase(), y]));

  const repolar = new Map<string, RepoSonucu>();
  for (const r of s.ekRepolar ?? []) repolar.set(r.repo.toLowerCase(), r);
  for (const sorgu of s.sorgular) {
    for (const r of await arayici(sorgu)) if (!repolar.has(r.repo.toLowerCase())) repolar.set(r.repo.toLowerCase(), r);
  }
  const sirali = [...repolar.values()]
    .filter((r) => r.yildiz >= enAzYildiz && r.lisansSpdx !== null && ACIK_LISANSLAR.has(r.lisansSpdx))
    .sort((a, b) => b.yildiz - a.yildiz);

  const adaylar: Aday[] = [];
  for (const r of sirali) {
    if (adaylar.length >= sinir) break;
    try {
      const agac = await g.agac(r.repo, r.dal);
      let buRepodan = 0;
      const izinli = yollar.get(r.repo.toLowerCase());
      // Kuyruk/yerel modda verilen yollara doğrudan bakılır (noktalı klasör ve tekrar elemesi yok).
      const klasorler = izinli ?? skillKlasorleri(agac);
      for (const yol of klasorler) {
        if (adaylar.length >= sinir || buRepodan >= repoBasina) break;
        if (izinli) s.incelendi?.(r.repo, yol);
        if (izinli && !agac.some((x) => x.tur === "blob" && x.yol === `${yol}/SKILL.md`)) continue;
        if (haric.has(`${r.repo}:${yol}`.toLowerCase())) continue;
        if (katalogdaki.has(`${r.repo.toLowerCase()}:${klasorAdi(yol)}`)) continue;
        let mdMetni: string;
        try {
          mdMetni = await g.dosya(r.repo, r.dal, `${yol}/SKILL.md`);
        } catch (e) {
          uyar(`${r.repo}/${yol}: SKILL.md okunamadı (${e instanceof Error ? e.message : String(e)}), atlandı`);
          continue;
        }
        const md = skillMdAyristir(mdMetni);
        if (!md.aciklama || md.govde.trim().length < EN_KISA_GOVDE) continue;
        const id = idOner(md.ad, yol, r.repo.split("/")[0], kullanilanIdler);
        if (!id) continue;

        const onek = `${yol}/`;
        const dosyalar = agac.filter((x) => x.tur === "blob" && x.yol.startsWith(onek)).map((x) => ({ yol: x.yol.slice(onek.length) }));
        const ilk = guvenlikTara(dosyalar);
        const icerikli = await Promise.all(
          ilk.betikler.slice(0, BETIK_OKUMA_SINIRI).map(async (b) => ({ yol: b, icerik: await g.dosya(r.repo, r.dal, onek + b) })),
        );
        const tarama = guvenlikTara(icerikli);
        const { sha } = await g.sonCommit(r.repo, r.dal, yol);

        kullanilanIdler.add(id);
        buRepodan++;
        adaylar.push({
          id, repo: r.repo, yol, dal: r.dal, sha, ...(md.ad ? { ad: md.ad } : {}), aciklama: md.aciklama,
          lisans: r.lisansSpdx!, yildiz: r.yildiz, betikler: ilk.betikler,
          agIpucu: tarama.agIpucu || ilk.betikler.length > BETIK_OKUMA_SINIRI,
        });
      }
    } catch (e) {
      uyar(`${r.repo}: ${e instanceof Error ? e.message : String(e)} (atlandı)`);
    }
  }
  return adaylar;
}

const tekSatir = (m: string) => m.replace(/\s+/g, " ").trim();
const cumleler = (m: string) => tekSatir(m).split(/(?<=[.!?])\s+/).filter(Boolean);
function kisalt(m: string, n: number): string {
  if (m.length <= n) return m;
  const kesik = m.slice(0, n - 1);
  const bosluk = kesik.lastIndexOf(" ");
  return `${(bosluk > n / 2 ? kesik.slice(0, bosluk) : kesik).replace(/[\s,;:.-]+$/, "")}…`;
}
const baslik = (ad: string) => ad.split(/[-_\s]+/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");

/**
 * Sahibinin düzelteceği taslak kayıt. Türkçe alanlar şimdilik SKILL.md'deki özgün (çoğunlukla
 * İngilizce) açıklamadan doldurulur; PR'da Türkçeleştirilmesi beklenir.
 */
export function taslakYaml(a: Aday, tr?: TurkceMetin | null): string {
  const ad = baslik(a.ad ?? a.id);
  const parcalar = cumleler(a.aciklama);
  const maddeler = [...parcalar.slice(0, 3)];
  if (maddeler.length < 2) maddeler.push(`Kaynak: ${a.repo} (${a.lisans} lisanslı, ${a.yildiz} yıldız).`);
  if (maddeler.length < 3) maddeler.push(a.betikler.length ? `Betik içerir: ${a.betikler.slice(0, 3).join(", ")}.` : "Yalnız talimat dosyalarından oluşur, betik çalıştırmaz.");
  const kisa = kisalt(parcalar[0] ?? a.aciklama, 60);
  const kayit = {
    id: a.id,
    ad: tr?.ad ?? ad,
    kisaAciklama: tr?.kisaAciklama ?? kisa,
    neIseYarar: tr?.neIseYarar ?? maddeler,
    kategori: tr?.kategori ?? kategoriTahmin(`${a.ad ?? ""} ${a.aciklama}`),
    kaynak: { repo: a.repo, yol: a.yol, dal: a.dal, sha: a.sha },
    ornekCumleler: tr?.ornekCumleler ?? [`${ad} skill'ini kullanarak bu işi yap.`, `/${a.ad ?? a.id}`],
    uyumluluk: {
      claude: { durum: "calisir", sahibiDenedi: false },
      antigravity: { durum: "bilinmiyor", sahibiDenedi: false },
    },
    dogrulandi: false,
    en: { ad, kisaAciklama: kisa, neIseYarar: maddeler },
  };
  const not = tr ? "Türkçe metinler makine çevirisi, gözden geçirin" : "Türkçe metinleri düzeltin";
  return `# TASLAK (keşif): ${not}; SKILL.md'yi okuyun, sonra birleştirin.\n${stringify(kayit, { lineWidth: 0, aliasDuplicateObjects: false })}`;
}

const tabloHucre = (m: string) => mdKod(kisalt(tekSatir(m), 120).replace(/\|/g, "/"));

/** Keşif PR'ının gövdesi. Üçüncü taraf metinler satır içi kod olarak yazılır (Markdown/HTML sızmaz). */
export function kesifGovdesi(adaylar: Aday[]): string {
  const satirlar = [
    "## Keşif: yeni skill adayları",
    "",
    `${adaylar.length} yeni aday bulundu. Her biri açık lisanslı ve katalogda yok. Kayıtlar **taslak**: Türkçe metinler makine çevirisi (GitHub Models); çevrilemeyenlerde SKILL.md'deki özgün açıklama kullanıldı. Dosyanın ilk satırı hangisi olduğunu söyler.`,
    "",
    "Birleştirmeden önce her aday için:",
    "1. SKILL.md'yi ve varsa betikleri okuyun (kabul kriterleri: README).",
    "2. `ad`, `kisaAciklama` (en çok 60 karakter), `neIseYarar`, `ornekCumleler` ve `kategori` alanlarını Türkçeleştirin; uygun olmayan kaydı silin.",
    "3. İsterseniz Claude'a: \"keşif PR'ındaki taslak kayıtları Türkçeleştir ve incele\" deyin.",
    "",
    "| id | repo | yıldız | lisans | betik | açıklama |",
    "|---|---|---|---|---|---|",
  ];
  for (const a of adaylar) {
    const betik = a.betikler.length ? `${a.betikler.length}${a.agIpucu ? " ⚠ ağ" : ""}` : "yok";
    const bag = `[${mdKod(a.repo)}](https://github.com/${a.repo}/tree/${a.sha}/${a.yol.split("/").map(encodeURIComponent).join("/")})`;
    satirlar.push(`| ${mdKod(a.id)} | ${bag} | ${a.yildiz} | ${mdKod(a.lisans)} | ${betik} | ${tabloHucre(a.aciklama)} |`);
  }
  if (adaylar.some((a) => a.agIpucu)) satirlar.push("", "⚠ ağ: betiklerde ağa bağlanan kod izi var; birleştirmeden önce mutlaka okuyun.");
  satirlar.push("");
  return satirlar.join("\n");
}

/**
 * `npx skills` kilit dosyasından (~/.agents/.skill-lock.json) GitHub kaynaklı skill'lerin repo ve
 * klasör yollarını okur. Bilgisayarda kurulu skill'leri kataloğa aday yapmak için.
 */
export function yerelKaynaklar(kilitMetni: string): { repo: string; yol: string }[] {
  const veri = JSON.parse(kilitMetni) as { skills?: Record<string, { source?: string; sourceType?: string; skillPath?: string }> };
  const sonuc: { repo: string; yol: string }[] = [];
  for (const s of Object.values(veri.skills ?? {})) {
    if (s.sourceType !== "github" || !s.source || !s.skillPath?.endsWith("/SKILL.md")) continue;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s.source)) continue;
    sonuc.push({ repo: s.source, yol: s.skillPath.slice(0, -"/SKILL.md".length) });
  }
  return sonuc;
}
