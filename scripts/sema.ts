import { z } from "zod";

export const KATEGORILER = [
  { id: "belge-ofis", ad: "Belge & Ofis" }, { id: "tasarim", ad: "Tasarım" },
  { id: "kod-test", ad: "Kod & Test" }, { id: "veri-grafik", ad: "Veri & Grafik" },
  { id: "yazi", ad: "Yazı" }, { id: "guvenlik", ad: "Güvenlik" }, { id: "diger", ad: "Diğer" },
] as const;
export type KategoriId = typeof KATEGORILER[number]["id"];
export type AracId = "claude" | "antigravity";           // uyumluluk anahtarları
export type Uyum = { durum: "calisir" | "calismaz" | "bilinmiyor"; neden?: string; sahibiDenedi: boolean };
export type Ornek = { tur: "gorsel" | "video"; baslik: string; uretici?: string; url: string; kapak?: string };

// Sahibinin yazdığı kayıt (kayitlar/<id>.yaml)
export type Kayit = {
  id: string;                       // ^[a-z0-9][a-z0-9-]{0,63}$ ve dosya adıyla aynı
  ad: string; kisaAciklama: string; neIseYarar: string[]; kategori: KategoriId;
  kaynak: { repo: string; yol: string; dal: string; sha: string };  // repo: "owner/name", sha: 40 hex
  gorseller?: { ikon?: string; kapak?: string; onceSonra?: string[] };   // repo içi göreli yol ya da https URL
  ornekCumleler: string[];
  nasilKullanilir?: { claude?: string[]; antigravity?: string[] };     // yoksa uygulama varsayılan adımları gösterir
  uyumluluk: Record<AracId, Uyum>;
  dogrulandi?: boolean; oneCikan?: boolean; haftaninSkilli?: boolean;
  ornekler?: Ornek[]; benzerler?: string[]; otomatikGuncelle?: boolean;
};

// Yayınlanan skill (catalog.json içinde)
export type Skill = Required<Omit<Kayit, "kaynak" | "gorseller" | "nasilKullanilir">> & {
  kaynak: Kayit["kaynak"] & { url: string };     // https://github.com/<repo>/tree/<sha>/<yol>
  gorseller: { ikon?: string; kapak?: string; onceSonra: string[] };   // hepsi mutlak https URL
  nasilKullanilir: { claude?: string[]; antigravity?: string[] };
  surum: string;                    // SKILL.md "version" alanı, yoksa commit tarihi "YYYY-MM-DD"
  guncellemeTarihi: string;         // sabit sha'nın commit tarihi, ISO
  lisans: { spdx: string | null; durum: "acik" | "kisitli" | "yok" };
  yildiz: number; yazar: string;    // yazar = repo sahibi
  readme: string;                   // SKILL.md gövdesi (frontmatter hariç), markdown
  dosyalar: { yol: string; boyut: number }[];   // skill klasörüne göre göreli, özyinelemeli
  boyut: number;                    // dosyalar toplamı, bayt
  guvenlik: { betikler: string[]; agIpucu: boolean };
};
export type Katalog = { surum: 1; olusturulma: string; kategoriler: typeof KATEGORILER; skills: Skill[] };

// ---- Ortak parçalar ----

const KATEGORI_IDLERI = KATEGORILER.map((k) => k.id) as unknown as [KategoriId, ...KategoriId[]];

const metin = z.string().trim().min(1, "boş olamaz");
const metinListesi = z.array(metin);

/** Göreli yol: boş değil, "/" ya da "\" ile başlamaz, ".." parçası içermez. */
const guvenliYol = z
  .string()
  .min(1, "boş olamaz")
  .refine((y) => !/^[\\/]/.test(y), "\"/\" ile başlayamaz")
  .refine((y) => !y.split(/[\\/]/).includes(".."), "\"..\" içeremez");

const httpsUrl = z.string().url("geçerli bir URL olmalı").refine((u) => u.startsWith("https://"), "https ile başlamalı");

/** Kayıttaki görsel: repo içi göreli yol ya da https URL. */
const gorselYolu = z
  .string()
  .refine(
    (y) => (y.includes("://") ? httpsUrl.safeParse(y).success : guvenliYol.safeParse(y).success),
    "repo içi göreli yol ya da https URL olmalı",
  );

