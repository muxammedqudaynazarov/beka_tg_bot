# CS2 Skinlar Auksion Tizimi — Texnik Spetsifikatsiya

**Versiya:** 1.0
**Maqsad:** Ushbu hujjat loyiha egasi tomonidan berilgan dastlabki texnik topshiriqni to'liq, tizimlashtirilgan ko'rinishga keltiradi — arxitektura, ma'lumotlar modeli, biznes-qoidalar, API va botlarning ishlash tartibini rasmiylashtiradi. Amaliy kod shu hujjatga muvofiq `backend/` va `frontend/` papkalarida yozilgan.

---

## 1. Loyihaning mohiyati

CS2 (Counter-Strike 2) o'yinidagi skinlarni **auksion** (kim ko'p taklif bersa — o'sha g'olib) tartibida sotadigan, to'liq **Telegram Mini App** ko'rinishidagi savdo platformasi. Real pul aylanmasi Click.uz to'lov tizimi orqali amalga oshiriladi; har bir taklif berish "zaklad" mexanizmi bilan himoyalangan (soxta/beparvo takliflarning oldini olish uchun).

## 2. Aktyorlar (rollar)

| Rol | Qanday kiradi | Nima qila oladi |
|---|---|---|
| **Foydalanuvchi (USER)** | `@cs2auksion_bot` → Mini App | Auksionlarni ko'rish, qidirish, filtrlash, narx taklif qilish, hisobni to'ldirish, profilini ko'rish |
| **Administrator (ADMIN)** | `@cs2admin_auksion_bot` (alohida bot, alohida token) | Kategoriya va auksion boshqaruvi, foydalanuvchilarni ban qilish, skidka berish |
| **Bosh administrator (SUPERADMIN)** | Xuddi admin boti, lekin `.env`dagi `SUPERADMIN_TELEGRAM_IDS` ro'yxatida | Yuqoridagilarga qo'shimcha: boshqa foydalanuvchilarni admin qilish/admindan tushirish |

**Qat'iy qoida:** ADMIN va SUPERADMIN rollari auksionda **hech qachon** taklif bera olmaydi. Bu ikki bosqichda ta'minlangan: (1) admin botida bunday tugma/buyruq umuman yaratilmagan, (2) backend'dagi `placeBid()` funksiyasi chaqiruvchining rolini tekshirib, ADMIN/SUPERADMIN bo'lsa so'rovni rad etadi — shu sababli hatto kimdir API'ga to'g'ridan-to'g'ri murojaat qilishga urinsa ham himoyalangan.

## 3. Arxitektura

```
┌──────────────────────┐        ┌──────────────────────┐
│  @cs2auksion_bot      │        │  @cs2admin_auksion_bot│
│  (foydalanuvchi bot)  │        │  (admin bot)          │
└──────────┬────────────┘        └──────────┬────────────┘
           │ Telegraf (Node.js)              │ Telegraf (Node.js)
           │                                 │
           │        ┌────────────────────────┘
           │        │
   ┌───────▼────────▼───────────────────────────┐
   │            BACKEND (bitta jarayon)           │
   │  Express REST API · Socket.io · Auksion motori│
   │  Click.uz integratsiyasi · Cron (auto-yopish) │
   └───────┬───────────────────────────┬──────────┘
           │ Prisma ORM                │ Webhook (Prepare/Complete)
   ┌───────▼────────┐          ┌───────▼────────┐
   │  PostgreSQL     │          │   Click.uz      │
   │  (yagona baza)  │          │  to'lov tizimi  │
   └─────────────────┘          └─────────────────┘
           ▲
           │ REST API (HTTPS) + WebSocket (real-vaqt narx yangilanishi)
   ┌───────┴─────────────────────────────┐
   │  Telegram Mini App (ReactJS, Vite)   │
   │  Foydalanuvchi ochadigan interfeys   │
   └───────────────────────────────────────┘
```

