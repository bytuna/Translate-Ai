# Lumina AI Mail v2 — Tasarım Dokümanı

**Tarih:** 2026-11-25  
**Proje Konumu:** `c:\Users\bytun\Desktop\ilker\Projelerim\Outlok-Ceviri`  
**Referans (Dokunulmayacak Yedek):** `C:\Users\bytun\Desktop\Translate`  
**Ölçek:** Proje (v2 — Yenilenmiş, güvenli Electron masaüstü uygulaması)

---

## 1. Amaç ve Neden (Intent & Why)

Kullanıcı, yabancı firmalardan farklı dillerde gelen iş e-postalarını şu an manuel olarak bir yapay zeka sohbetine kopyalayıp Türkçeye çevirtiyor; ardından kendi cevabını Türkçe yazıp yapay zekaya profesyonel iş mailine düzenletip karşı tarafın diline çevirtiyor ve Outlook'a geri yapıştırıyor.

Bu projenin amacı, kullanıcının halihazırda kullandığı **Lumina Translate** (Electron) uygulamasını temel alarak bu kopyala-yapıştır döngüsünü tek bir hızlı, güvenli ve modern masaüstü penceresine indirmektir:
- Yabancı dildeki e-postayı otomatik dil algılayarak Türkçeye (veya seçilen başka bir hedef dile) çevirmek,
- Aynı anda bağlama uygun **örnek bir profesyonel iş yanıtı** önermek (hem karşı tarafın dilinde hem de kontrol için Türkçe karşılığıyla),
- Kullanıcı öneriyi beğenirse tek tıkla kopyalayıp Outlook'a yapıştırmasını, beğenmezse sohbet kutusundan revizyon istemesini veya kendi Türkçe taslağını profesyonel iş mailine dönüştürmesini sağlamak,
- Bunu yaparken **Outlook posta kutusuna kesinlikle erişmeden** (yalnızca kullanıcının seçip kopyaladığı metinle) çalışmak.

---

## 2. Hedefler, Hedef Dışılar ve Anti-Hedefler

### Hedefler (Goals)
1. **AI Mail Asistanı (Gemini API):**
   - Gelen yabancı mailin dilini otomatik algılama ve hedef dile (varsayılan: Türkçe) çevirme.
   - Gelen mailin içeriğine uygun **örnek profesyonel iş yanıtı** üretme (karşı tarafın dilinde + doğrulama için Türkçe çevirisiyle).
   - **İteratif sohbet / revizyon:** Önerilen yanıt beğenilmezse Türkçe talimatla düzenletme (örn. *"daha resmi olsun"*, *"teslimat 2 hafta de"*, *"fiyatı 2.500 EUR yaz"*).
   - **Sıfırdan Türkçe → İş Maili modu:** Gelen bir mail olmasa bile kullanıcının Türkçe yazdığı ham cevabı/notu seçilen hedef dilde profesyonel iş mailine dönüştürme.
   - Ton seçimi (**Resmi**, **Doğal / Profesyonel**, **Kısa & Net**, **Samimi**).
   - Önerilen yanıtı tek tıkla panoya kopyalama (ve isteğe bağlı pencereyi gizleme).
2. **Ücretsiz Hızlı Çeviri & OCR Korunması:**
   - API kotası harcamadan kısa metinler ve ekran kırpma (`Alan Seç & Çevir`) için mevcut ücretsiz Google Translate + `tesseract.js` OCR özelliğinin ayrı bir sekmede korunması.
3. **Sıfır Posta Kutusu Erişimi (Mimari Gizlilik):**
   - Outlook'a COM/MAPI bağlantısı kurulmaz; yalnızca kullanıcının `Ctrl+C` ile kopyalayıp pencereye getirdiği veya manuel yapıştırdığı metin işlenir.
   - Yapay zekaya gönderim **asla otomatik (tuş basışı/pano açılışıyla) tetiklenmez**; kullanıcı metni önizleme kutusunda görüp (gerekirse hassas bilgileri kırpıp) **Çevir & Yanıt Öner** butonuna bastığında gönderilir. *(Builder önerisi / kullanıcı isterse ayarlardan tek tık akışı değiştirilebilir.)*