const kaynakSemasi = z
  .object({
    repo: z
      .string()
      .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "\"sahip/ad\" biçiminde olmalı")
      // Desen "../x" gibi yalnız noktadan oluşan parçaları da kabul ediyor; onları ayrıca reddet.
      .refine((r) => r.split("/").every((p) => !/^\.+$/.test(p)), "\".\" ya da \"..\" parça olamaz"),
    yol: guvenliYol,
    dal: metin,
    sha: z.string().regex(/^[0-9a-f]{40}$/, "40 karakterlik commit sha olmalı"),
  })
  .strict();

const UyumSemasi: z.ZodType<Uyum> = z
  .object({
    durum: z.enum(["calisir", "calismaz", "bilinmiyor"]),
    neden: metin.optional(),
    sahibiDenedi: z.boolean(),
  })
  .strict();

const uyumlulukSemasi = z.object({ claude: UyumSemasi, antigravity: UyumSemasi }).strict();

const OrnekSemasi: z.ZodType<Ornek> = z
  .object({
    tur: z.enum(["gorsel", "video"]),
    baslik: metin,
    uretici: metin.optional(),
    url: httpsUrl,
    kapak: httpsUrl.optional(),
  })
  .strict();

const nasilKullanilirSemasi = z
  .object({ claude: metinListesi.optional(), antigravity: metinListesi.optional() })
  .strict();

// ---- Kayıt ----

export const KayitSemasi: z.ZodType<Kayit> = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "küçük harf, rakam ve tire olmalı (en çok 64 karakter)"),
    ad: metin,
    kisaAciklama: metin,
    neIseYarar: metinListesi,
    kategori: z.enum(KATEGORI_IDLERI),
    kaynak: kaynakSemasi,
    gorseller: z
      .object({ ikon: gorselYolu.optional(), kapak: gorselYolu.optional(), onceSonra: z.array(gorselYolu).optional() })
      .strict()
      .optional(),
    ornekCumleler: metinListesi,
    nasilKullanilir: nasilKullanilirSemasi.optional(),
    uyumluluk: uyumlulukSemasi,
    dogrulandi: z.boolean().optional(),
    oneCikan: z.boolean().optional(),
    haftaninSkilli: z.boolean().optional(),
    ornekler: z.array(OrnekSemasi).optional(),
    benzerler: z.array(z.string()).optional(),
    otomatikGuncelle: z.boolean().default(false),
  })
  .strict();

// ---- Katalog ----

const SkillSemasi: z.ZodType<Skill> = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    ad: metin,
    kisaAciklama: metin,
    neIseYarar: metinListesi,
    kategori: z.enum(KATEGORI_IDLERI),
    kaynak: kaynakSemasi.extend({ url: httpsUrl }),
    gorseller: z
      .object({ ikon: httpsUrl.optional(), kapak: httpsUrl.optional(), onceSonra: z.array(httpsUrl) })
      .strict(),
    ornekCumleler: metinListesi,
    nasilKullanilir: nasilKullanilirSemasi,
    uyumluluk: uyumlulukSemasi,
    dogrulandi: z.boolean(),
    oneCikan: z.boolean(),
    haftaninSkilli: z.boolean(),
    ornekler: z.array(OrnekSemasi),
    benzerler: z.array(z.string()),
    otomatikGuncelle: z.boolean(),
    surum: metin,
    guncellemeTarihi: z.string().datetime({ offset: true }),
    lisans: z
      .object({ spdx: z.string().nullable(), durum: z.enum(["acik", "kisitli", "yok"]) })
      .strict(),
    yildiz: z.number().int().nonnegative(),
    yazar: metin,
    readme: z.string(),
    dosyalar: z.array(z.object({ yol: guvenliYol, boyut: z.number().int().nonnegative() }).strict()),
    boyut: z.number().int().nonnegative(),
    guvenlik: z.object({ betikler: z.array(z.string()), agIpucu: z.boolean() }).strict(),
  })
  .strict();

const kategorilerSemasi = z.custom<typeof KATEGORILER>(
  (v) => JSON.stringify(v) === JSON.stringify(KATEGORILER),
  "kategoriler sabit listeyle aynı olmalı",
);

export const KatalogSemasi: z.ZodType<Katalog> = z
  .object({
    surum: z.literal(1),
    olusturulma: z.string().datetime({ offset: true }),
    kategoriler: kategorilerSemasi,
    skills: z.array(SkillSemasi),
  })
  .strict();
