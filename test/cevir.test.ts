import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { turkceTaslak } from "../scripts/cevir.js";
import { taslakYaml, type Aday } from "../scripts/kesif.js";
import { KayitSemasi } from "../scripts/sema.js";

const aday: Aday = {
  id: "yeni", repo: "ali/iyi", yol: "skills/yeni", dal: "main", sha: "b".repeat(40), ad: "yeni",
  aciklama: "Writes tests for your code.", lisans: "MIT", yildiz: 5, betikler: [], agIpucu: false,
};
const iyiYanit = JSON.stringify({
  ad: "Test Yazarı", kisaAciklama: "Kodun için test yazar.",
  neIseYarar: ["Birim test yazar.", "Hataları bulur.", "Kapsamı artırır."],
  ornekCumleler: ["Bu fonksiyona test yaz.", "Testleri çalıştır."], kategori: "kod-test",
});

describe("turkceTaslak", () => {
  it("geçerli JSON yanıtını Türkçe alanlara çevirir ve taslak kayda koyar", async () => {
    const tr = await turkceTaslak(aday, async () => "```json\n" + iyiYanit + "\n```");
    expect(tr).toMatchObject({ ad: "Test Yazarı", kategori: "kod-test" });
    const kayit = KayitSemasi.parse(parse(taslakYaml(aday, tr!)));
    expect(kayit.ad).toBe("Test Yazarı");
    expect(kayit.kategori).toBe("kod-test");
    expect(kayit.en?.kisaAciklama).toBe("Writes tests for your code.");
  });

  it("bozuk, eksik ya da kurala uymayan yanıtta null döner (taslak İngilizce kalır)", async () => {
    expect(await turkceTaslak(aday, async () => "çeviremedim")).toBeNull();
    expect(await turkceTaslak(aday, async () => JSON.stringify({ ad: "X" }))).toBeNull();
    const cokUzun = JSON.parse(iyiYanit); cokUzun.kisaAciklama = "x".repeat(121);
    expect(await turkceTaslak(aday, async () => JSON.stringify(cokUzun))).toBeNull();
    // Biraz uzun açıklama sözcük sınırında kısaltılır (modeller 60 sınırını sık aşıyor).
    const uzun = JSON.parse(iyiYanit);
    uzun.kisaAciklama = "Test başlatmadan önce örnek boyutunu hesaplar ve hipotezi baştan belirler.";
    const k = await turkceTaslak(aday, async () => JSON.stringify(uzun));
    expect(k!.kisaAciklama.length).toBeLessThanOrEqual(60);
    expect(k!.kisaAciklama).toBe("Test başlatmadan önce örnek boyutunu hesaplar ve hipotezi…");
    const kat = JSON.parse(iyiYanit); kat.kategori = "bilinmeyen";
    expect(await turkceTaslak(aday, async () => JSON.stringify(kat))).toBeNull();
    expect(await turkceTaslak(aday, async () => { throw new Error("ağ"); })).toBeNull();
  });

  it("modele yalnız ad ve açıklama gider, SKILL.md gövdesi gitmez", async () => {
    let istem = "";
    await turkceTaslak(aday, async (m) => { istem = m; return iyiYanit; });
    expect(istem).toContain("Writes tests for your code.");
    expect(istem).toContain("yeni");
  });
});

import { cevrilecekMi, taslakCevir, topluCevir } from "../scripts/cevir.js";

describe("toplu çeviri", () => {
  const ogeler = [
    { id: "a", ad: "a", aciklama: "Does A." },
    { id: "b", ad: "b", aciklama: "Does B." },
  ];
  it("tek istekte birden çok kaydı çevirir; geçersiz ve bilinmeyen kayıtları atlar", async () => {
    let cagri = 0;
    const iyi = JSON.parse(iyiYanit);
    const sonuc = await topluCevir(ogeler, async (istem) => {
      cagri++;
      expect(istem).toContain("Does A.");
      expect(istem).toContain("Does B.");
      return JSON.stringify({ a: iyi, b: { ad: "eksik" }, z: iyi });
    });
    expect(cagri).toBe(1);
    expect([...sonuc.keys()]).toEqual(["a"]);
  });
  it("istek hata verirse boş döner", async () => {
    expect((await topluCevir(ogeler, async () => { throw new Error("x"); })).size).toBe(0);
  });
});

describe("taslakCevir", () => {
  it("yalnız çevrilmemiş taslakları seçer; Türkçe alanları yazar, kaynağı ve en bloğunu korur", () => {
    const taslak = taslakYaml(aday);
    expect(cevrilecekMi(taslak)).toBe(true);
    const tr = JSON.parse(iyiYanit);
    const yeni = taslakCevir(taslak, tr);
    expect(cevrilecekMi(yeni)).toBe(false);
    expect(yeni.match(/# TASLAK/g)).toHaveLength(1);
    expect(yeni.split("\n")[0]).toContain("Claude çevirisi");
    const k = KayitSemasi.parse(parse(yeni));
    expect(k).toMatchObject({ ad: "Test Yazarı", kisaAciklama: "Kodun için test yazar.", kategori: "kod-test" });
    expect(k.kaynak.repo).toBe("ali/iyi");
    expect(k.en?.kisaAciklama).toBe("Writes tests for your code.");
    expect(cevrilecekMi("id: elle-yazilmis\n")).toBe(false);
  });
});
