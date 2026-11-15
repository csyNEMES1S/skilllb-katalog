# SkillLB Katalog

**Bu repo, [SkillLB](https://github.com/csyNEMES1S/skilllb) uygulamasında görünen skill listesinin kaynağıdır.**

SkillLB, Claude ve Antigravity için skill'leri tek tıkla kurmanı sağlayan bir Windows uygulamasıdır. Uygulamanın vitrininde gördüğün her skill burada bir kayıt olarak durur. Kendi skill'inin ya da beğendiğin bir skill'in SkillLB'de görünmesini istiyorsan doğru yerdesin.

## Ne işe yarar?

- SkillLB'nin vitrinindeki her skill için Türkçe ad, açıklama, örnek cümleler ve kategori bilgisini tutar.
- Her gün kayıtları kaynak repolardaki güncel bilgilerle (lisans, dosya listesi, yıldız sayısı, güvenlik özeti) birleştirip tek bir `catalog.json` yayınlar.
- Skill yazarları yeni sürüm çıkardığında bunu fark eder ve incelenmek üzere otomatik bir Pull Request açar.

## Skill nedir?

Skill, bir yapay zekâ aracına yeni bir iş öğreten küçük bir klasördür. İçinde talimatların yazdığı bir `SKILL.md` dosyası ve bazen yardımcı dosyalar bulunur. Örneğin bir skill Claude'a PDF birleştirmeyi, bir başkası güvenlik taraması yapmayı öğretir.

## Nasıl çalışır?

1. **Kayıtlar:** `kayitlar/` klasöründe her skill için bir `<id>.yaml` dosyası vardır. Bu dosyalar elle yazılır ve skill'in hangi GitHub reposunda, hangi klasörde ve hangi sabit sürümde (commit) durduğunu söyler.
2. **Her gün otomatik derleme:** GitHub Actions her gün (ve `kayitlar/` ya da `gorseller/` değişince) kayıtları okur, her skill'in kaynak reposundan `SKILL.md`, lisans, dosya listesi ve yıldız sayısı gibi bilgileri çeker, betik ve ağ erişimi taraması yapar.
3. **Yayın:** Sonuç GitHub Pages'te yayınlanır: <https://csynemes1s.github.io/skilllb-katalog/catalog.json>. SkillLB uygulaması her açılışta bu dosyayı indirir.

**Skill dosyaları bu repoda tutulmaz.** Burada yalnız bilgiler ve bağlantılar bulunur. Kullanıcı bir skill'i kurduğunda SkillLB dosyaları doğrudan skill'in kendi reposundan, kayıtta yazan sabit commit'ten indirir.

Repodaki klasörler:

- `kayitlar/`: skill kayıtları (`<id>.yaml`)
- `gorseller/`: kayıtlarda kullanılan ikon ve kapak görselleri
- `scripts/`: kataloğu derleyen, güncellemeleri bulan ve görsel üreten betikler
- `site/`: yayına olduğu gibi kopyalanan sayfalar (ör. paylaşılan skill listelerini gösteren `liste.html`)

## Skill eklemek istiyorum

İki yolun var. Hangisi sana kolay geliyorsa onu seç.

### 1. Kolay yol: Issue aç

Git, YAML ya da komut satırıyla uğraşmak istemiyorsan [bir skill önerisi aç](https://github.com/csyNEMES1S/skilllb-katalog/issues/new?template=skill-onerisi.yml). Formda şunları sorulur:

- Skill'in durduğu GitHub reposunun adresi
- Repo içinde skill klasörünün yolu (içinde `SKILL.md` olan klasör)
- Skill'in ne işe yaradığı, kısaca
- Lisansı (biliyorsan)

Kaydı bakımcı senin yerine yazar.

### 2. Pull Request ile kendin ekle

#### Adım 1: Kayıt dosyasını oluştur

`kayitlar/<id>.yaml` adında bir dosya oluştur. `id` küçük harf, rakam ve tireden oluşmalı ve dosya adıyla aynı olmalı (ör. `kayitlar/pdf.yaml` içinde `id: pdf`). Yazmadan önce skill'in `SKILL.md` dosyasını baştan sona oku; kayda yalnız skill'in gerçekten yaptığı işleri yaz.

Örnek kayıt (katalogdaki `kayitlar/pdf.yaml`):

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
  ikon: gorseller/pdf/ikon.svg
  kapak: gorseller/pdf/kapak.svg
ornekCumleler:
  - "Bu üç PDF'i tek dosyada birleştir, sıra fatura, sözleşme, ek olsun."
  - "Ekteki PDF'teki tabloları çıkar ve bana Excel dosyası olarak ver."
  - "Bu taranmış PDF'teki yazıları oku ve metin olarak yaz."
uyumluluk:
  claude:
    durum: calisir
    sahibiDenedi: false
  antigravity:
    durum: bilinmiyor
    sahibiDenedi: false
benzerler: [docx, xlsx, pptx]
```

#### Adım 2: Alanları doldur

Kayıt sıkı denetlenir: listede olmayan bir alan yazım hatası sayılır ve derleme durur.

| Alan | Zorunlu | Ne yazılır | Örnek |
|---|---|---|---|
| `id` | evet | Küçük harf, rakam ve tire, en çok 64 karakter. Dosya adıyla aynı. | `pdf` |
| `ad` | evet | Uygulamada görünen Türkçe ad. | `"PDF Ustası"` |
| `kisaAciklama` | evet | Kartta görünen tek cümle, en çok 60 karakter (derleme saymaz, sen say). | `"PDF okur, birleştirir, böler..."` |
| `neIseYarar` | evet | Skill'in yaptığı işler, 3 madde. Skill'i ilk kez duyan birinin anlayacağı sadelikte. | yukarıdaki örnek |
| `kategori` | evet | `belge-ofis`, `tasarim`, `kod-test`, `veri-grafik`, `yazi`, `guvenlik` ya da `diger`. | `belge-ofis` |
| `kaynak.repo` | evet | Skill'in durduğu GitHub reposu, `sahip/ad` biçiminde. | `anthropics/skills` |
| `kaynak.yol` | evet | Repo içinde skill klasörünün yolu (içinde `SKILL.md` olmalı). Başta `/`, `..` ya da ters bölü olamaz. | `skills/pdf` |
| `kaynak.dal` | evet | Güncellemelerin izlendiği dal. | `main` |
| `kaynak.sha` | evet | Kullanıcıya sunulacak sabit commit: 40 karakterlik, küçük harfli sha. Nasıl bulunacağı aşağıda. | `2c5958ec...c579` |
| `ornekCumleler` | evet | Kullanıcının kopyalayıp Claude'a yazabileceği 2-3 gerçekçi istek. | `"Bu üç PDF'i birleştir"` |
| `uyumluluk.claude`, `uyumluluk.antigravity` | evet | `durum`: `calisir`, `calismaz` ya da `bilinmiyor`. `sahibiDenedi`: `true` ya da `false`. `neden`: isteğe bağlı kısa açıklama (`calismaz` için yaz). | `durum: calisir` |
| `gorseller` | hayır | `ikon`, `kapak` ve `onceSonra` (liste). Her biri `gorseller/` ile başlayan göreli yol ya da `https://` adresi. | `ikon: gorseller/pdf/ikon.svg` |
| `nasilKullanilir` | hayır | `claude` ve `antigravity` için adım listesi. Yazılmazsa uygulama varsayılan adımları gösterir. | `claude: ["Kur'a bas", ...]` |
| `ornekler` | hayır | Skill'le üretilmiş örnekler: `tur` (`gorsel` ya da `video`), `baslik`, `url` (https), isteğe bağlı `uretici` ve `kapak` (https). | |
| `benzerler` | hayır | Benzer skill'lerin `id` listesi. Katalogda olmayan bir id uyarı verir ve çıkarılır. | `[docx, xlsx]` |
| `en` | hayır | İngilizce arayüz için metinler: `ad`, `kisaAciklama`, `neIseYarar`, `ornekCumleler` (hepsi isteğe bağlı). Yazılmazsa `SKILL.md`'deki özgün açıklama gösterilir. | `en: { ad: "PDF Master" }` |
| `dogrulandi` | hayır | Doğrulandı rozeti. Yalnız bakımcı verir; katkıda yazma ya da `false` bırak. | `false` |
| `oneCikan` | hayır | `true` ise skill öne çıkanlar rafında görünür. Bakımcı belirler. | `true` |
| `haftaninSkilli` | hayır | `true` ise haftanın skill'i olarak gösterilir. Aynı anda yalnız bir kayıtta olmalı. Bakımcı belirler. | `true` |
| `otomatikGuncelle` | hayır | Varsayılanı `false`. Şimdilik hiçbir şey bu alana göre davranmaz. | `false` |

**Kayda yazılmayanlar:** lisans, yıldız sayısı, yazar, dosya listesi, boyut, sürüm ve güvenlik bilgisi (betikler, ağ ipucu). Bunlar derleme sırasında kaynak repodan, sabit commit'e göre otomatik okunur.

**Uyumluluk yazarken:** `calismaz` yalnız skill o araçta gerçekten iş göremiyorsa verilir (ör. yalnız Claude'da bulunan bir özelliğe dayanıyorsa). Denemediğin ya da kısmen çalışmasını beklediğin durumda `bilinmiyor` yaz; kısmi durumu `neden` alanında anlatabilirsin. `sahibiDenedi` alanını yalnız gerçekten denediysen `true` yap.

#### Adım 3: `sha` değerini bul

`kaynak.sha`, skill klasörünü etkileyen son commit'in tam sha değeridir.

**GitHub CLI (`gh`) ile:**

```sh
gh api "repos/<sahip>/<ad>/commits?sha=<dal>&path=<yol>&per_page=1" -q ".[0].sha"
```

Örnek:

```sh
gh api "repos/anthropics/skills/commits?sha=main&path=skills/pdf&per_page=1" -q ".[0].sha"
```

**GitHub web arayüzünden:**

1. Skill'in reposunda skill klasörüne git (ör. `https://github.com/anthropics/skills/tree/main/skills/pdf`).
2. Sağ üstteki **History** (saat simgesi) bağlantısına tıkla. Yalnız bu klasörü etkileyen commit'ler listelenir.
3. En üstteki commit'in yanındaki kopyalama düğmesiyle tam sha'yı kopyala. Kısa (7 karakterlik) hâli değil, 40 karakterlik tamamı gerekir.

#### Adım 4: Görselleri ekle

İki seçeneğin var:

- **Otomatik:** `npm run gorsel` çalıştır. Kategori renginde, tutarlı tarzda bir ikon ve kapak üretir (`gorseller/<id>/ikon.svg`, `kapak.svg`) ve kayda `gorseller` alanını ekler. Var olan görsellerin üzerine yazmaz.
- **Kendi görselin:** Görsellerini `gorseller/<id>/` altına koy ve kayıtta yolunu yaz (ör. `ikon: gorseller/<id>/ikon.png`). Yalnız kullanma hakkın olan görselleri ekle.

#### Adım 5: Yerelde dene

Node.js 22 gerekir.

```sh
npm ci
npm test
npm run derle -- --cikti dist/catalog.json
```

Derleme kaynak repolardan bilgi çektiği için GitHub istek sınırına takılabilir. `gh` kuruluysa token ile çalıştır:

```sh
GITHUB_TOKEN=$(gh auth token) npm run derle -- --cikti dist/catalog.json
```

Derleme hatasız bitmeli ve uyarı vermemeli. Hatalı bir kayıtta derleme dosya adını ve sorunlu alanı yazarak durur (ör. `pdf.yaml: kategori ...`).

#### Adım 6: Pull Request aç

Değişikliklerini (kayıt dosyası ve varsa görseller) bir dalda commit'le ve Pull Request aç. Açıklamaya skill'i neden önerdiğini bir iki cümleyle yaz.

## Kabul kriterleri

Bir skill'in kataloğa alınması için aşağıdakilerin hepsi sağlanmalı. Sağlanmazsa öneri reddedilir; nedeni Issue ya da PR'da yazılır.

| Kriter | Reddedilme nedeni |
|---|---|
| **Açık bir lisansı olmalı.** Skill klasöründe ya da repoda tanınan açık bir lisans (MIT, Apache, BSD, ISC, MPL-2.0, CC BY, CC BY-SA) bulunmalı. | Lisans yoksa ya da kullanımı kısıtlıyorsa (ör. ticari kullanım ya da değiştirme yasağı) kullanıcılar skill'i güvenle kullanamaz. |
| **Gizli ağ çağrısı yapmamalı.** İnternete bağlanıyorsa bunu açıkça, işi için yapmalı. | Kullanıcıya söylemeden veri gönderen ya da dışarıdan kod indiren skill'ler kabul edilmez. |
| **Kimlik bilgisi okumamalı.** | Parola, token, SSH anahtarı, tarayıcı verisi gibi bilgilere erişmeye çalışan skill'ler kabul edilmez. |
| **Ayar dosyalarına yazmamalı.** | Claude'un, Antigravity'nin ya da sistemin ayarlarını kullanıcıya sormadan değiştiren skill'ler kabul edilmez. |
| **İşiyle ilgisiz talimat içermemeli.** | Yapay zekâya skill'in amacıyla ilgisi olmayan şeyler yaptırmaya çalışan (ör. güvenlik kurallarını yok saymasını isteyen) talimatlar reddedilir. |
| **İşe yarar olmalı ve tekrar olmamalı.** | Katalogda zaten aynı işi yapan bir skill varsa ve yenisi belirgin bir fark getirmiyorsa ya da skill yarım/boşsa eklenmez. |

Lisans durumu derleme sırasında otomatik belirlenir. Bazı eski kayıtlarda lisans `yok` ya da `kisitli` görünebilir; bu skill'ler de kullanıcıya her zaman yalnız kaynak repodan indirilir ve durumu skill sayfasında açıkça yazar (aşağıya bak). Yeni öneriler için açık lisans beklenir.

## Güncellemeler nasıl gelir?

Kullanıcıya her zaman kayıttaki sabit `kaynak.sha` sunulur. Skill yazarı reposunda skill klasörünü değiştirince:

1. Her gün çalışan iş değişikliği fark eder ama sha'yı kendiliğinden ilerletmez.
2. Bunun yerine yeni sha'yı ve değişen dosyaları gösteren **otomatik bir Pull Request** açar. Aynı güncelleme için ikinci kez PR açılmaz.
3. Bakımcı değişikliği inceler (yeni betik, yeni ağ bağlantısı var mı?) ve uygunsa PR'ı birleştirir.
4. Birleşince katalog yeniden yayınlanır ve o skill'i kurmuş herkesin SkillLB'sinde **Güncelle** düğmesi çıkar.

Yani skill yazarıysan yapman gereken tek şey kendi reponda yeni sürümü yayınlamak.

## Yeni skill'ler nasıl bulunur? (günlük keşif)

Her gün 09:00'da (Türkiye) çalışan **Günlük keşif** iş akışı en çok 10 yeni aday bulur:

1. Adaylar önce `kesif-kuyruk.txt` dosyasından gelir: bakımcının bilgisayarında kurulu, kataloğa henüz girmemiş skill'ler (her satır `sahip/ad:klasör`). Kuyruk bitince GitHub araması devreye girer (`topic:claude-skills`, `topic:agent-skills` ve benzerleri; en az 50 yıldız).
2. Lisansı açık olmayan, yarım ya da katalogdaki bir skill'in kopyası olan adaylar elenir. Bir repodan günde en çok 3 aday alınır.
3. Her aday için `kayitlar/` altına **taslak** bir kayıt (`# TASLAK` ile başlar) ve görselleri yazılır. Türkçe metinler için SKILL.md'deki özgün (çoğunlukla İngilizce) açıklama kullanılır; bakımcı birleştirmeden önce Türkçeleştirir. Hepsi tek bir PR'da toplanır; incelenen kuyruk satırları aynı PR'da silinir.
4. Bakımcı SKILL.md'leri okur, metinleri gözden geçirir, uygun olmayanları siler (gerekirse `kesif-haric.txt`'ye ekler) ve birleştirir. Birleşince skill'ler SkillLB'de görünür. Hiçbir aday onaysız yayınlanmaz. Açık bir keşif PR'ı varken yenisi açılmaz.

Reddedilen skill'ler `kesif-haric.txt` dosyasına nedeniyle yazılır ve bir daha önerilmez.

Elle çalıştırmak için:

```sh
GITHUB_TOKEN=$(gh auth token) npm run kesif                                  # aramayla listeler (dist/kesif.md)
GITHUB_TOKEN=$(gh auth token) npm run kesif -- --kuyruk kesif-kuyruk.txt     # kuyruktan sıradaki adaylar
GITHUB_TOKEN=$(gh auth token) npm run kesif -- --yaz                         # taslak kayıtları da yazar
GITHUB_TOKEN=$(gh auth token) npm run kesif -- --yerel ~/.agents/.skill-lock.json   # bilgisayarındaki skill'lerden katalogda olmayanlar
```

## "doğrulandı" rozeti ne demek?

SkillLB'de bazı skill'lerin kartında **doğrulandı** rozeti görünür. Bu, bakımcının o skill'i katalogda sabitlenmiş sürümüyle **kendisi denediği** ve içeriğini (betikler, ağ bağlantıları) gözden geçirdiği anlamına gelir.

Rozeti yalnız bakımcı verir (`dogrulandi: true`). Katkı olarak gelen kayıtlarda bu alan yazılmaz ya da `false` kalır. Skill yeni bir sürüme geçtiğinde rozet yeniden gözden geçirilir.

Rozeti olmayan bir skill kötü demek değildir; yalnız henüz bakımcı tarafından denenmediğini gösterir.

## Lisans durumları uygulamada nasıl görünür?

Derleme her skill'in lisansını kaynak repodan okur ve üç durumdan birini verir:

| Durum | Ne zaman | Uygulamada |
|---|---|---|
| `acik` | Skill klasöründe ya da repoda tanınan açık bir lisans var (Apache, MIT, BSD, ISC, MPL-2.0, CC BY, CC BY-SA). | Lisansın adı gösterilir (ör. `MIT`). |
| `kisitli` | Bir lisans dosyası var ama tanınan açık bir lisans değil. NonCommercial (NC) ya da NoDerivatives (ND) içeren CC lisansları da buraya girer. | "Kısıtlı lisans: yalnızca kaynaktan indirilir" |
| `yok` | Ne skill klasöründe ne de repoda lisans bilgisi var. | "Lisans belirtilmemiş" |

Hangi durumda olursa olsun skill dosyaları bu repoya ya da uygulamaya kopyalanmaz; kullanıcı her zaman kaynak repodan indirir.

## Bakımcı notları

- **Pages:** Repo ayarlarında *Settings → Pages → Build and deployment → Source* değeri **GitHub Actions** olmalı. Yayın `.github/workflows/gunluk.yml` içindeki `yayinla` işiyle yapılır.
- **Güncelleme PR'ları:** *Settings → Actions → General → Workflow permissions* altında **Allow GitHub Actions to create and approve pull requests** açık olmalı. Kapalıysa `guncellemeler` işi PR açamaz.
- Günlük iş her gün 04:00'te (UTC) çalışır; *Actions → Günlük derleme → Run workflow* ile elle de başlatılabilir.
- `dogrulandi`, `oneCikan` ve `haftaninSkilli` alanlarını bakımcı belirler. `haftaninSkilli` aynı anda yalnız bir kayıtta `true` olmalı.
