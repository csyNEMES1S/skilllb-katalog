#!/usr/bin/env bash
# Kullanım: bash .github/scripts/guncelleme-pr.sh dist/guncellemeler.json
# `npm run guncelle` çıktısındaki her öğe için dal açar, kaynak.sha'yı değiştirir, push eder ve PR açar.
#
# Güvenlik: başlık, gövde ve dosya adları güvenilmez metindir. Hiçbiri ${{ }} ile iş akışına gömülmez,
# jq -r ile tırnaklı değişkenlere okunur, gövde dosyadan verilir. Güvenilmez metin günlüğe yazılmaz:
# "::komut::" satırlarına yalnız doğrulanmış ID/DAL girer.
#
# Bir öğedeki hata yalnız o öğeyi atlatır, diğerleri yine işlenir; sonunda çıkış kodu 1 olur.
# (Öğe işlevi `if` içinde çağrıldığından bash orada `set -e` uygulamaz: her adım açıkça denetlenir.)
set -euo pipefail

DOSYA="$1"
GOVDE="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/govde.md"

ogeyi_isle() {
  local i="$1" ID SHA DAL BASLIK PR_SAYISI rc
  ID="$(jq -r --argjson i "$i" '.[$i].id' "$DOSYA")" || return 1
  SHA="$(jq -r --argjson i "$i" '.[$i].yeniSha' "$DOSYA")" || return 1
  DAL="$(jq -r --argjson i "$i" '.[$i].dal' "$DOSYA")" || return 1
  BASLIK="$(jq -r --argjson i "$i" '.[$i].baslik' "$DOSYA")" || return 1
  jq -r --argjson i "$i" '.[$i].govde' "$DOSYA" > "$GOVDE" || return 1

  if ! [[ "$ID" =~ ^[a-z0-9][a-z0-9-]{0,63}$ && "$SHA" =~ ^[0-9a-f]{40}$ \
          && "$DAL" =~ ^guncelleme/[a-z0-9-]+-[0-9a-f]{7}$ && "$DAL" == "guncelleme/$ID-${SHA:0:7}" ]]; then
    echo "::error::$i. öğe geçersiz (id, sha ya da dal deseni tutmuyor), atlandı"
    return 1
  fi

  # Yalnız bu repodaki daldan açılmış PR'lar sayılır: bir fork aynı adlı dalla PR açarak güncellemeyi engelleyemesin.
  if ! PR_SAYISI="$(gh pr list --head "$DAL" --state all --limit 100 --json number,isCrossRepository \
                      -q 'map(select(.isCrossRepository | not)) | length')"; then
    echo "::error::$DAL: PR listesi alınamadı, atlandı"
    return 1
  fi
  if [[ "$PR_SAYISI" != "0" ]]; then
    # Açık, kapatılmış ya da birleştirilmiş PR var: kapatılmışsa sahip bu sürümü reddetmiştir.
    echo "$DAL: bu dal için PR zaten var ($PR_SAYISI), atlandı"
    return 0
  fi

  rc=0
  git ls-remote --exit-code --heads origin "refs/heads/$DAL" > /dev/null || rc=$?
  if [[ "$rc" == "0" ]]; then
    # PR'sız dal: önceki çalışmada PR açılamamış ve dal silinememiş. İçeriği doğrulanmamış bir dalla
    # PR açılmaz; dal silinir ve aşağıda origin/main'den temiz biçimde yeniden oluşturulur.
    echo "::warning::$DAL: dal var ama PR yok, dal silinip yeniden oluşturuluyor"
    if ! git push --quiet origin --delete "$DAL"; then
      echo "::error::$DAL: eski dal silinemedi; elle silin"
      return 1
    fi
  elif [[ "$rc" != "2" ]]; then
    echo "::error::$DAL: uzak dal denetlenemedi (git ls-remote çıkış kodu $rc), atlandı"
    return 1
  fi

  git switch --quiet --discard-changes --force-create "$DAL" origin/main || return 1
  if ! npm run --silent guncelle -- --uygula "$ID" "$SHA"; then
    echo "::error::$DAL: kayitlar/$ID.yaml güncellenemedi, atlandı"
    return 1
  fi
  git add -- "kayitlar/$ID.yaml" || return 1
  git commit --quiet --message "$BASLIK" || { echo "::error::$DAL: commit yapılamadı"; return 1; }
  git push --quiet origin "refs/heads/$DAL:refs/heads/$DAL" || { echo "::error::$DAL: push başarısız"; return 1; }

  if gh pr create --title "$BASLIK" --body-file "$GOVDE" --base main --head "$DAL"; then
    echo "$DAL: PR açıldı"
  else
    # Dal kalırsa ertesi gün yukarıdaki "dal var ama PR yok" yoluna düşer; temiz başlamak için silinir.
    echo "::error::$DAL: PR açılamadı, dal siliniyor"
    git push --quiet origin --delete "$DAL" || echo "::error::$DAL: dal silinemedi, elle silin"
    return 1
  fi
}

ADET="$(jq 'length' "$DOSYA")"
[[ "$ADET" =~ ^[0-9]+$ ]] || { echo "::error::$DOSYA bir dizi değil"; exit 1; }
echo "$ADET güncelleme bulundu"
HATA=0
for ((i = 0; i < ADET; i++)); do
  if ! ogeyi_isle "$i"; then HATA=1; fi
  # Yarıda kalan öğenin dalı ve değişikliği sonrakine taşınmasın.
  git switch --quiet --discard-changes --detach origin/main
done
exit "$HATA"
