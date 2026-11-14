import type { Skill } from "./sema.js";

export type AgacGirdisi = { yol: string; tur: "blob" | "tree"; boyut: number };

export interface Getirici {
  commit(repo: string, sha: string): Promise<{ sha: string; tarih: string }>;
  sonCommit(repo: string, dal: string, yol: string): Promise<{ sha: string; tarih: string }>; // yolu etkileyen son commit
  agac(repo: string, sha: string): Promise<{ yol: string; tur: "blob" | "tree"; boyut: number }[]>; // tüm repo, recursive
  dosya(repo: string, sha: string, yol: string): Promise<string>; // raw.githubusercontent.com
  repoBilgi(repo: string): Promise<{ yildiz: number; sahip: string; lisansSpdx: string | null }>;
}

/** Kaynakta istenen şey yok (HTTP 404, boş commit listesi). Çağıran bu kaydı atlayabilir. */
export class BulunamadiHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "BulunamadiHatasi";
  }
}

/** GitHub ağacı kesik (truncated) döndürdü: dosya listesi eksik olurdu. Çağıran bu kaydı atlayabilir. */
export class KesikAgacHatasi extends Error {
  constructor(mesaj: string) {
    super(mesaj);
    this.name = "KesikAgacHatasi";
  }
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

/** "a/b c" -> "a/b%20c": her parça ayrı kodlanır, "/" ayraçları korunur. */
const yolKodla = (yol: string) => yol.split("/").map(encodeURIComponent).join("/");

/** GitHub uç noktalarının adresleri (saf; ağa çıkmaz). `repo` şemada "sahip/ad" olarak doğrulanmıştır. */
export const githubAdresleri = {
  commit: (repo: string, sha: string) => `${API}/repos/${repo}/commits/${encodeURIComponent(sha)}`,
  sonCommit: (repo: string, dal: string, yol: string) =>
    `${API}/repos/${repo}/commits?${new URLSearchParams({ sha: dal, path: yol, per_page: "1" })}`,
  agac: (repo: string, sha: string) => `${API}/repos/${repo}/git/trees/${encodeURIComponent(sha)}?recursive=1`,
  repo: (repo: string) => `${API}/repos/${repo}`,
  dosya: (repo: string, sha: string, yol: string) => `${RAW}/${repo}/${encodeURIComponent(sha)}/${yolKodla(yol)}`,
};

type CommitYaniti = { sha: string; commit: { committer: { date: string } } };
const commitDonustur = (c: CommitYaniti) => ({ sha: c.sha, tarih: c.commit.committer.date });

/** GitHub REST API ve raw.githubusercontent.com üzerinden çalışan getirici. */
export function githubGetirici(token?: string): Getirici {
  async function iste(url: string, json: boolean): Promise<Response> {
    const basliklar: Record<string, string> = { "User-Agent": "skilllb-katalog" };
    if (json) {
      basliklar.Accept = "application/vnd.github+json";
      basliklar["X-GitHub-Api-Version"] = "2022-11-28";
    }
    if (token) basliklar.Authorization = `Bearer ${token}`;
    const yanit = await fetch(url, { headers: basliklar });
    if (yanit.status === 404) throw new BulunamadiHatasi(`bulunamadı (404): ${url}`);
    if (!yanit.ok) throw new Error(`GitHub isteği başarısız (${yanit.status} ${yanit.statusText}): ${url}`);
    return yanit;
  }
  const jsonAl = async <T>(url: string): Promise<T> => (await (await iste(url, true)).json()) as T;

  return {
    async commit(repo, sha) {
      return commitDonustur(await jsonAl<CommitYaniti>(githubAdresleri.commit(repo, sha)));
    },
    async sonCommit(repo, dal, yol) {
      const liste = await jsonAl<CommitYaniti[]>(githubAdresleri.sonCommit(repo, dal, yol));
      if (!liste.length) throw new BulunamadiHatasi(`${repo}: "${dal}" dalında "${yol}" yolunu etkileyen commit yok`);
      return commitDonustur(liste[0]);
    },
    async agac(repo, sha) {
      const y = await jsonAl<{ truncated: boolean; tree: { path: string; type: string; size?: number }[] }>(
        githubAdresleri.agac(repo, sha),
      );
      // Kesik ağaç eksik bir dosya listesi üretir; sessizce yanlış yayınlamaktansa dur.
      if (y.truncated) throw new KesikAgacHatasi(`${repo}@${sha}: ağaç çok büyük, GitHub eksik (truncated) döndürdü`);
      return y.tree
        .filter((g) => g.type === "blob" || g.type === "tree") // "commit" = alt modül, atlanır
        .map((g) => ({ yol: g.path, tur: g.type as "blob" | "tree", boyut: g.size ?? 0 }));
    },
    async dosya(repo, sha, yol) {
      return (await iste(githubAdresleri.dosya(repo, sha, yol), false)).text();
    },
    async repoBilgi(repo) {
      const y = await jsonAl<{ stargazers_count: number; owner: { login: string }; license: { spdx_id: string | null } | null }>(
        githubAdresleri.repo(repo),
      );
      return { yildiz: y.stargazers_count, sahip: y.owner.login, lisansSpdx: y.license?.spdx_id ?? null };
    },
  };
}

/** Ağaçtan `skillYolu` altındaki dosyaları (yalnız blob) skill klasörüne göre göreli ve sıralı döndürür. */
export function dosyaListesi(
  agac: Awaited<ReturnType<Getirici["agac"]>>,
  skillYolu: string,
): { yol: string; boyut: number }[] {
  const onek = skillYolu ? `${skillYolu.replace(/\/+$/, "")}/` : "";
  return agac
    .filter((g) => g.tur === "blob" && g.yol.startsWith(onek))
    .map((g) => ({ yol: g.yol.slice(onek.length), boyut: g.boyut }))
    .sort((a, b) => (a.yol < b.yol ? -1 : a.yol > b.yol ? 1 : 0));
}

/** Skill klasörünün kökündeki LICENSE* / LICENCE* dosyası. */
export const lisansDosyasiMi = (yol: string) => !yol.includes("/") && /^licen[cs]e/i.test(yol);

/**
 * Lisans adı yalnız metnin başlığında (ilk üç dolu satır) aranır: kapalı bir lisansın gövdesindeki
 * "üçüncü taraf bileşenler MIT License altında" gibi bir anma onu açık lisans yapmaz.
 * Apache'nin kısa bildirim biçimi ("Licensed under the Apache License") metnin her yerinde geçerlidir.
 */
function metindenSpdx(metin: string): string | null {
  const baslik = metin
    .split(/\r?\n/)
    .filter((s) => s.trim())
    .slice(0, 3)
    .join("\n");
  if (/Apache License/i.test(baslik) || /Licensed under the Apache License/i.test(metin)) return "Apache-2.0";
  if (/MIT License/i.test(baslik)) return "MIT";
  if (/\bBSD\b/.test(baslik)) return /Neither the name|3-Clause/i.test(metin) ? "BSD-3-Clause" : "BSD-2-Clause";
  return null;
}

/**
 * Skill klasöründe lisans dosyası varsa o belirler (metin tanınan açık lisanssa `acik`, değilse
 * ya da metin verilmemişse `kisitli`). Yoksa repo lisansı: null/NOASSERTION -> `yok`, değilse `acik`.
 */
export function lisansBelirle(repoSpdx: string | null, dosyalar: { yol: string }[], lisansMetni?: string): Skill["lisans"] {
  if (dosyalar.some((d) => lisansDosyasiMi(d.yol))) {
    const spdx = lisansMetni ? metindenSpdx(lisansMetni) : null;
    return spdx ? { spdx, durum: "acik" } : { spdx: null, durum: "kisitli" };
  }
  if (repoSpdx === null || repoSpdx === "NOASSERTION") return { spdx: null, durum: "yok" };
  return { spdx: repoSpdx, durum: "acik" };
}
