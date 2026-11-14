# SkillLB Katalog

SkillLB uygulamasının gösterdiği skill listesi bu repodan üretilir. Repoda yalnızca şunlar bulunur:

- `kayitlar/`: her skill için elle yazılmış bir kayıt (`<id>.yaml`)
- `gorseller/`: kayıtlarda kullanılan, repo sahibine ait görseller
- `scripts/`: kayıtları kaynak repolardaki bilgilerle birleştirip `catalog.json` üreten betikler

Skill dosyalarının kendisi **asla** bu repoya kopyalanmaz. Her kayıt, skill'in durduğu GitHub reposunu ve
sabit bir commit'i gösterir. Uygulama skill'i oradan indirir.

## Kayıt nasıl eklenir

1. Skill'in GitHub'daki yerini bul: repo (`sahip/ad`), skill klasörünün yolu (içinde `SKILL.md` olmalı) ve dal adı.
2. O klasörü etkileyen son commit'in sha değerini al:

   ```sh
   gh api "repos/<sahip>/<ad>/commits?sha=<dal>&path=<yol>&per_page=1" -q ".[0].sha"
   ```

3. Skill'in `SKILL.md` dosyasını baştan sona oku. Ne yaptığını, betik çalıştırıp çalıştırmadığını ve ağa
   bağlanıp bağlanmadığını öğren. Kayda yalnızca skill'in gerçekten yaptığı işleri yaz.
4. `kayitlar/<id>.yaml` dosyasını oluştur. Dosya adı `id` ile aynı olmalı.
5. Denetle:

   ```sh
   npm test
   GITHUB_TOKEN=$(gh auth token) npm run derle -- --cikti dist/catalog.json
   ```

   Derleme hatasız bitmeli ve uyarı vermemeli. Hatalı bir kayıtta derleme, dosya adını ve sorunlu alanı
   yazarak durur (ör. `pdf.yaml: kategori ...`).
6. Bir Pull Request aç.

## Alanlar

Kayıt sıkı denetlenir: listede olmayan bir alan yazım hatası sayılır ve derleme durur.

| Alan | Zorunlu | Açıklama |
|---|---|---|
| `id` | evet | Küçük harf, rakam ve tire (en çok 64 karakter). Dosya adıyla aynı olmalı. |
| `ad` | evet | Uygulamada görünen Türkçe ad. |
| `kisaAciklama` | evet | Kartta görünen tek cümle, en çok 60 karakter. |
| `neIseYarar` | evet | Skill'in yaptığı işler, 3 madde. Skill'i ilk kez duyan birinin anlayacağı sadelikte yaz. |
| `kategori` | evet | `belge-ofis`, `tasarim`, `kod-test`, `veri-grafik`, `yazi`, `guvenlik` ya da `diger`. |
| `kaynak.repo` | evet | Skill'in durduğu GitHub reposu, `sahip/ad` biçiminde. |
| `kaynak.yol` | evet | Repo içinde skill klasörünün göreli yolu (ör. `skills/pdf`). Başta `/`, `..` ya da ters bölü olamaz. |
| `kaynak.dal` | evet | Güncellemelerin izlendiği dal (ör. `main`). |
| `kaynak.sha` | evet | Kullanıcıya sunulan sabit commit, 40 karakterlik küçük harfli sha. |
| `ornekCumleler` | evet | Kullanıcının kopyalayıp Claude'a yazabileceği 2-3 gerçekçi istek. |
| `uyumluluk.claude` / `uyumluluk.antigravity` | evet | `durum`: `calisir`, `calismaz` ya da `bilinmiyor`. `sahibiDenedi`: repo sahibi kendisi denediyse `true`. `neden`: isteğe bağlı kısa açıklama (`calismaz` için yazılmalı). |
| `gorseller` | hayır | `ikon`, `kapak` ve `onceSonra` (liste). Her biri `gorseller/` ile başlayan göreli yol ya da `https://` adresi. |
| `nasilKullanilir` | hayır | `claude` ve `antigravity` için adım listesi. Yazılmazsa uygulama varsayılan adımları gösterir. |
| `ornekler` | hayır | Skill'le üretilmiş örnekler: `tur` (`gorsel`/`video`), `baslik`, `url` (https), isteğe bağlı `uretici` ve `kapak`. |
| `benzerler` | hayır | Benzer skill'lerin `id` listesi. Katalogda olmayan bir id derlemede uyarı verir ve çıkarılır. |
| `dogrulandi` | hayır | Doğrulandı rozeti. Yalnızca repo sahibi verir (aşağıya bak). |
| `oneCikan` | hayır | `true` ise skill öne çıkanlar rafında görünür. |
| `haftaninSkilli` | hayır | `true` ise haftanın skill'i olarak gösterilir. Aynı anda yalnız bir kayıtta olmalı. |
| `otomatikGuncelle` | hayır | Varsayılanı `false`. Şimdilik hiçbir şey bu alana göre davranmaz. |

