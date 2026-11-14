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
//
// İleriye uyumluluk: Bu dosya uygulamaya kopyalanır ve uygulama indirdiği catalog.json'ı
// KatalogSemasi ile doğrular. Bu yüzden yayınlanan Skill/Katalog nesneleri bilinmeyen alanları
// reddetmez, sessizce atar (zod varsayılanı). Bilinmeyen bir kategori "diger"e düşer. Sahibinin
// elle yazdığı Kayit ise yazım hatalarını yakalamak için `.strict()` kalır.

const KATEGORI_IDLERI = KATEGORILER.map((k) => k.id) as unknown as [KategoriId, ...KategoriId[]];

const metin = z.string().trim().min(1, "boş olamaz");
const metinListesi = z.array(metin);

/**
 * Göreli yol ("/" ayraçlı). Reddedilenler: baştaki "/", ters bölü, ":" (Windows sürücü öneki),
 * denetim karakterleri, boş parça ("a//b", sondaki "/") ve yalnız nokta/boşluktan oluşan parça
 * (".", "..", ".. " — Windows sondaki nokta ve boşlukları atar).
 */
const guvenliYol = z
  .string()
  .min(1, "boş olamaz")
  .refine((y) => !/[\\:\u0000-\u001f\u007f]/.test(y), "ters bölü, \":\" ya da denetim karakteri içeremez")
  .refine((y) => y.split("/").every((p) => p.length > 0 && !/^[. ]+$/.test(p)), "boş, \".\" ya da \"..\" parça içeremez");

const httpsUrl = z.string().url("geçerli bir URL olmalı").refine((u) => u.startsWith("https://"), "https ile başlamalı");

/**
 * Kayıttaki görsel: `gorseller/` altında göreli yol ya da https URL. Yalnız `gorseller/` yayınlandığı
 * için başka bir göreli yol (.github/…, kayitlar/…) kırık bağlantı olurdu.
 */
const gorselYolu = z
  .string()
  .refine(
    (y) =>
      y.includes("://")
        ? httpsUrl.safeParse(y).success
        : guvenliYol.safeParse(y).success && y.startsWith("gorseller/"),
    "\"gorseller/\" altında göreli yol ya da https URL olmalı",
  );

/** Git dal adı (git check-ref-format kurallarının özü). */
const dalAdi = z
  .string()
  .min(1, "boş olamaz")
  .refine(
    (d) =>
      !/[\s\u0000-\u001f\u007f~^:?*[\\]/.test(d) &&
      !d.includes("..") &&
      !d.includes("@{") &&
      !d.startsWith("-") &&
      !d.endsWith(".lock") &&
      d.split("/").every((p) => p.length > 0 && !p.startsWith(".")),
    "geçerli bir git dal adı olmalı",
  );

const kaynakAlanlari = {
  repo: z
    .string()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "\"sahip/ad\" biçiminde olmalı")
    // Desen "../x" gibi yalnız noktadan oluşan parçaları da kabul ediyor; onları ayrıca reddet.
    .refine((r) => r.split("/").every((p) => !/^\.+$/.test(p)), "\".\" ya da \"..\" parça olamaz"),
  yol: guvenliYol,
  dal: dalAdi,
  sha: z.string().regex(/^[0-9a-f]{40}$/, "40 karakterlik commit sha olmalı"),
};

const uyumAlanlari = {
  durum: z.enum(["calisir", "calismaz", "bilinmiyor"]),
  neden: metin.optional(),
  sahibiDenedi: z.boolean(),
};

const ornekAlanlari = {
  tur: z.enum(["gorsel", "video"]),
  baslik: metin,
  uretici: metin.optional(),
  url: httpsUrl,
  kapak: httpsUrl.optional(),
};

const nasilKullanilirAlanlari = { claude: metinListesi.optional(), antigravity: metinListesi.optional() };

// ---- Kayıt (sıkı: bilinmeyen alan yazım hatasıdır) ----

const sikiUyum = z.object(uyumAlanlari).strict();

export const KayitSemasi: z.ZodType<Kayit> = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "küçük harf, rakam ve tire olmalı (en çok 64 karakter)"),
    ad: metin,
    kisaAciklama: metin,
    neIseYarar: metinListesi,
    kategori: z.enum(KATEGORI_IDLERI),
    kaynak: z.object(kaynakAlanlari).strict(),
    gorseller: z
      .object({ ikon: gorselYolu.optional(), kapak: gorselYolu.optional(), onceSonra: z.array(gorselYolu).optional() })
      .strict()
      .optional(),
    ornekCumleler: metinListesi,
    nasilKullanilir: z.object(nasilKullanilirAlanlari).strict().optional(),
    uyumluluk: z.object({ claude: sikiUyum, antigravity: sikiUyum }).strict(),
    dogrulandi: z.boolean().optional(),
    oneCikan: z.boolean().optional(),
    haftaninSkilli: z.boolean().optional(),
    ornekler: z.array(z.object(ornekAlanlari).strict()).optional(),
    benzerler: z.array(z.string()).optional(),
    otomatikGuncelle: z.boolean().default(false),
  })
  .strict();