**Muhim arxitektura qarori — "tizim bitta":** ikkala bot ham, REST API ham bitta Node.js jarayonida (`backend/src/index.js`) ishlaydi va bitta Prisma clientga ulanadi. Bu texnik topshiriqdagi "adminlar va foydalanuvchilar alohida botlar orqali kirishadi, lekin tizim bitta bo'lishi kerak" talabini to'g'ridan-to'g'ri bajaradi — ma'lumotlar hech qachon ikki joyda takrorlanmaydi yoki sinxronizatsiya talab qilmaydi.

## 4. Texnologiyalar to'plami

| Qatlam | Texnologiya | Sabab |
|---|---|---|
| Frontend (Mini App) | ReactJS 18 + Vite + TailwindCSS | Talab qilingan ReactJS; Vite tez build beradi; Tailwind dizaynni tez va izchil qiladi |
| Backend API | Node.js + Express | Telegraf (bot kutubxonasi) bilan tabiiy integratsiya, keng ekotizim |
| Ma'lumotlar bazasi | PostgreSQL + Prisma ORM | Kuchli tranzaksiya kafolatlari (auksion uchun kritik), Prisma orqali xavfsiz va tez ishlab chiqish |
| Real-vaqt yangilanish | Socket.io | Narx o'zgarganda barcha ko'rib turgan foydalanuvchilarga darhol xabar |
| Telegram botlar | Telegraf | Scene/Wizard qo'llab-quvvatlaydi (admin botidagi "yangi auksion" formasi uchun qulay) |
| To'lov | Click.uz (Shop API: Prepare/Complete) | Texnik topshiriqda aniq ko'rsatilgan (docs.click.uz) |
| Vazifalar rejalashtiruvchisi | node-cron | Muddati tugagan auksionlarni avtomatik yopish |

## 5. Foydalanuvchi Mini App — ekranlar bo'yicha tavsif