Lisans, yıldız sayısı, yazar, dosya listesi, boyut, sürüm ve güvenlik bilgisi (betikler, ağ ipucu) kayda
**yazılmaz**. Bunlar derleme sırasında kaynak repodan, sabit commit'e göre okunur.

`kisaAciklama` için 60 karakter sınırını derleme denetlemez; kaydı yazarken kendin say.

`uyumluluk` yazarken: `calismaz` yalnızca skill o araçta gerçekten iş göremiyorsa (ör. yalnız Claude'da
bulunan bir özelliğe dayanıyorsa) verilir. Denenmemiş ya da kısmen çalışması beklenen skill'ler
`bilinmiyor` kalır; kısmi durum `neden` alanında anlatılabilir.

### Lisansı olmayan ya da kısıtlı skill'ler

Lisans durumu (`lisans.durum`) derlemede otomatik belirlenir:

- `acik`: skill klasöründe tanınan açık bir lisans (Apache, MIT, BSD) var ya da reponun lisansı açık.
- `kisitli`: skill klasöründe bir lisans dosyası var ama tanınan açık bir lisans değil. Uygulamada
  "Kısıtlı lisans: yalnızca kaynaktan indirilir" yazar.
- `yok`: ne skill klasöründe ne de repoda lisans bilgisi var. Uygulamada "Lisans belirtilmemiş" yazar.

Lisansı `yok` ya da `kisitli` olan skill'ler de katalogda gösterilebilir. Dosyaları bu repoya ya da
uygulamaya kopyalanmaz; kullanıcı her zaman kaynak repodan indirir ve lisans durumu skill sayfasında açıkça
görünür. Böyle bir kaydı silmen gerekmez, ama kullanıcıya önermeden önce kaynağın kullanım koşullarına bak.

## Örnek kayıt

```yaml
id: pdf
ad: "PDF Ustası"
kisaAciklama: "PDF okur, birleştirir, böler ve yeni PDF hazırlar."
neIseYarar:
  - "PDF içindeki metni ve tabloları çıkarır, taranmış sayfaları okunur hâle getirir."
  - "Birden çok PDF'i birleştirir, sayfaları ayırır, döndürür ya da filigran ekler."
  - "Sıfırdan yeni PDF oluşturur, PDF formlarını doldurur ve dosyaya şifre koyar."
kategori: belge-ofis
kaynak:
  repo: anthropics/skills
  yol: skills/pdf
  dal: main
  sha: 2c5958ecac7cee2b583967a2c4981d0f4a75c579
gorseller:
  ikon: gorseller/pdf/ikon.png
  kapak: gorseller/pdf/kapak.png
  onceSonra: []
ornekCumleler:
  - "Bu üç PDF'i tek dosyada birleştir, sıra fatura, sözleşme, ek olsun."
  - "Ekteki PDF'teki tabloları çıkar ve bana Excel dosyası olarak ver."
nasilKullanilir:
  claude:
    - "Skill'i SkillLB'den indir."
    - "Claude'a PDF dosyanı ekle ve ne yapmak istediğini yaz."
uyumluluk:
  claude:
    durum: calisir
    sahibiDenedi: false
  antigravity:
    durum: bilinmiyor
    sahibiDenedi: false
dogrulandi: false
oneCikan: true
haftaninSkilli: true
ornekler:
  - tur: gorsel
    baslik: "Birleştirilmiş fatura dosyası"
    url: https://example.com/ornek.png
benzerler: [docx, xlsx]
otomatikGuncelle: false
```

(Örnekteki görsel yolları ve `ornekler` adresi yalnızca biçimi göstermek içindir.)

## Güncellemeler nasıl onaylanır

Kullanıcıya her zaman kayıttaki sabit `kaynak.sha` sunulur. Kaynak repoda skill klasörü değişince günlük iş
bunu fark eder, ama sha değerini kendiliğinden ilerletmez. Bunun yerine yeni sha'yı ve değişen dosyaları
gösteren bir **Pull Request** açar. Repo sahibi değişikliği inceleyip PR'ı birleştirince yeni sürüm
katalogda yayına girer. Aynı güncelleme için ikinci kez PR açılmaz.

## `dogrulandi` rozeti ne demek

`dogrulandi: true`, repo sahibinin o skill'i sabitlenmiş sürümüyle **kendisi denediği** ve içeriğini
(betikler, ağ bağlantıları) gözden geçirdiği anlamına gelir. Rozeti yalnızca repo sahibi verir. Katkı
olarak gelen kayıtlarda bu alan `false` kalır ya da hiç yazılmaz. Sha değiştiğinde (yeni sürüm) rozet yeniden
gözden geçirilmelidir.

Rozeti olmayan bir skill kötü demek değildir; yalnızca henüz sahibi tarafından denenmediğini gösterir.
