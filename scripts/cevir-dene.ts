import { githubModelsSohbet } from "./cevir.js";

/** Tanı: GitHub Models'e tek bir çeviri isteği gönderir, sonucu ya da hatayı yazar (GitHub Actions'ta çalışır). */
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN yok");
githubModelsSohbet(token)("Şu cümleyi Türkçeye çevir, yalnız çeviriyi yaz: Writes tests for your code.").then(
  (y) => console.log(`GitHub Models çalışıyor: ${y.slice(0, 100)}`),
  (e: unknown) => {
    console.error(`GitHub Models hatası: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  },
);
