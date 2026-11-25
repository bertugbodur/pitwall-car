# Güvenlik

## Yalnızca okuma

Araca yalnızca OBD Mode 01, 02, 03, 07, 09, 0A ve sayılı `AT` komutları gönderilir:
`ATZ ATWS ATI ATE0 ATL0 ATS0 ATH0 ATSP0 ATAT1 ATAT2 ATDP ATDPN ATRV`. Her bağlantı türü ve yerel köprü
aynı izin listesinden geçer; listede olmayan komut gönderilmez. Mode 04 (kod silme) yoktur.

## Neden arıza silme yok?

Kodu silmek sorunu çözmez, yalnızca gizler; arıza anındaki kayıtlı değerleri yok eder ve muayene
hazırlık durumunu sıfırlar.

## Sürüş

5 km/s üzerinde menüler ve metin girişi kaldırılır. Yine de sürerken telefonla uğraşma.

## Teşhis değildir

Açıklamalar bilgilendirme amaçlıdır. Güvenlik açısından kritik sayılan kod listesi
(`packages/obd-core/src/dtc.ts`) projenin seçimidir ve eksiksiz değildir.
