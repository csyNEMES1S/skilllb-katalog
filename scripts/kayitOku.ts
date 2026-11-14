import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { KayitSemasi, type Kayit } from "./sema.js";

/**
 * `klasor` içindeki `*.yaml` kayıtlarını okur ve doğrular.
 * İlk hatada `"<dosya adı>: <zod yolu> <mesaj>"` biçiminde bir hata fırlatır.
 */
export async function kayitlariOku(klasor: string): Promise<Kayit[]> {
  const dosyalar = (await readdir(klasor)).filter((d) => d.endsWith(".yaml")).sort();
  const kayitlar: Kayit[] = [];

  for (const dosya of dosyalar) {
    let ham: unknown;
    try {
      ham = parse(await readFile(join(klasor, dosya), "utf8"));
    } catch (e) {
      throw new Error(`${dosya}: YAML okunamadı: ${(e as Error).message}`);
    }

    const sonuc = KayitSemasi.safeParse(ham);
    if (!sonuc.success) {
      const sorun = sonuc.error.issues[0];
      const yol = sorun.path.length ? sorun.path.join(".") : "(kök)";
      throw new Error(`${dosya}: ${yol} ${sorun.message}`);
    }

    const beklenenId = dosya.slice(0, -".yaml".length);
    if (sonuc.data.id !== beklenenId) {
      throw new Error(`${dosya}: id dosya adıyla aynı olmalı (beklenen "${beklenenId}", bulunan "${sonuc.data.id}")`);
    }

    kayitlar.push(sonuc.data);
  }

  return kayitlar;
}