4. **Modern, Kullanışlı Pencere Ergonomisi:**
   - Eski Lumina'daki "odak kaybolunca hemen gizlen" (`blur`) davranışı AI Mail modunda kapatılır; pencere üstünde **Sabitle (Pin / Always on Top)** düğmesi bulunur.
   - `3000` karakter limiti kaldırılır (uzun e-posta zincirleri için güvenli üst sınır: örn. `25.000` karakter, uyarı ile).
   - Varsayılan kaynak dil `Otomatik (auto)` yapılır.
5. **Güvenlik Sertleştirmesi:**
   - API anahtarı Windows **DPAPI** (`electron.safeStorage`) ile şifreli olarak yerel kullanıcı dizininde saklanır.
   - `contextIsolation: true`, `nodeIntegration: false`, strict `preload.js` + `contextBridge`, sıkı CSP (`default-src 'self'`), sıfır uzak CDN scripti (yerel CSS + inline SVG ikonlar).
   - Tüm AI ve çeviri çağrıları yalnızca Electron `ipcMain` üzerinden yapılır (HTTP portundan dışarı açılmaz).
   - Gelen e-posta metinlerine karşı **dolaylı prompt injection** izolasyonu (`<untrusted_email>` sınırları + sistem talimatı kilidi).

### Hedef Dışılar (Non-Goals)
- Classic veya New Outlook içine COM/VSTO/Office.js eklentisi kurmak (v1/v2 kapsamı dışında; ileride gerekirse ayrı köprü eklenebilir).
- Kullanıcının Outlook posta kutusunu okumak, e-posta listelemek veya otomatik mail göndermek.
- E-posta eklerini (PDF/Excel/Word) doğrudan parse etmek.
- Çoklu kullanıcı / bulut senkronizasyonu / sunucu taraflı hesap sistemi.

### Anti-Hedefler (Anti-Goals — Teknik olarak çalışsa bile başarısızlık sayılır)
- Uygulamanın kullanıcı açıkça istemeden arka planda e-posta veya pano içeriğini API'ye göndermesi.
- Yazarken her tuş vuruşunda (debounce ile) Gemini API'sine istek atıp gereksiz kota/maliyet oluşturması.
- API anahtarının düz metin (plaintext) dosyada veya repo içinde saklanması.
- `C:\Users\bytun\Desktop\Translate` klasöründeki mevcut çalışan uygulamanın bozulması.

---

## 3. Yaklaşımlar ve Seçim Gerekçesi (Approaches)

İki turlu Agent Team toplantılarında üç yaklaşım değerlendirildi:

| Yaklaşım | Artıları | Eksileri | Durum |
|---|---|---|---|
| **Yaklaşım 1: Lumina v2 (Güvenli Yenilenmiş Electron)** | Kullanıcının alışık olduğu sistem tepsisi, çoklu monitör, OCR ekran kırpma ve `electron-builder` akışını korur; HTML/CSS ile akıcı sohbet + kart arayüzü ve yerleşik `safeStorage` (DPAPI) sunar; 2 mod (Ücretsiz Hızlı Çeviri + AI Mail) tek uygulamada birleşir. | ~100–150 MB RAM kullanımı; eski koddaki güvenlik açıklarının (`nodeIntegration`, CDN, CORS `*`) baştan temizlenmesi gerekir. | **SEÇİLDİ** (Kullanıcı tercihi + Takım önerisi) |
| **Yaklaşım 2: Sıfırdan Hafif Windows (.NET 8 WPF)** | Düşük RAM (~30–50 MB), küçük kurulum, hızlı açılış. | Mevcut OCR ekran kırpma ve Chrome eklenti deneyimi kaybolur; zengin sohbet/kart UI daha maliyetlidir. | Elendi |
| **Yaklaşım 3: Klasik Outlook COM Sağ Tık Eklentisi (Tek Başına veya Hibrit)** | Outlook içinde yerel sağ tık `"AI Translate"` sunar. | Microsoft 365 imzasız COM engeli / Resiliency devre dışı bırakma riski, HTML tablo/link menü tutarsızlıkları, Yeni Outlook'ta COM kalkması ve posta kutusuna erişim kaygısı. | Elendi (v2 kapsam dışı) |

