/** C0/C1 denetim karakterleri ile Unicode satır (U+2028) ve paragraf (U+2029) ayırıcıları. */
const DENETIM = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${String.fromCharCode(0x2028, 0x2029)}]`, "g");

/**
 * CLI günlüğüne yazılacak tek satır. Uyarı ve hata iletileri üçüncü taraf repolardan gelen metin
 * (dosya adı, hata ayrıntısı) taşıyabilir. GitHub Actions stdout ve stderr'deki her satırı "::komut::"
 * diye tarar, bu yüzden ileti yeni satır açamaz: satır sonu, denetim ve satır ayırıcı karakterleri
 * görünür kaçışa çevrilir. Satır her zaman `onek: ` ile başlar, "::" ile başlayamaz.
 */
export function gunlukSatiri(onek: string, mesaj: string): string {
  const kacisli = mesaj.replace(DENETIM, (c) => {
    if (c === "\n") return "\\n";
    if (c === "\r") return "\\r";
    if (c === "\t") return "\\t";
    return `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
  });
  return `${onek}: ${kacisli}`;
}
