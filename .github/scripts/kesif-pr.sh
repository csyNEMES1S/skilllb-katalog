#!/usr/bin/env bash
# Kullanım: bash .github/scripts/kesif-pr.sh dist/kesif.md
# `npm run kesif -- --yaz` sonrası kayitlar/ altında yeni taslak varsa kesif/<tarih> dalını açar,
# commit'ler, push eder ve PR açar. Açık bir keşif PR'ı varsa yenisini açmaz (sahibi önce onu bitirsin).
#
# Güvenlik: PR gövdesi üçüncü taraf metin içerir; iş akışına gömülmez, dosyadan verilir (--body-file).
# Yalnız kayitlar/ altındaki YENİ .yaml dosyaları commit'lenir.
set -euo pipefail

GOVDE="$1"
DAL="kesif/$(date -u +%Y-%m-%d)"

ACIK="$(gh pr list --state open --limit 100 --json headRefName,isCrossRepository \
         -q 'map(select((.isCrossRepository | not) and (.headRefName | startswith("kesif/")))) | length')"
if [[ "$ACIK" != "0" ]]; then
  echo "Açık bir keşif PR'ı var; yenisi açılmadı."
  exit 0
fi

YENILER="$(git ls-files --others --exclude-standard -- 'kayitlar/*.yaml')"
if [[ -z "$YENILER" ]]; then
  echo "Yeni aday yok."
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
git commit --quiet -m "kesif: haftalık yeni skill adayları (taslak)"
git push --quiet origin "$DAL"
gh pr create --base main --head "$DAL" --title "Haftalık keşif: yeni skill adayları ($(date -u +%Y-%m-%d))" --body-file "$GOVDE"
