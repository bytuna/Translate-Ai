<p align="center">
  <img src="assets/icon.png" alt="Lumina AI Mail" width="96" height="96" />
</p>

<h1 align="center">Lumina AI Mail</h1>

<p align="center">
  <strong>Outlook posta kutunuza erişmeden çalışan, Google Gemini destekli akıllı e-posta çeviri ve profesyonel iş yanıtı masaüstü asistanı.</strong>
</p>

---

## Ne İşe Yarar?

Uluslararası firmalardan farklı dillerde gelen e-postaları kopyala-yapıştır döngüsüne girmeden hızlı, güvenli ve profesyonel şekilde yönetmenizi sağlar:

- **Gelen Maili Çevir & Yanıt Öner:** Yabancı dildeki e-postanın dilini otomatik algılar, seçtiğiniz dile (varsayılan **Türkçe**) çevirir ve paralel olarak karşı tarafın dilinde **örnek profesyonel iş yanıtı** üretir.
- **Anlam Doğrulama:** Önerilen her yabancı yanıtın altında **Türkçe karşılığı** gösterilir; göndermeden önce tam olarak ne yazdığından %100 emin olursunuz.
- **Revizyon Sohbeti:** Önerilen yanıtı beğenmezseniz alttaki sohbet kutusuna Türkçe talimat yazarak (*"Fiyatı 2.500 EUR yaz, teslimat 2 hafta de"*) veya tek tıkla (**Daha Resmi / Daha Kısa / Daha Samimi**) düzenletebilirsiniz.
- **Türkçeden Yeni İş Maili Yaz:** Sıfırdan yeni e-posta göndermek için ham Türkçe notunuzu hedef dilde ayrı **Konu (Subject)** ve **Mail Gövdesi** olarak profesyonel iş mailine dönüştürür.
- **Ücretsiz Hızlı Çeviri & Yerel OCR:** API kotası harcamadan kısa metinler ve ekrandan metin kırpma (**Alan Seç & Çevir**) için ayrı sekme.

---

## Öne Çıkan Özellikler

### Yapay Zeka & Performans
- **Google Gemini REST API (3.x / 2.5 serisi):** Ayarlar'dan **`Modelleri Getir`** butonuyla kendi API anahtarınızda aktif olan tüm modelleri tek tıkla listeler.
- **Otomatik Yedek Model Geçişi (Auto-Fallback):** Seçili model yoğunluk (`HTTP 503`), hız limiti (`429`), kaldırılmış model (`404`) veya zaman aşımı verirse otomatik olarak sıradaki aktif metin modeline geçer.
- **Düşük Gecikme Optimizasyonu:** Gemini 3.x Flash/Flash-Lite modellerinde `thinkingLevel: "minimal"`, Chromium yerel `net.fetch` (HTTP/2) ve paralel çeviri + yanıt akışı.
- **Gerçek Token & Kullanım Takibi:** Gemini `usageMetadata` verisiyle son işlem, günlük, aylık, toplam ve model bazlı token sayacı + ücretli katman için yaklaşık maliyet tahmini.

