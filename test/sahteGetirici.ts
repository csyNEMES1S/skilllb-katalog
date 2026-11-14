import { BulunamadiHatasi, type AgacGirdisi, type Getirici } from "../scripts/getirici.js";

/** Bellekteki tek bir reponun verisi. Olmayan her şey `BulunamadiHatasi` fırlatır. */
export type SahteRepo = {
  /** Varsayılan: yıldız 0, sahip = "owner/name" içindeki owner, lisans null. */
  bilgi?: { yildiz?: number; sahip?: string; lisansSpdx?: string | null };
  /** sha -> ISO commit tarihi */
  commitler?: Record<string, string>;
  /** Anahtar önce `"<dal>:<yol>"`, bulunamazsa `"<dal>"` olarak aranır. */
  sonCommitler?: Record<string, { sha: string; tarih: string }>;
  /** sha -> ağaç. Verilmezse `dosyalar[sha]` içeriğinden türetilir (boyut = UTF-8 bayt). */
  agaclar?: Record<string, AgacGirdisi[]>;
  /** sha -> (repo kökünden yol -> içerik) */
  dosyalar?: Record<string, Record<string, string>>;
};
export type SahteVeri = Record<string, SahteRepo>;
export type SahteCagri = { ad: keyof Getirici; argumanlar: string[] };

function agacTuret(dosyalar: Record<string, string>): AgacGirdisi[] {
  const klasorler = new Set<string>();
  const girdiler: AgacGirdisi[] = [];
  for (const [yol, icerik] of Object.entries(dosyalar)) {
    girdiler.push({ yol, tur: "blob", boyut: Buffer.byteLength(icerik, "utf8") });
    const parcalar = yol.split("/");
    for (let i = 1; i < parcalar.length; i++) klasorler.add(parcalar.slice(0, i).join("/"));
  }
  for (const k of klasorler) girdiler.push({ yol: k, tur: "tree", boyut: 0 });
  return girdiler.sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
}

/** Testler için ağa çıkmayan `Getirici`. Yapılan çağrılar `cagrilar` listesinde tutulur. */
export function sahteGetirici(veri: SahteVeri): Getirici & { cagrilar: SahteCagri[] } {
  const cagrilar: SahteCagri[] = [];
  const repoAl = (repo: string): SahteRepo => {
    const r = veri[repo];
    if (!r) throw new BulunamadiHatasi(`repo bulunamadı: ${repo}`);
    return r;
  };

  return {
    cagrilar,
    async commit(repo, sha) {
      cagrilar.push({ ad: "commit", argumanlar: [repo, sha] });
      const tarih = repoAl(repo).commitler?.[sha];
      if (!tarih) throw new BulunamadiHatasi(`commit bulunamadı: ${repo}@${sha}`);
      return { sha, tarih };
    },
    async sonCommit(repo, dal, yol) {
      cagrilar.push({ ad: "sonCommit", argumanlar: [repo, dal, yol] });
      const s = repoAl(repo).sonCommitler;
      const sonuc = s?.[`${dal}:${yol}`] ?? s?.[dal];
      if (!sonuc) throw new BulunamadiHatasi(`son commit bulunamadı: ${repo} ${dal} ${yol}`);
      return { ...sonuc };
    },
    async agac(repo, sha) {
      cagrilar.push({ ad: "agac", argumanlar: [repo, sha] });
      const r = repoAl(repo);
      const agac = r.agaclar?.[sha] ?? (r.dosyalar?.[sha] ? agacTuret(r.dosyalar[sha]) : undefined);
      if (!agac) throw new BulunamadiHatasi(`ağaç bulunamadı: ${repo}@${sha}`);
      return agac.map((g) => ({ ...g }));
    },
    async dosya(repo, sha, yol) {
      cagrilar.push({ ad: "dosya", argumanlar: [repo, sha, yol] });
      const icerik = repoAl(repo).dosyalar?.[sha]?.[yol];
      if (icerik === undefined) throw new BulunamadiHatasi(`dosya bulunamadı: ${repo}@${sha}/${yol}`);
      return icerik;
    },
    async repoBilgi(repo) {
      cagrilar.push({ ad: "repoBilgi", argumanlar: [repo] });
      const b = repoAl(repo).bilgi ?? {};
      return { yildiz: b.yildiz ?? 0, sahip: b.sahip ?? repo.split("/")[0], lisansSpdx: b.lisansSpdx ?? null };
    },
  };
}
