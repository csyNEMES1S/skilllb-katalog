#!/usr/bin/env bash
# Kullanım: bash .github/scripts/kesif-pr.sh dist/kesif.md
# `npm run kesif -- --yaz` sonrası:
#  - kayitlar/ altında yeni taslak varsa kesif/<tarih> dalını açar; taslakları, görsellerini ve kuyruğun
#    yeni hâlini commit'ler, push eder ve PR açar.
#  - Yeni taslak yoksa ama kuyruk ilerlediyse (incelenen her aday reddedildi) yalnız kesif-kuyruk.txt'yi
#    main'e commit'ler; aksi hâlde kuyruk aynı satırlarda takılırdı.
# Açık keşif PR'ı varsa hiçbir şey yapmaz (iş akışı da bu adımı atlar; burada ikinci kez denetlenir).
#
# Güvenlik: PR gövdesi üçüncü taraf metin içerir; iş akışına gömülmez, dosyadan verilir (--body-file).
set -euo pipefail

GOVDE="$1"
TARIH="$(date -u +%Y-%m-%d)"
DAL="kesif/$TARIH"

ACIK="$(gh pr list --state open --limit 100 --json headRefName,isCrossRepository \
         -q 'map(select((.isCrossRepository | not) and (.headRefName | startswith("kesif/")))) | length')"
if [[ "$ACIK" != "0" ]]; then
  echo "Açık bir keşif PR'ı var; yenisi açılmadı."
  exit 0
fi

YENILER="$(git ls-files --others --exclude-standard -- 'kayitlar/*.yaml')"
KUYRUK_DEGISTI=0
git diff --quiet -- kesif-kuyruk.txt || KUYRUK_DEGISTI=1

if [[ -z "$YENILER" ]]; then
  if [[ "$KUYRUK_DEGISTI" == "1" ]]; then
    git add -- kesif-kuyruk.txt
    git commit --quiet -m "kesif: kuyruk ilerledi ($TARIH, uygun aday çıkmadı)"
    git push --quiet origin HEAD:main
    echo "Uygun aday yok; kuyruk ilerletildi."
  else
    echo "Yeni aday yok."
  fi
  exit 0
fi

if git ls-remote --exit-code --heads origin "refs/heads/$DAL" > /dev/null; then
  echo "::warning::$DAL dalı zaten var; bugün yeniden açılmadı"
  exit 0
fi

git switch --quiet --create "$DAL"
# Taslaklara ikon ve kapak üret (var olan görsellere dokunmaz), yalnız yeni kayıtların klasörlerini ekle.
npm run --silent gorsel
for K in $YENILER; do
  ID="$(basename "$K" .yaml)"
  [[ "$ID" =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] || { echo "::error::geçersiz id: atlandı"; exit 1; }
  git add -- "$K"
  [[ -d "gorseller/$ID" ]] && git add -- "gorseller/$ID"
done
[[ "$KUYRUK_DEGISTI" == "1" ]] && git add -- kesif-kuyruk.txt
SAYI="$(echo "$YENILER" | wc -l | tr -d ' ')"
git commit --quiet -m "kesif: $SAYI yeni skill adayı (taslak, $TARIH)"
git push --quiet origin "$DAL"
gh pr create --base main --head "$DAL" --title "Günlük keşif: $SAYI yeni skill ($TARIH)" --body-file "$GOVDE"
