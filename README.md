# Lumina AI Mail v2

Yabancı dillerdeki kurumsal e-postaları **Outlook posta kutunuza erişmeden** çevirmek, bağlama uygun profesyonel iş yanıtları oluşturmak, Türkçe talimatlarla yanıtı revize etmek veya sıfırdan Türkçe taslağı profesyonel yabancı iş mailine dönüştürmek için geliştirilmiş güvenli masaüstü uygulaması.

## Özellikler

- **AI Mail Asistanı (Gemini API):**
  - **Gelen Maili Çevir & Yanıtla:** Yabancı mailin dilini otomatik algılar, seçtiğiniz dile (varsayılan `Türkçe`) çevirir ve karşı tarafın dilinde hazır gövde yanıtı + anlam doğrulaması (Türkçe karşılığı) üretir.
  - **Revizyon Sohbeti:** Önerilen yanıtı beğenmezseniz alttaki sohbet kutusuna Türkçe talimat yazarak (örn. *"Fiyatı 2.500 EUR yaz, teslimat 2 hafta de"*) veya tek tık `Daha Resmi / Daha Kısa / Daha Samimi` butonlarıyla güncelleyebilirsiniz.
  - **Türkçeden Yeni İş Maili Yaz:** Sıfırdan yeni e-posta göndermek için Türkçe notunuzu hedef dilde ayrı **Konu (Subject)** ve **Mail Gövdesi** olarak oluşturur.
- **Ücretsiz Hızlı Çeviri + Yerel OCR:** Kısa metinler ve ekrandan metin kırpma (`Alan Seç & Çevir`) için API kotası harcamayan ayrı sekme.
- **Güvenlik ve Gizlilik:**
  - Outlook COM/MAPI erişimi yoktur; yalnızca sizin `Ctrl+C` ile kopyalayıp onayladığınız metin işlenir.
  - Gemini API anahtarı Windows **DPAPI (`safeStorage`)** ile şifreli olarak saklanır.
  - Aktif bir mail sohbetiniz varken başka yerden metin kopyalarsanız oturumunuz silinmez; üstte tek tıkla yükleme şeridi çıkar.
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, sıfır uzak CDN ve prompt-injection izolasyonu (`<untrusted_email>`).

## Kurulum ve Çalıştırma

```powershell
npm install
npm start
```

> Not: PowerShell'de `npm` komutu yerine gerekirse `& "C:\Program Files\nodejs\npm.cmd" start` veya doğrudan `.\node_modules\.bin\electron.cmd .` kullanabilirsiniz.

### İlk Ayar (Gemini API Anahtarı)
1. Uygulama açıldığında **Ayarlar** sekmesine geçin.
2. **Gemini API Anahtarı** alanına anahtarınızı girin.
3. İsterseniz **Bağlantıyı Test Et** ile doğrulayın ve **Ayarları Kaydet** butonuna basın.
4. *(Opsiyonel)* İmza/Firma bilgisi alanını doldurursanız önerilen iş yanıtları bu imza ile biter.

## Günlük Outlook Kullanımı

1. Outlook'ta gelen yabancı maili seçip **`Ctrl + C`** yapın.
2. **`Ctrl + Shift + T`** ile Lumina AI Mail penceresini açın (metin önizleme kutusuna dolar; hassas satırları silebilirsiniz).
3. **`Çevir & Örnek Yanıt Oluştur`** (`Ctrl + Enter`) butonuna basın.
4. Yanıtı beğendiyseniz **`Yanıtı Kopyala`** (veya `Kopyala & Gizle`) ile alıp Outlook Yanıtla penceresine yapıştırın; beğenmediyseniz alttaki kutudan düzenleme isteyin.

## Paketleme (.exe) ve Eski `Desktop\Translate` Geçişi

```powershell
npm run dist
```

- Bu proje eski `C:\Users\bytun\Desktop\Translate` klasörüne dokunmaz ve onunla çakışmaması için varsayılan olarak **`Ctrl+Shift+T`** kısayolu ve **`Windows ile başlat: Kapalı`** olarak gelir.
- Memnun kaldığınızda eski Lumina'yı kapatıp, bu uygulamanın **Ayarlar** ekranından kısayolu **`Ctrl+Alt+T`** ve **Windows başlangıcında otomatik çalıştır** seçeneğini açabilirsiniz.

## Testler

```powershell
npm test
```
