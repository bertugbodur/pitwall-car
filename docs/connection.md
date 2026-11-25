# Bağlantı rehberi

## Adaptör türleri

| Adaptör | Yol | Nerede çalışır (Kasım 2026 itibarıyla) |
|---|---|---|
| USB ELM327 | Web Serial | Windows, macOS, Linux, ChromeOS: Chrome/Edge 89+. Firefox masaüstü 151+ de Web Serial destekler (pitwall Firefox'ta denenmedi). Android'de USB'ye güvenme |
| Bluetooth Classic (SPP) | Web Serial (RFCOMM) | Masaüstü Chrome/Edge 117+; Android Chrome 138+. Önce işletim sisteminde eşleştir (PIN çoğunlukla 1234 veya 0000) |
| Bluetooth LE | Web Bluetooth | Windows 10+, macOS, ChromeOS, Android (Chrome/Edge). Linux'ta deneysel bayrak gerekir |
| Wi-Fi | Yerel köprü | Bilgisayarda `npx pitwall-obd bridge` |
| Yok | Simülatör | Her yerde |

Safari ve iPhone/iPad'de Web Serial ve Web Bluetooth yoktur; orada simülatör ve kayıtlı yolculuklar kullanılabilir.

## Adaptör seçerken

Marka yerine özelliğe bak:

- **BLE mi, Bluetooth Classic mi?** Android'de ikisi de olur; iOS bu uygulamayla hiçbirini kullanamaz.
- **Gerçek ELM327 mi, klon mu?** Ucuzların çoğu klondur. pitwall fazladan `>`, boş satır ve eksik boşluk gibi tuhaflıklara toleranslıdır, ama klonlar emülatörde taklit edildi, gerçeğiyle denenmedi.
- Adaptörü araçta sürekli takılı bırakacaksan uyku modu olan bir model aküyü korur.

## Wi-Fi köprüsü

1. Adaptörün Wi-Fi ağına bağlan.
2. `npx pitwall-obd bridge` (farklı adres için `--tcp 192.168.0.10:35000`).
3. Ekrandaki eşleşme kodunu web uygulamasında Ayarlar'a gir, "Wi-Fi (yerel köprü)" de.

Seri port için: `npx pitwall-obd ports`, sonra `npx pitwall-obd bridge --serial COM5`.

Köprü yalnızca `127.0.0.1` adresini dinler, her açılışta yeni kod üretir, beş yanlış denemeden sonra kilitlenir
ve yalnızca yerel sayfalarla `https://bertugbodur.github.io` kaynağını kabul eder (kendi barındırdığın kopya için
`--allow-origin`). Chrome, herkese açık bir siteden yerel adrese bağlanırken "yerel ağ erişimi" izni sorabilir.
