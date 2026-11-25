# 📘 Kullanım kılavuzu · User guide

## 🇹🇷 Bu klasörde ne var?

pitwall car'ı indiren ya da web adresinden açan herkes için kullanım kılavuzu.

| Dosya | İçerik |
|---|---|
| [pitwall-car-kullanim-kilavuzu-tr.pdf](pitwall-car-kullanim-kilavuzu-tr.pdf) | Türkçe kılavuz (PDF, yazdırılabilir) |
| [kullanim-kilavuzu.md](kullanim-kilavuzu.md) | Aynı kılavuz, GitHub'da okumak için |
| `img/tr/` | Kılavuzdaki ekran görüntüleri |

**Kısaca:** Chrome veya Edge'de uygulamayı aç → **Simülatörle dene** ya da ELM327 adaptörünü araca takıp bağlan → arızalar, canlı panel, gösterge modu, yolculuklar. Uygulama araca hiçbir şey yazmaz. Sürerken kullanma.

## 🇬🇧 What is in this folder?

The user guide for anyone who downloads pitwall car or opens it from the web.

| File | Content |
|---|---|
| [pitwall-car-user-guide-en.pdf](pitwall-car-user-guide-en.pdf) | English guide (printable PDF) |
| [user-guide.md](user-guide.md) | The same guide, readable on GitHub |
| `img/en/` | Screenshots used in the guide |

**In short:** open the app in Chrome or Edge → **Try the simulator**, or plug an ELM327 adapter into the car and connect → faults, live dashboard, cockpit mode, trips. The app never writes to the car. Do not use it while driving.

---

PDF'leri yeniden üretmek / to rebuild the PDFs: `pnpm build`, `pnpm --filter @pitwall/web preview --port 4173`, `node scripts/make-guides.mjs`.