### Güvenlik ve Gizlilik Mimarisi
- **Sıfır Posta Kutusu Erişimi:** Outlook COM/MAPI veya e-posta hesabına bağlantı kurmaz; yalnızca sizin `Ctrl+C` ile kopyalayıp önizleme kutusunda onayladığınız metin işlenir.
- **Önizleme & Kırpma Kapısı:** Kısayolla pencere açıldığında panodaki metin kutuya dolar ama API'ye otomatik gönderilmez; göndermeden önce hassas satırları/imzaları silebilirsiniz.
- **Aktif Oturum Koruması:** Devam eden bir revizyon sohbetiniz veya düzenlenmemiş taslağınız varken başka bir uygulamadan metin kopyalarsanız oturumunuz silinmez; üstte tek tıkla **"Yeni Mail Olarak Yükle"** şeridi görünür.
- **DPAPI Şifreli Anahtar Saklama:** Gemini API anahtarı Windows **DPAPI (`safeStorage`)** ile şifrelenerek yerel kullanıcı dizininde tutulur; `x-goog-api-key` başlığıyla gönderilir (URL'de veya loglarda yer almaz).
- **Sertleştirilmiş Electron Kabuğu:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, sıkı CSP (`default-src 'self'`), sıfır uzak CDN, sıfır açık localhost HTTP sunucusu, `textContent`-only render (XSS koruması) ve `<untrusted_email>` prompt-injection izolasyonu.

---

## Kurulum ve Çalıştırma

### Gereksinimler
- Windows 10 / 11 (x64)
- Node.js 20+ (önerilen Node.js 24)
- Google Gemini API Anahtarı ([Google AI Studio](https://aistudio.google.com/apikey))

### Geliştirme Ortamında Çalıştırma
```bash
git clone https://github.com/bytuna/Translate-Ai.git
cd Translate-Ai
npm install
npm start
```

> Windows PowerShell'de gerekirse doğrudan `.\node_modules\.bin\electron.cmd .` komutuyla başlatabilirsiniz.

### Windows `.exe` Kurulum / Portable Paketi Oluşturma
```bash
npm run dist
```
Çıktılar `dist/` klasöründe oluşur:
- `Lumina AI Mail Setup 2.0.0.exe` — Masaüstü ve Başlat Menüsü kısayolu oluşturan Windows kurulum paketi
- `Lumina AI Mail 2.0.0.exe` — Kurulumsuz çalışan tek dosya taşınabilir (portable) sürüm

---

## İlk Ayarlar ve Günlük Kullanım

1. Uygulamayı açıp **Ayarlar** sekmesine geçin.
2. **Gemini API Anahtarı** alanına anahtarınızı girin.
3. **`Modelleri Getir`** butonuna basarak anahtarınızdaki güncel modelleri yükleyin, **`Bağlantıyı Test Et`** ile doğrulayın ve **`Ayarları Kaydet`** deyin.
4. *(Opsiyonel)* İmza/Firma alanını doldurursanız önerilen iş yanıtları otomatik olarak bu imza ile biter.

### Günlük Outlook Akışı
1. Outlook'ta gelen yabancı maili seçip **`Ctrl + C`** yapın.
2. **`Ctrl + Shift + T`** ile Lumina AI Mail penceresini açın (metin önizleme kutusuna gelir; gerekirse düzenleyin).
3. **`Çevir & Örnek Yanıt Oluştur`** (`Ctrl + Enter`) butonuna basın.
4. Yanıtı beğendiyseniz **`Yanıtı Kopyala`** (veya `Kopyala & Gizle`) ile Outlook Yanıtla penceresine yapıştırın; beğenmediyseniz alttaki sohbet kutusundan Türkçe revizyon isteyin.

---

## Testler

Proje `node:test` ile çalışan birim ve güvenlik testlerini içerir:

```bash
npm test
```

Canlı Electron güvenlik/açılış doğrulaması:
```bash
npx electron . --smoke-test
```

---

## Proje Yapısı

```text
├── assets/                          # Uygulama ikonları (SVG, PNG, Tray, çoklu boyut ICO)
├── scripts/
│   └── generate-icons.js            # SVG'den PNG + Windows ICO üretici
├── src/
│   ├── main/
│   │   ├── main.js                  # Electron yaşam döngüsü, tepsi, pencere, IPC, kısayol
│   │   ├── config-store.js          # Ayar deposu + Windows DPAPI API anahtarı şifreleme
│   │   ├── prompt-builder.js        # Prompt-injection korumalı prompt ve JSON şemaları
│   │   ├── gemini-service.js        # Gemini REST istemcisi, thinkingConfig, auto-fallback
│   │   ├── usage-store.js           # Gerçek token & tahmini maliyet sayacı
│   │   ├── google-translate-service.js # Ücretsiz Hızlı Çeviri servisi
│   │   ├── clipboard-session.js     # Aktif oturumu koruyan pano politikası
│   │   ├── shortcut-manager.js      # Global kısayol çakışma & geri alma yöneticisi
│   │   ├── ocr-service.js           # Yerel tesseract.js OCR servisi
│   │   └── display-matcher.js       # Çoklu monitör ekran eşleştirme
│   ├── preload/
│   │   ├── main-preload.js          # Dar contextBridge (window.lumina)
│   │   └── snipper-preload.js       # Ekran kırpıcı contextBridge (window.snipper)
│   └── renderer/
│       ├── index.html               # 3 sekmeli sıkı CSP arayüz
│       ├── styles.css               # Yerel koyu tema stilleri (sıfır CDN)
│       ├── app.js                   # XSS-güvenli UI ve oturum yönetimi
│       ├── snipper.html             # Ekran kırpma katmanı
│       └── snipper.js               # Kırpma mantığı
└── tests/                           # Birim ve statik güvenlik testleri
```

---

## Lisans

Kişisel ve kurumsal iç kullanım için geliştirilmiştir.
