# Tasarım yönü ve proje kararları

## Adlar
- Depo ve uygulama adı: `pitwall`
- npm paketi: `pitwall-obd` (`pitwall` npm'de başkasına ait). Komut: `npx pitwall-obd bridge`.

## Görsel dil (referans: açık temalı "bento" panel)
- Uygulama ekranları ve gündüz teması: bento düzeninde kartlar, bol boşluk, yumuşak köşeler, nötr zemin, tek vurgu rengi yeşil.
- Anlam: yeşil = her şey yolunda, sarı = uyarı, kırmızı = acil.
- Ana sayfa: üstte istatistik kartları (araç sağlık skoru, ortalama tüketim, açık arıza sayısı), yanında yapay zekâ asistanı kartı. Hızlı eylemler: "Arızayı açıkla", "Tüketimimi analiz et", "Yolculuk planla", "Muayeneye hazır mıyım?". Altında mesaj alanı. Yolculuk planlayıcı için harita kartı.
- HMI: aynı yeşil vurgu ve tipografi; koyu zemin, büyük rakamlar, yüksek kontrast, ekranda en fazla 3–4 bilgi.
- Marka araç fotoğrafı yok; nötr siluet çizimleri (sedan, hatchback, SUV, kombi).
- Kiralamaya özel bölümler (ödeme, rezervasyon) yok.
- Referansın yaklaşımı alınır, ekran birebir kopyalanmaz.
- Faz 2'de token'lar (renk, tipografi, boşluk, köşe yarıçapı) önce gösterilir, onaydan sonra uygulanır.
