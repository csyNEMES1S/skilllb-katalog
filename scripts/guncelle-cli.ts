import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { githubGetirici } from "./getirici.js";
import { guncellemeleriBul, kayitDosyasiGuncelle } from "./guncelleme.js";
import { kayitlariOku } from "./kayitOku.js";

/**
 * Kullanım:
 *   npm run guncelle -- [--kayitlar kayitlar] [--cikti dist/guncellemeler.json]
 *     Kaynaklarda yeni sürüm arar, bulunanları (Guncelleme[]) JSON olarak yazar. Yoksa `[]` yazar.
 *     GITHUB_TOKEN varsa istekler onunla yapılır. Hiçbir kaydı değiştirmez.
 *   npm run guncelle -- --uygula <id> <yeniSha> [--kayitlar kayitlar]
 *     `kayitlar/<id>.yaml` içindeki kaynak.sha değerini yorumlara dokunmadan değiştirir (iş akışı PR dalında çağırır).
 * Çıkış kodu: 0 = başarılı (bazı kayıtlar uyarıyla atlanmış olabilir), 1 = hata.
 */
async function ana(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      kayitlar: { type: "string", default: "kayitlar" },
      cikti: { type: "string", default: "dist/guncellemeler.json" },
      uygula: { type: "boolean", default: false },
    },
  });

  if (values.uygula) {
    if (positionals.length !== 2) throw new Error("kullanım: --uygula <id> <yeniSha>");
    const [id, sha] = positionals;
    await kayitDosyasiGuncelle(resolve(values.kayitlar), id, sha);
    console.log(`kayitlar/${id}.yaml: kaynak.sha -> ${sha}`);
    return 0;
  }
  if (positionals.length) throw new Error(`beklenmeyen argüman: ${positionals.join(" ")}`);

  const kayitlar = await kayitlariOku(resolve(values.kayitlar));
  const uyar = (m: string) => console.error(`uyarı: ${m}`);
  const guncellemeler = await guncellemeleriBul(kayitlar, githubGetirici(process.env.GITHUB_TOKEN || undefined), uyar);

  const cikti = resolve(values.cikti);
  await mkdir(dirname(cikti), { recursive: true });
  const gecici = `${cikti}.tmp`;
  await writeFile(gecici, `${JSON.stringify(guncellemeler, null, 2)}\n`, "utf8");
  await rename(gecici, cikti);
  console.log(`${guncellemeler.length} güncelleme yazıldı: ${cikti}`);
  return 0;
}

ana().then(
  (kod) => {
    process.exitCode = kod;
  },
  (e: unknown) => {
    console.error(`hata: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  },
);