### 5.1. Bosh sahifa (`/`)
- Tepada: skin nomi bo'yicha qidiruv maydoni.
- Uning ostida: **Bugun** (24 soat ichida tugaydigan auksionlar), **Yangi** (oxirgi qo'shilganlar), **Filtr** tugmalari.
- Asosiy qism: auksion kartalari to'ri (2 ustunli grid) — har birida rasm, kamyoblik rangi (chap chegarada), nomi, format factory/float, StatTrak belgisi, joriy narx, qolgan vaqt.
- Pastda, navigatsiya ustida: bugun tugaydigan takliflarning uzluksiz aylanuvchi tasmasi ("marquee").

### 5.2. Filtr sahifasi (`/filter`)
Kategoriya (qurol nomi), format factory (FN/MW/FT/WW/BS), StatTrak (bor/yo'q), narx bo'yicha tartiblash (arzon→qimmat / qimmat→arzon). Filtrlar global holatda saqlanadi va Bosh sahifaga qaytganda qo'llaniladi.

### 5.3. To'lov sahifasi (`/payment`)
Joriy balans va zakladda "band" turgan summa ko'rsatiladi. Foydalanuvchi summa kiritadi (yoki tayyor variantlardan tanlaydi) → "To'ldirish" tugmasi → Click.uz to'lov sahifasiga yo'naltiriladi.

### 5.4. Profil sahifasi (`/profile`)
Ism, balans, reyting balli, (agar berilgan bo'lsa) skidka foizi, sotib olingan skinlar ro'yxati, maxfiylik siyosati va yordam havolalari.

### 5.5. Auksion tafsiloti sahifasi (`/auction/:id`)
Katta rasm, to'liq tavsif, joriy narx (real-vaqtda yangilanadi), qolgan vaqt, joriy yetakchi, "Narxni oshirish" tugmasi (tavsiya etilgan qadam bilan) va "O'z narxim" maydoni, zaklad miqdori haqida ogohlantirish, ketma-ket oshirish hisoblagichi (agar foydalanuvchi joriy yetakchi bo'lsa), takliflar tarixi.

### 5.6. Pastki navigatsiya (barcha sahifalarda)
`Asosiy | Filtr | To'lov | Profil` — ikonka + matn bilan, joriy sahifa rangi bilan ajratib ko'rsatiladi.

## 6. Auksion biznes-mantiqi (rasmiy qoidalar)

Quyidagi qoidalar `backend/src/services/auctionService.js`da amalga oshirilgan va `.env` orqali sozlanadigan konstantalarga tayanadi:

1. **Zaklad (deposit):** har bir taklif narxning `AUCTION_DEPOSIT_PERCENT` (standart: 25%) qismini talab qiladi. Zarur summa foydalanuvchining erkin balansidan `holdBalance`ga ko'chiriladi. Agar balans yetarli bo'lmasa — taklif rad etiladi va sabab aniq ko'rsatiladi.
2. **Ketma-ket oshirish limiti:** agar taklif beruvchi allaqachon joriy yetakchi bo'lsa, u ketma-ket `AUCTION_MAX_CONSECUTIVE_RAISES` (standart: 10) martagacha narx oshira oladi. Boshqa foydalanuvchi taklif berishi bilan bu hisoblagich nolga tushadi (yangi yetakchi uchun 1dan boshlanadi).
3. **Erkin narx kiritish:** foydalanuvchi tayyor "qadam"dan foydalanmasdan, o'zi xohlagan narxni yozishi mumkin — yagona shart, bu narx joriy narxdan past bo'lmasligi.
4. **Yetakchi almashganda zaklad qaytarish:** kimdir avvalgi yetakchidan yuqori narx taklif qilsa, avvalgi yetakchining to'liq zakladi darhol uning erkin balansiga qaytariladi, yangi yetakchidan esa yangi narxning foizi ushlab qolinadi.
5. **Vaqtni avtomatik uzaytirish:** auksion tugashiga `AUCTION_EXTEND_THRESHOLD_MINUTES` (standart: 5) daqiqadan kam qolganda yangi taklif kelsa, tugash vaqti joriy paytdan yana `AUCTION_EXTEND_BY_MINUTES` (standart: 5) daqiqaga suriladi — bu cheksiz davom etishi mumkin (har safar oxirgi daqiqalarda taklif kelaversa).
6. **G'olibni aniqlash va to'lov muddati:** auksion vaqti tugaganda (cron job har 15 soniyada tekshiradi), joriy yetakchi g'olib deb belgilanadi va auksion **darhol yopilmaydi** — `AWAITING_PAYMENT` holatiga o'tadi, g'olibga qolgan 75%ni to'lashi uchun `WINNER_PAYMENT_WINDOW_HOURS` (standart: 5 soat) beriladi. G'olib Mini App orqali "To'lovni yakunlash"ni bosadi (yoki cron muntazam o'zi ham urinib ko'radi — foydalanuvchi orada hisobini to'ldirgan bo'lishi mumkin). To'lansa — `PAID`. Muddat o'tsa — zakladning `DEPOSIT_REFUND_ON_EXPIRY_PERCENT`i (standart 50%) g'olibga qaytariladi, qolgani ("boshqalarning sotib olishiga to'sqinlik qilgani" uchun jarima) ushlab qolinadi, auksion `PAYMENT_EXPIRED` holatiga o'tadi. Hech kim taklif bermagan bo'lsa — `UNSOLD`.
7. **Yetkazib berish:** `PAID` auksionni admin Steam Trade orqali (g'olibning Profil'da kiritgan Trade URL'i yordamida) qo'lda yuboradi, so'ng Admin Mini App'da "yuborildi" deb belgilaydi — status `DELIVERED`ga o'tadi. Bu bosqich **avtomatlashtirilmagan**: to'liq avtomatlashtirish uchun alohida Steam bot-akkaunt, Steam Web API kaliti va Mobile Authenticator integratsiyasi kerak bo'ladi (15-bo'limga qarang).
8. **Parallellik xavfsizligi:** bir vaqtning o'zida ikki foydalanuvchi bitta auksionga taklif bersa, tizim optimistik lokировка (`Auction.version` maydoni) orqali poyga holatini oldini oladi — ikkinchi so'rov avtomatik qayta uriniladi.
9. **Adminlar taklif bera olmaydi** (2-bo'limga qarang).

## 7. Reyting tizimi

Har bir foydalanuvchining `ratingScore`si avtomatik oshib boradi:
- Har bir taklif uchun +1 ball (`RatingEvent.type = BID_PLACED`).
- Auksionni yutib olganda +10 ball (`AUCTION_WON`).

Reyting yuqori foydalanuvchilarga **skidka berish imkoniyati** mavjud (`User.discountPct`), lekin bu **hech qachon avtomatik berilmaydi** — faqat admin panel/bot orqali (`POST /api/admin/users/:id/discount` yoki kelajakda admin botiga qo'shiladigan tugma orqali) qo'lda tasdiqlanadi. Bu texnik topshiriqdagi "adminni ishtirokisiz berilmasin" talabini bajaradi.

## 8. Administrator tizimi (`@cs2admin_auksion_bot` + Admin Mini App)

Admin ikki xil interfeys orqali ishlashi mumkin: bot ichidagi chat-wizard (pastda tavsiflangan) va **Admin Mini App** (`admin-frontend/`) — ataylab sodda dizaynli, faqat funksional: yangi auksion yaratish formasi, kategoriya qo'shish, faol auksionlarni boshqarish (vaqt o'zgartirish/bekor qilish), va to'langan auksionlarni Steam orqali yuborilgach "yuborildi" deb belgilash. Ikkalasi ham bir xil backend endpointlaridan foydalanadi. Admin Mini App alohida autentifikatsiya oqimiga ega (`/api/auth/telegram-admin`) — u `ADMIN_BOT_TOKEN` bilan imzolangan initData'ni tekshiradi va faqat bazada ADMIN/SUPERADMIN roli bor foydalanuvchiga sessiya beradi.

| Funksiya | Qanday ishlaydi |
|---|---|
| **Kategoriyalarni boshqarish** | Yangi kategoriya qo'shish (nom kiritish orqali); mavjudlarini ro'yxatini ko'rish. API orqali (`/api/categories`) tahrirlash/o'chirish (deaktivatsiya) ham mavjud. |
| **Yangi auksion qo'shish** | Bosqichma-bosqich "sehrgar" (wizard): rasm → nom → kategoriya (tugmalardan tanlash) → kamyoblik rangi (tugmalardan) → format factory qiymati → format factory kategoriyasi (FN/MW/FT/WW/BS, tugmalardan) → StatTrak (ha/yo'q) → boshlang'ich narx → davomiylik (daqiqada). |
| **Auksion vaqtini o'zgartirish** | Faol auksionlar ro'yxatidan tanlab, yangi tugash vaqtini (necha daqiqadan keyin) kiritish; `0` kiritilsa auksion bekor qilinadi. |
| **Foydalanuvchilarni boshqarish** | Username yoki Telegram ID bo'yicha qidirish → ban qilish / blokdan chiqarish. Rolni o'zgartirish (admin qilish/tushirish) faqat SUPERADMIN uchun. |
| **Audit** | Har bir admin amali `AdminAuditLog` jadvaliga yoziladi (kim, qachon, nima qildi) — shaffoflik uchun. |

## 9. Ma'lumotlar bazasi sxemasi (qisqacha)

To'liq sxema: `backend/prisma/schema.prisma`.

| Jadval | Vazifasi |
|---|---|
| `User` | Foydalanuvchi/admin profili, balans, zakladdagi mablag' (`holdBalance`), reyting, skidka, ban holati |
| `WeaponCategory` | Qurol/skin kategoriyalari (AK-47, Glock va h.k.) |
| `Auction` | Har bir savdoga qo'yilgan skin — narx, holat, tugash vaqti, joriy yetakchi, versiya (optimistik lok) |
| `Bid` | Har bir taklifning to'liq tarixi (audit uchun) |
| `Transaction` | Barcha pul harakatlari: to'ldirish, zaklad ushlash/qaytarish, xarid, admin tuzatishi |
| `RatingEvent` | Reyting balllarining har bir hodisasi (shaffoflik uchun) |
| `AdminAuditLog` | Admin amallari jurnali |

## 10. API endpointlari (asosiylari)

| Method | Yo'l | Tavsif | Ruxsat |
|---|---|---|---|
| POST | `/api/auth/telegram` | Telegram initData orqali kirish/ro'yxatdan o'tish, JWT qaytaradi | Ochiq |
| GET | `/api/auctions` | Ro'yxat (qidiruv/filtr/tab parametrlari bilan) | Ochiq |
| GET | `/api/auctions/ending-strip` | Bugun tugaydiganlar tasmasi | Ochiq |
| GET | `/api/auctions/:id` | Bitta auksion tafsiloti + takliflar tarixi | Ochiq |
| POST | `/api/auctions/:id/bid` | Narx taklif qilish | Foydalanuvchi (JWT) |
| GET | `/api/categories` | Kategoriyalar ro'yxati | Ochiq |
| POST/PATCH/DELETE | `/api/categories` | Kategoriya boshqaruvi | Admin |
| GET | `/api/profile` | O'z profili, xaridlar tarixi | Foydalanuvchi (JWT) |
| POST | `/api/payments/topup` | To'ldirish so'rovi, Click checkout havolasi qaytaradi | Foydalanuvchi (JWT) |
| POST | `/api/payments/click/prepare` | Click Shop API — Prepare bosqichi | Click server (imzo orqali) |
| POST | `/api/payments/click/complete` | Click Shop API — Complete bosqichi | Click server (imzo orqali) |
| POST | `/api/admin/auctions` | Yangi auksion yaratish | Admin |
| PATCH | `/api/admin/auctions/:id/time` | Auksion vaqtini o'zgartirish | Admin |
| GET | `/api/admin/users` | Foydalanuvchilar ro'yxati | Admin |
| POST | `/api/admin/users/:id/ban` `/unban` | Ban boshqaruvi | Admin |
| POST | `/api/admin/users/:id/set-role` | Rol berish | Faqat SUPERADMIN |
| POST | `/api/admin/users/:id/discount` | Qo'lda skidka berish | Admin |

## 11. Click.uz to'lov oqimi

1. Foydalanuvchi Mini App'da summa kiritadi → backend `Transaction(status=PENDING)` yaratadi va Click "checkout" havolasini qaytaradi.
2. Foydalanuvchi shu havolada to'lovni amalga oshiradi.
3. Click backendga **Prepare** so'rovini yuboradi (`action=0`) — backend imzo (`sign_string`) va summani tekshiradi, tasdiqlaydi.
4. Click **Complete** so'rovini yuboradi (`action=1`) — backend balansni oshiradi va tranzaksiyani `SUCCESS` deb belgilaydi.
5. Faqat shu ikki server-server so'rovi orqali tasdiqlangan to'lov balansni oshiradi — foydalanuvchi brauzerida ko'rsatilgan "muvaffaqiyatli" sahifasiga hech qachon ishonilmaydi.

## 12. Xavfsizlik talablari

- Barcha maxfiy kalitlar (`.env`) faqat serverda saqlanadi, git repositoryga tushmaydi.
- Mini App foydalanuvchisi Telegram `initData` orqali HMAC-SHA256 imzosi bilan tasdiqlanadi (soxtalashtirib bo'lmaydi).
- Click.uz webhooklari MD5 `sign_string` orqali tekshiriladi.
- Har bir API so'rovida JWT token tekshiriladi; admin endpointlari qo'shimcha rol tekshiruvidan o'tadi.
- Auksionda taklif berish tranzaksion (DB transaction) va optimistik lok bilan himoyalangan — moliyaviy nomuvofiqlik (masalan ikki marta zaklad yechish) imkonsiz.

## 13. Dizayn yo'nalishi

Butun interfeys **"ночной" (tungi/qorong'i)** mavzuda: fon deyarli qora (`#0A0C10`), kartalar biroz ochroq sirt rangida. Har bir auksion kartasining chap chegarasi CS2'ning o'z kamyoblik ranglari bilan bo'yaladi (Consumer — och kulrang, Mil-Spec — ko'k, Restricted — binafsha, Classified — pushti, Covert — qizil, noyob — oltin) — bu shunchaki bezak emas, balki o'yinning o'ziga xos vizual tilidan foydalanib, foydalanuvchiga bir qarashda skin qanchalik noyob ekanini bildiradi. Sarlavhalar uchun "Rajdhani" (texnik, o'tkir shrift), matn uchun "Inter", raqamli qiymatlar (narx, float, taymer) uchun "JetBrains Mono" ishlatiladi — bu narxlar va vaqt hisoblagichlariga "aniq o'lchov asbobi" hissini beradi.

## 14. Loyiha papka strukturasi

```
backend/
├── prisma/schema.prisma       # Ma'lumotlar bazasi sxemasi
├── prisma/seed.js             # Boshlang'ich kategoriyalar
└── src/
    ├── config/env.js          # Barcha muhit o'zgaruvchilari shu yerdan o'qiladi
    ├── db/prisma.js           # Prisma client (yagona nusxa)
    ├── middleware/auth.js     # JWT tekshiruvi, rol tekshiruvi
    ├── services/
    │   ├── auctionService.js  # Auksion motori (6-bo'limdagi barcha qoidalar)
    │   └── clickPaymentService.js
    ├── routes/                # REST API endpointlari (10-bo'lim)
    ├── bots/
    │   ├── userBot.js         # Foydalanuvchi boti
    │   └── adminBot.js        # Admin boti (Scenes/Wizard bilan)
    ├── jobs/auctionScheduler.js  # Muddati tugagan auksionlarni yopish (cron)
    ├── sockets/auctionSocket.js  # Real-vaqt xonalar
    └── utils/
        ├── telegramInitData.js   # Telegram imzo tekshiruvi
        └── clickSignature.js     # Click.uz imzo tekshiruvi/yaratish
frontend/
└── src/
    ├── components/            # BottomNav, AuctionCard, RarityBadge, va h.k.
    ├── pages/                 # HomePage, FilterPage, PaymentPage, ProfilePage, AuctionDetailPage
    ├── hooks/                 # useCountdown, useAuctionSocket
    ├── AuthContext.jsx        # Telegram orqali kirish va sessiya
    ├── FiltersContext.jsx     # Global filtr holati
    ├── api.js                 # Backend bilan aloqa (axios)
    └── telegram.js            # Telegram WebApp SDK wrapper
```

## 15. Hali to'liq ishlanmagan / kengaytirish tavsiya etiladigan joylar

Texnik topshiriqning 4-bandida aytilganidek — qolgan kamchiliklar quyida ochiq va aniq ko'rsatilgan (bu README.md'ning 7-bo'limida ham takrorlangan):

- Click.uz `sign_string` formulasi rasmiy hujjatning umumiy, keng tarqalgan ko'rinishi asosida yozilgan — real merchant kabinet bilan sinovdan o'tkazish shart.
- Rasm xranilishi hozircha Telegramning vaqtinchalik fayl havolasidan foydalanadi — production uchun doimiy xranilish (S3/R2) tavsiya etiladi.
- Auksion bekor qilinganda aktiv zakladlarni avtomatik qaytarish funksiyasi hali to'liq yozilmagan (`admin.routes.js`dagi izohga qarang).
- Yuklama (concurrency) testlari, rate limiting, va production monitoring/logging (masalan Sentry) hali qo'shilmagan.
- Admin botida foydalanuvchiga skidka berish funksiyasi hozircha faqat REST API orqali mavjud — botga alohida tugma sifatida qo'shilishi mumkin.
