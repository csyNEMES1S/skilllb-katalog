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
    const uzun = JSON.parse(iyiYanit); uzun.kisaAciklama = "x".repeat(61);
    expect(await turkceTaslak(aday, async () => JSON.stringify(uzun))).toBeNull();
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
