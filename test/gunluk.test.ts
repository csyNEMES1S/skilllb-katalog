import { describe, it, expect } from "vitest";
import { gunlukSatiri } from "../scripts/gunluk.js";

const c = (n: number) => String.fromCharCode(n);

describe("gunlukSatiri", () => {
  it("gunluk_satir_sonu_ve_denetim_karakteri_kacisli", () => {
    // GitHub Actions stdout/stderr'deki her satırı "::komut::" için tarar: güvenilmez metin yeni satır açamamalı.
    const girdi = ["a", "::add-mask::x", "::stop-commands::y", "[31m", "z", "w"].join("|")
      .replace("|", c(10)).replace("|", c(13)).replace("|", c(0x1b)).replace("|", c(0x2028)).replace("|", c(0x85));
    const s = gunlukSatiri("uyarı", girdi);
    const bs = c(92);
    expect(s).toBe(`uyarı: a${bs}n::add-mask::x${bs}r::stop-commands::y${bs}u001b[31m${bs}u2028z${bs}u0085w`);
    expect(s).not.toMatch(new RegExp(`[${c(10)}${c(13)}${c(0x85)}${c(0x2028)}${c(0x2029)}]`));
  });

  it("gunluk_sade_metne_dokunmaz", () => {
    expect(gunlukSatiri("hata", "/pdf/ atlandı (a/b@1234567): bulunamadı")).toBe("hata: /pdf/ atlandı (a/b@1234567): bulunamadı");
  });
});