// ---- Katalog (hoşgörülü: bilinmeyen alanlar atılır) ----

/** Bilinmeyen kategori kimliği eski uygulama sürümlerinde "diger" olarak gösterilir. */
const skillKategorisi = z
  .custom<KategoriId>((v) => typeof v === "string" && v.length > 0, "kategori boş olamaz")
  .transform((v): KategoriId => ((KATEGORI_IDLERI as readonly string[]).includes(v) ? v : "diger"));

/**
 * Katalogdaki kategori listesi biçim olarak denetlenir, ardından bu sürümün bildiği sabit listeyle
 * değiştirilir (yeni kategoriler eski sürümde ayrı raf açmaz, skill'leri "diger"e düşer).
 */
const kategorilerSemasi = z
  .custom<typeof KATEGORILER>(
    (v) =>
      Array.isArray(v) &&
      v.every((k) => typeof k === "object" && k !== null && typeof k.id === "string" && typeof k.ad === "string"),
    "kategoriler { id, ad } listesi olmalı",
  )
  .transform(() => KATEGORILER);

/**
 * Bilinmeyen enum değeri için hoşgörülü alan: boş olmayan bir metin olmalı, tanınmıyorsa
 * `yedek` değerine düşer (eski uygulama sürümü yeni bir değer yüzünden kataloğu reddetmesin).
 */
function yumusakEnum<T extends string>(degerler: readonly T[], yedek: T) {
  return z
    .custom<T>((v) => typeof v === "string" && v.length > 0, "boş olmayan bir metin olmalı")
    .transform((v): T => ((degerler as readonly string[]).includes(v) ? v : yedek));
}

const UYUM_DURUMLARI = ["calisir", "calismaz", "bilinmiyor"] as const;
const LISANS_DURUMLARI = ["acik", "kisitli", "yok"] as const;
const ORNEK_TURLERI = ["gorsel", "video"] as const;

const uyum = z.object({ ...uyumAlanlari, durum: yumusakEnum(UYUM_DURUMLARI, "bilinmiyor") });

/** Türü tanınmayan örnekler doğrulanmadan önce listeden atılır; tanınanlar tam doğrulanır. */
const yayinOrnekleri = z
  .array(z.any())
  .transform((liste) =>
    liste.filter(
      (o) => !(typeof o === "object" && o !== null && typeof o.tur === "string" && !(ORNEK_TURLERI as readonly string[]).includes(o.tur)),
    ),
  )
  .pipe(z.array(z.object(ornekAlanlari)));

const SkillSemasi: z.ZodType<Skill> = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  ad: metin,
  kisaAciklama: metin,
  neIseYarar: metinListesi,
  kategori: skillKategorisi,
  kaynak: z.object({ ...kaynakAlanlari, url: httpsUrl }),
  gorseller: z.object({ ikon: httpsUrl.optional(), kapak: httpsUrl.optional(), onceSonra: z.array(httpsUrl) }),
  ornekCumleler: metinListesi,
  nasilKullanilir: z.object(nasilKullanilirAlanlari),
  uyumluluk: z.object({ claude: uyum, antigravity: uyum }),
  dogrulandi: z.boolean(),
  oneCikan: z.boolean(),
  haftaninSkilli: z.boolean(),
  ornekler: yayinOrnekleri,
  benzerler: z.array(z.string()),
  otomatikGuncelle: z.boolean(),
  surum: metin,
  guncellemeTarihi: z.string().datetime({ offset: true }),
  lisans: z.object({ spdx: z.string().nullable(), durum: yumusakEnum(LISANS_DURUMLARI, "kisitli") }),
  yildiz: z.number().int().nonnegative(),
  yazar: metin,
  readme: z.string(),
  dosyalar: z.array(z.object({ yol: guvenliYol, boyut: z.number().int().nonnegative() })),
  boyut: z.number().int().nonnegative(),
  guvenlik: z.object({ betikler: z.array(z.string()), agIpucu: z.boolean() }),
});

export const KatalogSemasi: z.ZodType<Katalog> = z.object({
  surum: z.literal(1),
  olusturulma: z.string().datetime({ offset: true }),
  kategoriler: kategorilerSemasi,
  skills: z.array(SkillSemasi),
});
