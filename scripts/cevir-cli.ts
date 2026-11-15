import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "yaml";
import { cevrilecekMi, taslakCevir, topluCevir, type CeviriOgesi, type Sohbet } from "./cevir.js";
import { ikonSvg, kapakSvg } from "./gorsel-uret.js";
import { gunlukSatiri } from "./gunluk.js";
import { KayitSemasi } from "./sema.js";

/**
 * Kullanım: npm run cevir -- [--kayitlar kayitlar] [--gorseller gorseller] [--model haiku]
 * Keşfin yazdığı, henüz çevrilmemiş taslak kayıtları (`# TASLAK (keşif): Türkçe metinleri düzeltin`)
 * yerel Claude Code ile tek istekte Türkçeye çevirir ve varsayılan ikon/kapaklarını yeniden üretir.
 * Bakımcının bilgisayarında çalışır (Claude aboneliği); GitHub Actions'ta çalışmaz.
 * claude.exe yolu CLAUDE_KOMUT ile değiştirilebilir.
 * Çıkış kodu: 0 = başarılı (bazı kayıtlar çevrilmemiş olabilir), 1 = hata.
 */

function claudeYolu(): string {
  if (process.env.CLAUDE_KOMUT) return process.env.CLAUDE_KOMUT;
  const npmExe = process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  return npmExe && existsSync(npmExe) ? npmExe : "claude";
}

/** Claude Code'u araçsız, MCP'siz ve oturum kaydetmeden çalıştırır; istem stdin'den gider. */
function claudeSohbet(model: string): Sohbet {
  return (istem) =>
    new Promise((coz, reddet) => {
      const surec = spawn(
        claudeYolu(),
        ["-p", "--model", model, "--system-prompt", "Sen bir çevirmensin. Yalnız istenen JSON'u yaz.",
          "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--output-format", "text"],
        { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
      );
      let cikti = "";
      let hata = "";
      const zaman = setTimeout(() => surec.kill(), 300_000);
      surec.stdout.on("data", (p) => (cikti += p));
      surec.stderr.on("data", (p) => (hata += p));
      surec.on("error", (e) => { clearTimeout(zaman); reddet(e); });
      surec.on("close", (kod) => {
        clearTimeout(zaman);
        if (kod === 0) coz(cikti);
        else reddet(new Error(`claude çıkış kodu ${kod}: ${hata.trim().slice(0, 300)}`));
      });
      surec.stdin.end(istem, "utf8");
    });
}

async function atomikYaz(yol: string, metin: string) {
  await writeFile(`${yol}.tmp`, metin, "utf8");
  await rename(`${yol}.tmp`, yol);
}

async function ana(): Promise<number> {
  const { values } = parseArgs({
    options: {
      kayitlar: { type: "string", default: "kayitlar" },
      gorseller: { type: "string", default: "gorseller" },
      model: { type: "string", default: "haiku" },
    },
  });
  const klasor = resolve(values.kayitlar);
  const gorselKlasoru = resolve(values.gorseller);
  const uyar = (m: string) => console.error(gunlukSatiri("uyarı", m));

  const taslaklar: { dosya: string; metin: string; oge: CeviriOgesi }[] = [];
  for (const ad of (await readdir(klasor)).filter((f) => f.endsWith(".yaml")).sort()) {
    const dosya = join(klasor, ad);
    const metin = await readFile(dosya, "utf8");
    if (!cevrilecekMi(metin)) continue;
    const k = parse(metin) as { id: string; ad: string; en?: { ad?: string; neIseYarar?: string[] } };
    const aciklama = (k.en?.neIseYarar ?? []).filter((m) => !/^(Kaynak:|Betik içerir:|Yalnız talimat)/.test(m)).join(" ");
    taslaklar.push({ dosya, metin, oge: { id: k.id, ad: k.en?.ad ?? k.ad, aciklama: aciklama || k.ad } });
  }
  if (!taslaklar.length) {
    console.log("Çevrilecek taslak yok.");
    return 0;
  }

  const ceviriler = await topluCevir(taslaklar.map((t) => t.oge), claudeSohbet(values.model), uyar);
  let yazilan = 0;
  for (const t of taslaklar) {
    const tr = ceviriler.get(t.oge.id);
    if (!tr) continue;
    const yeni = taslakCevir(t.metin, tr);
    const kayit = KayitSemasi.parse(parse(yeni));
    await atomikYaz(t.dosya, yeni);
    // Varsayılan görseller ad, açıklama ve kategori rengini taşır: Türkçe hâliyle yeniden üret.
    const kendi = join(gorselKlasoru, kayit.id);
    if (kayit.gorseller?.ikon === `gorseller/${kayit.id}/ikon.svg` && existsSync(kendi)) await atomikYaz(join(kendi, "ikon.svg"), ikonSvg(kayit));
    if (kayit.gorseller?.kapak === `gorseller/${kayit.id}/kapak.svg` && existsSync(kendi)) await atomikYaz(join(kendi, "kapak.svg"), kapakSvg(kayit));
    yazilan++;
  }
  console.log(`${taslaklar.length} taslaktan ${yazilan} tanesi Türkçeye çevrildi.`);
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
