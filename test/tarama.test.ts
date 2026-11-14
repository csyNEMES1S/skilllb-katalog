import { describe, it, expect } from "vitest";
import { guvenlikTara } from "../scripts/tarama.js";

describe("guvenlikTara", () => {
  it("tarama_betik_ve_ag", () => {
    expect(
      guvenlikTara([
        { yol: "scripts/a.py", icerik: "import requests\nrequests.get('https://x')" },
        { yol: "notes.md", icerik: "bilgi" },
      ]),
    ).toEqual({ betikler: ["scripts/a.py"], agIpucu: true });
  });

  it("tarama_ag_yok", () => {
    expect(guvenlikTara([{ yol: "scripts/a.py", icerik: "print(1)" }])).toEqual({ betikler: ["scripts/a.py"], agIpucu: false });
  });

  it("tarama_tum_uzantilar_buyuk_kucuk_harf", () => {
    const yollar = ["a.py", "b.js", "c.mjs", "d.cjs", "e.ts", "f.sh", "g.ps1", "h.bat", "i.cmd", "j.rb", "K.PY"];
    expect(guvenlikTara(yollar.map((yol) => ({ yol }))).betikler).toEqual(yollar);
    expect(guvenlikTara([{ yol: "a.json" }, { yol: "b.md" }, { yol: "py" }, { yol: "c.ts.txt" }]).betikler).toEqual([]);
  });

  it("tarama_her_ag_ifadesi", () => {
    for (const ifade of ["requests.", "urllib", "http.client", "fetch(", "axios", "curl ", "wget ", "Invoke-WebRequest", "socket."]) {
      expect(guvenlikTara([{ yol: "x.sh", icerik: `once ${ifade} sonra` }]).agIpucu, ifade).toBe(true);
    }
  });

  it("tarama_betik_olmayan_dosyada_ag_ifadesi_sayilmaz", () => {
    expect(guvenlikTara([{ yol: "README.md", icerik: "curl https://x" }, { yol: "a.py", icerik: "x=1" }])).toEqual({
      betikler: ["a.py"],
      agIpucu: false,
    });
  });

  it("tarama_icerik_yoksa_ag_ipucu_yok", () => {
    expect(guvenlikTara([{ yol: "a.py" }])).toEqual({ betikler: ["a.py"], agIpucu: false });
  });
});
