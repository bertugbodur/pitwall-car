# Yakıt tüketimi nasıl tahmin edilir

1. **MAF varsa:** yakıt (L/h) = MAF (g/s) × 3600 / (hava-yakıt oranı × yakıt yoğunluğu g/L)
2. **MAF yoksa (speed-density):** hava (g/s) = (devir/120) × motor hacmi (L) × MAP (kPa) × 0,8 × 28,97 / (8,314 × (emme sıcaklığı + 273,15))

| Yakıt | Oran | Yoğunluk (g/L) |
|---|---|---|
| Benzin / hibrit | 14,7 | 745 |
| Dizel | 14,5 | 832 |
| LPG | 15,6 | 540 |

L/100 km yalnızca hız 5 km/s üzerindeyken hesaplanır.

## Doğruluk sınırları

- Hacimsel verim 0,8 sabit varsayılır; turbo motorlarda speed-density yanılabilir.
- **Dizellerde** motor çoğunlukla fakir karışımla çalıştığı için hava debisinden hesap, tüketimi **belirgin biçimde yüksek** gösterir.
- Motor freninde gerçek tüketim sıfıra yakınken hesap yakıt harcanıyor sanır.
- Yakıt trimleri ve LPG dönüşüm sisteminin ayrı davranışı hesaba katılmaz.

Depo doldurma yöntemiyle karşılaştırmadan sayıları kesin kabul etme.