---

## 4. Kullanıcı Deneyimi ve Arayüz Tasarımı

### Pencere Özellikleri
- Boyut: Varsayılan **`980 × 680`** (yeniden boyutlandırılabilir, min `720 × 520`), aktif monitörde ortalanarak açılır.
- Çerçevesiz modern koyu tema (Lumina'nın koyu cam/slate estetiği, tamamen yerel CSS + inline SVG ikonlar).
- Üst başlık çubuğu:
  - Sekmeler: **`AI Mail Asistanı`** (varsayılan) | **`Hızlı Çeviri (Ücretsiz + OCR)`** | **`Ayarlar`**
  - Sağ üst kontroller: **Sabitle (Pin — Always on Top)**, **Küçült / Gizle (Tepsiye)**, **Kapat (Tepsiye gizler; gerçek çıkış sistem tepsisinden)**.
  - `blur` ile otomatik gizlenme **AI Mail** ve **Ayarlar** sekmelerinde **kapalıdır** (kullanıcı Outlook'a tıklayıp detaya bakabilir). İsteğe bağlı olarak yalnızca *Hızlı Çeviri* modunda ve *Pin kapalıysa* eski gizlenme davranışı ayarlardan açılabilir (varsayılan: kapalı — bizim önerimiz).

### Sekme 1: AI Mail Asistanı
İki çalışma akışını tek ekranda temiz şekilde destekler:
1. **Gelen Maili Çevir & Yanıtla (Varsayılan Alt Mod):**
   - **Üst/Sol Panel (Gelen E-posta — Önizleme & Kırpma Kutusu):**
     - Kısayolla (`Ctrl+Shift+T`) pencere açıldığında:
       - Aktif bir mail oturumu yoksa (ilk açılış veya `Yeni Mail` sonrası), panodaki yeni metin otomatik olarak önizleme kutusuna **doldurulur ama API'ye hemen gönderilmez** (kullanıcı imza/gizli bilgi silebilir).
       - Halihazırda devam eden bir mail analizi veya revizyon sohbeti varsa, mevcut sohbet **silinmez**; panoda yeni metin varsa üstte tek tıkla **"Panoda yeni metin algılandı — [Yeni Mail Olarak Yükle] [Yoksay]"** şeridi görünür (böylece Excel/ERP'den fiyat/takip no kopyalayıp revizyon kutusuna yapıştırırken oturum kaybolmaz).
     - Üst araç çubuğu: `Panodan Yapıştır`, `Alan Seç (OCR)` (yerel `tesseract.js` `eng+tur` ile kırpılan metni önizleme kutusuna getirir; görsel doğrudan API'ye gitmez), `Yeni Mail / Temizle`, **Çeviri Dili** (varsayılan: `Türkçe` — Kart 1 çevirisi ve Kart 2 doğrulama karşılığı bu dilde üretilir), **Yanıt Dili** (varsayılan: `Otomatik (Gelen Mailin Dili)` — istenirse farklı bir dile değiştirilebilir), **Yanıt Tonu** (`Resmi`, `Profesyonel`, `Kısa & Net`, `Samimi`).
     - Ana aksiyon butonu: **`Çevir & Örnek Yanıt Oluştur`** (kısayol: `Ctrl+Enter`).
   - **Sağ / Sonuç Paneli (İki Net Kart + Alt Revizyon Sohbeti):**
     - **Kart 1 — Gelen Mail Çevirisi:** Algılanan dil rozeti (örn. `Algılanan: Almanca`) + seçilen `Çeviri Dili`'ndeki çeviri + `Kopyala` butonu.
     - **Kart 2 — Önerilen İş Yanıtı (Yalnızca Gövde Metni):**
       - Outlook'un "Yanıtla" penceresine doğrudan yapıştırılabilmesi için `Konu/Subject:` satırı **eklenmez**, yalnızca temiz e-posta gövdesi üretilir (`suggestedReplyForeign`) + büyük **`Yanıtı Kopyala`** (ve `Kopyala & Gizle`) butonu.
       - Hemen altında seçilen `Çeviri Dili`'nde (varsayılan: **Türkçe**) anlam doğrulama karşılığı (`suggestedReplyVerification`) görünür.
       - Hızlı tek tık ton/uzunluk kısayolları: `Daha Resmi`, `Daha Kısa`, `Daha Samimi`.
     - **Alt Sohbet / Revizyon Çubuğu:**
       - Kullanıcı beğenmezse Türkçe yazar: *"Fiyatın 2.500 EUR olduğunu ve teslimatın 2 hafta süreceğini ekle"* → **`Düzenle`** → mevcut yanıt güncellenir (hem yabancı dil hem doğrulama karşılığı güncellenir; kısa sohbet geçmişi görünür ve `Yeni Mail / Sohbeti Temizle` ile sıfırlanır).
2. **Türkçeden Yeni İş Maili Yaz (Alt Mod / Sekme İçi Geçiş):**
   - Gelen bir mail olmadan kullanıcının kendi yazdığı Türkçe taslağı seçilen **Hedef Dil**de (`İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Rusça, Arapça, Çince` vb.) ve seçilen tonda profesyonel yeni iş mailine dönüştürür.
   - Yeni mail gönderileceği için **Konu (`suggestedSubjectForeign` + doğrulaması)** ve **Mail Gövdesi (`suggestedReplyForeign` + doğrulaması)** ayrı kartlar/alanlar halinde üretilir; ayrı **`Konuyu Kopyala`** ve **`Metni Kopyala`** butonları + alt revizyon sohbet çubuğu bulunur.

### Sekme 2: Hızlı Çeviri (Ücretsiz + OCR)
- Mevcut Lumina'nın API gerektirmeyen ücretsiz hızlı çeviri akışı (Google Translate uç noktası, `sourceLang` varsayılan `auto`, yerel `tesseract.js` `eng+tur` ile `Alan Seç & Çevir` OCR snipper, `Ctrl+Enter` Kopyala & Kapat).
- **Gizlilik koruması:** Global kısayol (`Ctrl+Shift+T`) pencereyi her zaman gizli pano metnini Google'a otomatik göndermeden açar (varsayılan olarak `AI Mail Asistanı` sekmesine odaklanır). `Hızlı Çeviri` sekmesinde yalnızca kullanıcı kutuya manuel yazdığında (300ms debounce) veya açıkça `Çevir` / `Panodan Yapıştır` dediğinde ücretsiz çeviri çalışır.
- Üstte net bir rozet: **`Ücretsiz Mod (API kullanmaz)`** — gizli kurumsal e-postalar için kullanıcı hangi modda olduğunu her an net görür.
- Eski hatalı regex `applyTone()` kaldırılır.

### Sekme 3: Ayarlar
- **Gemini API Yapılandırması:**
  - API Anahtarı alanı (maskeli, Windows DPAPI `safeStorage` ile şifreli kayıt — kayıtlıysa "Şifreli olarak kayıtlı ✓" göstergesi).
  - Model seçimi: varsayılan **`gemini-2.5-flash`**, alternatif **`gemini-2.5-pro`** ve **Özel Model Adı** seçeneği.
  - **`Bağlantıyı Test Et`** butonu (tek küçük test isteği ile anahtar ve model doğrulaması).
  - İsteğe bağlı kullanıcı imzası / firma bağlamı (örn. *"Adım İlker, firmam X — yanıtları buna göre imzala"* — boş bırakılabilir, **bizim önerimiz**).
- **Kısayol & Sistem:**
  - Global kısayol seçimi (geliştirme/yan-yana test için varsayılan **`Ctrl+Shift+T`**, eski Lumina kapatıldığında kullanıcı isterse **`Ctrl+Alt+T`** olarak değiştirebilir).
  - Windows ile başlat (`openAtLogin`) anahtarı (varsayılan: **kapalı**; eski `Desktop\Translate` ile çakışmaması için kullanıcı hazır olduğunda açar).
  - Görünüm/Davranış: `Kopyala & Gizle` tercihi, `Pano otomatik doldurma` aç/kapa.

---

## 5. Teknik Mimari ve Güvenlik Detayları

### Süreç Ayrımı (Electron Hardening)
- **Main Process (`src/main/`):**
  - `main.js`: Yaşam döngüsü, sistem tepsisi, pencere yönetimi, global kısayol, ekran kırpma (`desktopCapturer`), tekil çalışma kilidi (`appId: com.bytuna.lumina-ai-mail`).
  - `config-store.js`: `app.getPath('userData')/config.json` okuma/yazma + API anahtarı için `safeStorage.encryptString` / `safeStorage.decryptString` (Windows DPAPI). DPAPI kullanılamıyorsa düz metne sessizce düşmez, kullanıcıyı uyarır.
  - `gemini-service.js`: Native `fetch` ile Google Gemini REST API (`https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`), `x-goog-api-key` header'ı (URL query string içinde anahtar taşınmaz — log sızıntısı önlenir!). Yapılandırılmış JSON şeması (`responseMimeType: "application/json"`) ile kesin alan ayrımı:
    - Mod 1 (Gelen Mail): `detectedLanguage`, `detectedLanguageCode`, `translation`, `suggestedReplyForeign`, `suggestedReplyVerification`.
    - Mod 2 (Yeni Mail): `suggestedSubjectForeign`, `suggestedSubjectVerification`, `suggestedReplyForeign`, `suggestedReplyVerification`.
    - Revizyon: güncellenmiş `suggestedReplyForeign`, `suggestedReplyVerification` (Mod 2'de varsa `suggestedSubjectForeign`, `suggestedSubjectVerification`).
    - Hata sınıflandırması (geçersiz anahtar, kota/429, ağ hatası, engellenen içerik) Türkçe anlaşılır mesajlarla döner.
  - `google-translate-service.js`: Ücretsiz Hızlı Çeviri modu için mevcut Google Translate uç noktaları (yalnızca `quick:translate` IPC kanalından çağrılır).
  - `ocr-service.js`: Yerel `tesseract.js` paketiyle kırpılmış PNG görüntüsünden metin okuma (dış CDN'den `tesseract.min.js` yüklenmez).
  - `prompt-builder.js`: Dolaylı prompt injection koruması — sistem talimatı e-posta içindeki komutları **veri** olarak ele almayı zorunlu kılar; gelen mail `<untrusted_email>...</untrusted_email>` içinde iletilir.
- **Preload (`src/preload/main-preload.js` & `src/preload/snipper-preload.js`):**
  - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
  - Yalnızca dar, açıkça tanımlı `window.lumina` IPC köprüsü sunulur (`ai.analyzeEmail`, `ai.reviseReply`, `ai.composeFromTurkish`, `ai.testConnection`, `quick.translate`, `settings.get/save`, `window.pin/hide/copyAndHide`, `snipper.start/cancel/done`).
- **Renderer (`src/renderer/`):**
  - `loadFile()` ile doğrudan yerel HTML yüklenir (UI için Express HTTP sunucusuna ihtiyaç yoktur!).
  - Tüm CSS yerel (`styles.css`), tüm ikonlar inline SVG, sıfır dış CDN.
  - Gelen/çevrilen tüm metinler `textContent` ile render edilir (`innerHTML` ile kullanıcı/AI verisi basılmaz — XSS koruması).

### Eski `Desktop\Translate` ile Çakışma Önleme
- `C:\Users\bytun\Desktop\Translate` klasörüne **hiçbir değişiklik yapılmaz**.
- Yeni proje tamamen `c:\Users\bytun\Desktop\ilker\Projelerim\Outlok-Ceviri` içinde kurulur.
- Farklı `appId` (`com.bytuna.lumina-ai-mail`), varsayılan farklı kısayol (`Ctrl+Shift+T`), varsayılan `openAtLogin: false`, ve Express HTTP sunucusu kaldırıldığı için port `3456` çakışması sıfırdır.
- Kullanıcı v2'den memnun kaldığında Ayarlar'dan kısayolu `Ctrl+Alt+T` ve başlangıcı aktif yapıp eski sürümü kapatabilir.

---

## 6. Tasarımda Bizim Verdiğimiz Kararlar (Kullanıcı Kontrolü İçin)

Kullanıcı doğrudan belirtmediği için makul varsayılan olarak belirlediğimiz (ve bağımsız inceleyici kontrolüyle netleştirdiğimiz) noktalar:
1. **Gönderim öncesi önizleme kapısı (sıfır otomatik sızıntı):** `Ctrl+Shift+T` pencereyi varsayılan olarak `AI Mail Asistanı` sekmesinde açar; panodaki metin ne Gemini'ye ne de Google Translate'e otomatik gönderilmez. Kullanıcı 1 tıkla (`Çevir & Örnek Yanıt Oluştur` veya `Ctrl+Enter`) onaylar.
2. **Aktif oturumu koruyan akıllı pano şeridi:** Bir mail üzerinde revizyon yaparken Excel/Outlook'tan yeni bir metin kopyalayıp pencereyi tekrar açtığınızda mevcut sohbetiniz silinmez; üstte tek tıkla **"Panoda yeni metin algılandı — Yeni Mail Olarak Yükle"** şeridi çıkar.
3. **Ayrı Çeviri Dili & Yanıt Dili + Doğrulama Karşılığı:** Mod 1'de `Çeviri Dili` (varsayılan: `Türkçe`) hem gelen mailin çevirisini hem de önerilen yanıtın doğrulama karşılığını belirler; `Yanıt Dili` varsayılan olarak `Otomatik (Gelen Mailin Dili)` şeklindedir ama istenirse değiştirilebilir.
4. **Konu (`Subject`) ayrımı:** Gelen maile yanıtta (Mod 1) yalnızca temiz gövde üretilir (Outlook Yanıtla kutusuna doğrudan yapıştırmak için); sıfırdan yeni iş maili yazarken (Mod 2) **Konu** ve **Gövde** ayrı kopyalama butonlarıyla üretilir.
5. **Yerel OCR kapsamı:** `Alan Seç (OCR)` ilk sürümde yerel `tesseract.js` (`eng+tur`, Latin alfabesi dilleri) ile çalışır ve metni önizleme kutusuna aktarır (ekran görüntüsü doğrudan buluta gitmez). Kiril/Arapça/Çince maillerde `Ctrl+C` ile metin kopyalama doğrudan tam desteklidir.
6. **Varsayılan Gemini modeli:** `gemini-2.5-flash` (hızlı ve ekonomik), Ayarlar'dan `gemini-2.5-pro` veya özel model adına değiştirilebilir.
7. **Chrome sağ tık HTTP köprüsü kaldırıldı:** Güvenlik ve port çakışması nedeniyle eski `127.0.0.1:3456` Express sunucusu varsayılan olarak kapalı/kaldırılmış durumda; tüm uygulamalar için `Ctrl+C` → kısayol çalışır.
8. **İsteğe bağlı imza/firma bilgisi alanı:** Ayarlar'da boş bırakılabilir "Ad / Firma / Kısa İmza" alanı — doldurulursa Gemini önerdiği iş yanıtlarını doğrudan bu imza ile bitirir.

---

## 7. Uygulayıcıya (Builder) Bırakılan Detaylar

- Dosya içi modül sınırları, CSS renk paleti/boşluk ayrıntıları, birim test çerçevesi seçimi (`node:test` vb.).
- Gemini API timeout (örn. 30 sn), retry/hata mesajı metinleri ve yanıt JSON ayrıştırma fallback mantığı.
- `tesseract.js` dil veri dosyalarının (`eng`, `tur`) yerel önbellekleme konumu (`app.getPath('userData')/tessdata`).
- `electron-builder` NSIS/portable yapılandırma detayları ve pencere ikonu üretimi.
