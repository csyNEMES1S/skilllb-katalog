import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { ciktiYaz, derle } from "./derle.js";
import { githubGetirici } from "./getirici.js";
import { gunlukSatiri } from "./gunluk.js";
import { kayitlariOku } from "./kayitOku.js";

const GORSEL_TABAN_URL = "https://csynemes1s.github.io/skilllb-katalog/";

/**
 * Kullanım: npm run derle -- --cikti dist/catalog.json [--kayitlar kayitlar] [--gorseller gorseller] [--site site]
 * Yollar çalışma klasörüne göredir. GITHUB_TOKEN varsa istekler onunla yapılır.
 * Çıkış kodu: 0 = katalog yazıldı (bazı kayıtlar atlanmış olabilir), 1 = hata ya da hiç skill yok.
 */
async function ana(): Promise<number> {
  const { values } = parseArgs({
    options: {
      cikti: { type: "string", default: "dist/catalog.json" },
      kayitlar: { type: "string", default: "kayitlar" },
      gorseller: { type: "string", default: "gorseller" },
      site: { type: "string", default: "site" },
    },
  });

  const kayitlar = await kayitlariOku(resolve(values.kayitlar));
  const uyar = (m: string) => console.error(gunlukSatiri("uyarı", m));
  const katalog = await derle(kayitlar, githubGetirici(process.env.GITHUB_TOKEN || undefined), GORSEL_TABAN_URL, uyar);

  const atlanan = kayitlar.length - katalog.skills.length;
  if (katalog.skills.length === 0) {
    console.error(`hata: hiç skill derlenemedi (${kayitlar.length} kayıt), catalog.json yazılmadı`);
    return 1;
  }

  const cikti = resolve(values.cikti);
  await ciktiYaz(katalog, cikti, resolve(values.gorseller), resolve(values.site));
  console.log(`${katalog.skills.length} skill yazıldı: ${cikti}`);
  if (atlanan > 0) console.error(`${atlanan} kayıt atlandı`);
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
