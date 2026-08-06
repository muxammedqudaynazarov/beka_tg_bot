# CS2 Skinlar Auksion Tizimi

CS2 (Counter-Strike 2) skinlari uchun Telegram Mini App ko'rinishidagi auksion (kim ko'p taklif — o'sha oladi) savdo tizimi. Foydalanuvchilar alohida bot orqali, administratorlar alohida bot orqali kirishadi, lekin ikkalasi ham bitta backend va bitta ma'lumotlar bazasidan foydalanadi.

> To'liq texnik tavsif, biznes-qoidalar va arxitektura uchun **`TEXNIK_SPESIFIKATSIYA.md`** faylini o'qing. Ushbu README faqat o'rnatish, ishga tushirish va deploy qilish qo'llanmasi.

## 1. Tizim tarkibi

```
cs2-skins-auction/
├── backend/          # Node.js + Express API, Socket.io, 2 ta Telegram bot, auksion motori
├── frontend/         # React (Vite) — foydalanuvchi Mini App'i
├── admin-frontend/   # React (Vite) — Admin Mini App'i (2-band: yangi auksion yaratish formasi)
├── docker-compose.yml   # Lokal PostgreSQL (+ Adminer) uchun — MySQL/MariaDB ishlatsangiz kerak emas
└── TEXNIK_SPESIFIKATSIYA.md
```

**Texnologiyalar:** Node.js / Express, MySQL yoki MariaDB (Prisma ORM orqali — PostgreSQL ham qo'llab-quvvatlanadi, `schema.prisma`dagi `provider`ni almashtiring), Socket.io (real-vaqt auksion), Telegraf (Telegram botlar), ReactJS + Vite + TailwindCSS (ikkala frontend), Click.uz (to'lov).

## 2. Talablar (kerakli dasturlar)

- **Node.js** 20 yoki undan yuqori ([nodejs.org](https://nodejs.org))
- **PostgreSQL** 14+ (yoki quyida ko'rsatilgan Docker usuli)
- **Telegram bot tokenlari** — [@BotFather](https://t.me/BotFather) orqali 2 ta bot yarating:
  - Foydalanuvchi boti (masalan `@cs2auksion_bot`)
  - Admin boti (masalan `@cs2admin_auksion_bot`) — **alohida, boshqa token**
- **Click.uz merchant kabineti** — [my.click.uz](https://my.click.uz) orqali ro'yxatdan o'ting, `SERVICE_ID`, `MERCHANT_ID`, `SECRET_KEY` oling
- Serverga joylashtirish uchun **https domen** (Telegram Mini App faqat https manzillarni qabul qiladi)

## 3. Tez boshlash (lokal / test muhitida)

### 3.1. Repositoryni oling va ma'lumotlar bazasini ishga tushiring

```bash
# Loyiha papkasiga kiring
cd cs2-skins-auction

# PostgreSQL'ni Docker orqali ishga tushirish (eng oson yo'l)
docker compose up -d
# Bazaga http://localhost:8081 (Adminer) orqali ham kirish mumkin
```

Docker ishlatmoqchi bo'lmasangiz, o'zingizdagi PostgreSQL serverida `cs2_auction` nomli baza va foydalanuvchi yarating, so'ng `backend/.env` ichidagi `DATABASE_URL`ni shunga mos yozing.

### 3.2. Backend'ni sozlash

```bash
cd backend
cp .env.example .env
# .env faylini oching va quyidagilarni to'ldiring:
#   DATABASE_URL, USER_BOT_TOKEN, ADMIN_BOT_TOKEN, MINI_APP_URL,
#   SUPERADMIN_TELEGRAM_IDS, CLICK_* kalitlar

npm install
npx prisma generate         # Prisma clientni yaratadi
npx prisma migrate dev --name init   # Ma'lumotlar bazasida jadvallarni yaratadi
npm run seed                 # Boshlang'ich kategoriyalarni qo'shadi (ixtiyoriy, lekin tavsiya etiladi)

npm run dev                  # http://localhost:4000 da ishga tushadi (nodemon bilan, o'zgarishlarni kuzatib turadi)
```

Backend ishga tushganda konsolda ikkala Telegram bot ham ("userBot" va "adminBot") ulanganini ko'rasiz. Agar tokenlarni hali kiritmagan bo'lsangiz, botlar shunchaki ishga tushmaydi (ogohlantirish chiqadi), lekin API va real-vaqt auksion baribir ishlayveradi.

**Muhim:** `SUPERADMIN_TELEGRAM_IDS`ga o'zingizning shaxsiy Telegram ID raqamingizni kiriting (uni [@userinfobot](https://t.me/userinfobot) orqali bilib olishingiz mumkin). Shu orqali admin botga birinchi marta kirganingizda avtomatik "bosh admin" bo'lasiz.

### 3.3. Frontend'ni sozlash (Mini App)

```bash
cd ../frontend
cp .env.example .env
# .env ichida VITE_API_BASE_URL ni backend manzilingizga moslang (lokal uchun http://localhost:4000)

npm install
npm run dev   # http://localhost:5173 da ishga tushadi
```

### 3.4. Admin Mini App'ni sozlash (2-band)

Bu — admin uchun alohida, oddiy dizaynli Mini App: yangi auksion yaratish, kategoriya qo'shish, faol auksionlarni boshqarish, to'langan auksionlarni "yuborildi" deb belgilash.

```bash
cd ../admin-frontend
cp .env.example .env
# VITE_API_BASE_URL ni backend manzilingizga moslang (foydalanuvchi frontend'idagi bilan bir xil)

npm install
npm run dev   # http://localhost:5174 da ishga tushadi (foydalanuvchi Mini App'i 5173-portda, bu esa 5174-portda)
```

Bu ilova `ADMIN_BOT_TOKEN` bilan ochiladi (userBot emas, adminBot orqali) — backend'dagi `/api/auth/telegram-admin` shu tokenga qarab tekshiradi va faqat bazada ADMIN/SUPERADMIN roli bor odamlarga sessiya beradi.

### 3.5. Mini App'larni Telegram'da sinash

Telegram Mini App'lar **faqat https manzillarda** ishlaydi — shuning uchun `localhost:...`ni to'g'ridan-to'g'ri Telegram'da ocholmaysiz. Test uchun eng qulay yo'l — [ngrok](https://ngrok.com) yoki shunga o'xshash tunnel xizmati. Bu loyihada **UCHTA** narsa alohida-alohida tashqi dunyoga ochilishi kerak: backend (4000), foydalanuvchi Mini App'i (5173), admin Mini App'i (5174) — shuning uchun 3 ta alohida terminalda 3 ta tunnel kerak bo'ladi:

```bash
ngrok http 4000   # backend
ngrok http 5173   # foydalanuvchi Mini App
ngrok http 5174   # admin Mini App
```

Har birining `https://xxxx.ngrok-free.app` manzilini tegishli joyga qo'ying:
- backend tunnel → `frontend/.env` va `admin-frontend/.env`dagi `VITE_API_BASE_URL`
- foydalanuvchi frontend tunnel → `backend/.env`dagi `FRONTEND_URL` **va** `MINI_APP_URL` (ikkalasi ham, bir xil qiymat!)
- admin frontend tunnel → `backend/.env`dagi `ADMIN_MINI_APP_URL`

**DIQQAT — bu eng ko'p uchraydigan xato manbai:** ngrok bepul tarifda har safar tunnelni qayta ishga tushirganingizda **yangi, tasodifiy** subdomen beradi. Agar shu 4 ta joyni (yuqorida) qayta sinxronlashtirishni unutsangiz — Mini App "Kirishda xatolik" berishda davom etadi (CORS) yoki Click to'lovlari balansga tushmay qoladi (webhook manzili eskirgan bo'ladi). Backend qayta ishga tushirilganda konsolda hech qanday xato chiqmasa ham, bu — sozlamalar noto'g'ri ekanini emas, backend ishga tushganini bildiradi; muammo alohida frontend/Click tomonida bo'ladi. Doimiy test qilish uchun ngrok'ning pullik "reserved domain" funksiyasi yoki arzon VPS'ga o'tish ancha qulayroq.

Sozlab bo'lgach, backend va ikkala frontendni qayta ishga tushiring, so'ng Telegram'dagi foydalanuvchi botingizga `/start` yozing — "🎮 Auksionni ochish" tugmasi chiqadi.

Admin panelni sinash uchun xuddi shunday — admin botingizga `/start` yozing (avval `SUPERADMIN_TELEGRAM_IDS`ga ID'ingizni qo'shganingizga ishonch hosil qiling).

## 4. Build qilish va serverga joylashtirish (production)

### 4.1. Backend (production server)

```bash
cd backend
npm install --omit=dev
npx prisma generate
npx prisma migrate deploy     # migrate dev EMAS — deploy (production uchun xavfsiz)

# .env faylida production qiymatlarini kiriting:
#   NODE_ENV=production
#   PUBLIC_BACKEND_URL=https://api.sizningdomeningiz.uz   (Click webhooklari shu yerga keladi)
#   FRONTEND_URL=https://app.sizningdomeningiz.uz

npm start   # yoki quyidagi kabi process manager bilan:
```

Backendni doim ishlab turishini ta'minlash uchun **PM2** tavsiya etiladi:

```bash
npm install -g pm2
pm2 start src/index.js --name cs2-auction-backend
pm2 save
pm2 startup   # server qayta yuklanganda avtomatik ishga tushishi uchun
```

Nginx orqali `https://api.sizningdomeningiz.uz` manzilini backend portiga (`4000`) proksi qiling va SSL sertifikat (masalan Let's Encrypt / Certbot) o'rnating — Click.uz va Telegram faqat https manzillarga so'rov yubora oladi.

Namunaviy Nginx konfiguratsiyasi:

```nginx
server {
    listen 443 ssl;
    server_name api.sizningdomeningiz.uz;

    ssl_certificate     /etc/letsencrypt/live/api.sizningdomeningiz.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.sizningdomeningiz.uz/privkey.pem;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;   # Socket.io uchun zarur
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 4.2. Frontend (Mini App)

```bash
cd frontend
# .env faylida:
#   VITE_API_BASE_URL=https://api.sizningdomeningiz.uz

npm install
npm run build
```

`npm run build` natijasi `frontend/dist/` papkasida hosil bo'ladi — bu **statik fayllar** (HTML/CSS/JS), ularni istalgan statik hosting'ga joylashtirsa bo'ladi:

- **Nginx orqali** (`dist/` papkasini `/var/www/cs2-miniapp`ga nusxalab, serverni shu papkaga yo'naltiring)
- **Vercel / Netlify / Cloudflare Pages** — eng tez yo'l, `frontend/` papkasini shunchaki ulasangiz kifoya (build buyrug'i: `npm run build`, chiqish papkasi: `dist`)

Namunaviy Nginx konfiguratsiyasi (frontend uchun):

```nginx
server {
    listen 443 ssl;
    server_name app.sizningdomeningiz.uz;

    ssl_certificate     /etc/letsencrypt/live/app.sizningdomeningiz.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.sizningdomeningiz.uz/privkey.pem;

    root /var/www/cs2-miniapp;
    index index.html;
    location / {
        try_files $uri /index.html;
    }
}
```

Build tayyor bo'lgach, `backend/.env` ichidagi `MINI_APP_URL`ni shu production https manzilga (masalan `https://app.sizningdomeningiz.uz`) o'zgartirib, backendni qayta ishga tushiring.

### 4.3. Admin Mini App (production)

Xuddi 4.2-bo'lim kabi, faqat `admin-frontend/` papkasida va alohida (masalan `admin.sizningdomeningiz.uz`) subdomenga joylashtiring:

```bash
cd admin-frontend
# .env faylida: VITE_API_BASE_URL=https://api.sizningdomeningiz.uz
npm install
npm run build
```

Natijani (`admin-frontend/dist/`) alohida Nginx server blokiga (4.2-bo'limdagi namunaga o'xshash, faqat `admin.sizningdomeningiz.uz`) joylashtiring, so'ng `backend/.env`dagi `ADMIN_MINI_APP_URL`ni shu manzilga o'zgartirib, backendni qayta ishga tushiring. **Bu manzilni hech qachon `MINI_APP_URL` bilan bir xil qilmang** — ular ikki xil bot (foydalanuvchi/admin) uchun ikki xil ilova.

### 4.4. Telegram va Click.uz sozlamalarini yakunlash

1. **@BotFather**da har ikkala bot uchun `/setmenubutton` yoki `/newapp` orqali Mini App havolasini production https manzilga o'rnating.
2. **Click.uz merchant kabineti**da (my.click.uz) quyidagi ikkita webhook manzilini kiriting (rus tilidagi kabinetda nomlari boshqacha bo'lishi mumkin — moslamasi shunday):
   - **Адрес проверки** / Tasdiqlash (Prepare) manzili: `https://api.sizningdomeningiz.uz/api/payments/click/prepare`
   - **Адрес результата** / Natija (Complete) manzili: `https://api.sizningdomeningiz.uz/api/payments/click/complete`
   - Test paytida (ngrok) — 3.5-bo'limdagi ogohlantirishga qarang: bu manzillar ngrok tunnel qayta ishga tushirilganda eskiradi, har safar qayta yangilash kerak.
3. Click test to'lovlarini amalga oshirib, balans haqiqatan ham oshayotganini tekshiring — **bu qadamni albatta bajaring**, chunki imzo (sign_string) formulasi rasmiy hujjat asosida yozilgan bo'lsa-da, ishga tushirishdan oldin sinovdan o'tkazish shart. `payments.routes.js`dagi `/click/prepare` va `/click/complete` endpointlari endi Click'dan kelgan har bir so'rovni va imzo mos kelmasa aniq sababini backend konsoliga yozadi (`[click/prepare] ...`, `[click/complete] ...`) — to'lov muvaffaqiyatsiz bo'lsa, birinchi navbatda shu loglarga qarang.

## 5. Muhim biznes-qoidalar (qisqacha)

Bularning barchasi `backend/src/services/auctionService.js` ichida amalga oshirilgan — o'zgartirish kerak bo'lsa shu faylga qarang:

- Har bir taklif narxning **25%** i miqdorida zaklad sifatida hisobdan ushlab qolinadi (`.env`dagi `AUCTION_DEPOSIT_PERCENT` orqali sozlanadi).
- Bitta foydalanuvchi ketma-ket **10 martagacha** narx oshira oladi (`AUCTION_MAX_CONSECUTIVE_RAISES`).
- Auksion tugashiga **5 daqiqadan** kam qolganda yangi taklif kelsa, tugash vaqti yana **5 daqiqaga** suriladi (`AUCTION_EXTEND_THRESHOLD_MINUTES`, `AUCTION_EXTEND_BY_MINUTES`).
- **G'olib qolgan 75%ni `WINNER_PAYMENT_WINDOW_HOURS` (standart: 5) soat ichida to'lashi kerak.** Auksion tugagach darhol pul yechilmaydi — status `AWAITING_PAYMENT`ga o'tadi, foydalanuvchi Mini App > Profil'dan (yoki auksion sahifasidan) "To'lovni yakunlash"ni bosadi. Muddat o'tsa, zakladning `DEPOSIT_REFUND_ON_EXPIRY_PERCENT`i (standart: 50%) qaytariladi, qolgani jarima sifatida ushlab qolinadi, auksion `PAYMENT_EXPIRED` holatiga o'tadi.
- To'liq to'langan (`PAID`) auksionni admin Trade URL orqali qo'lda Steamda yuborib, keyin Admin Mini App'dan "yuborildi" deb belgilaydi (`DELIVERED`) — **Steam bilan avtomatik integratsiya yo'q**, 8-bo'limga qarang.
- **Administratorlar auksionda taklif bera olmaydi** — bu tekshiruv `auctionService.js`da qattiq kodlangan (rolga qarab rad etiladi), admin botida va Admin Mini App'da esa bunday tugma umuman yaratilmagan.

## 6. Muammolarni bartaraf etish

| Muammo | Yechim |
|---|---|
| `USER_BOT_TOKEN sozlanmagan` ogohlantirishi | `.env`ga to'g'ri bot tokenini kiriting va backendni qayta ishga tushiring |
| Mini App Telegram'da ochilmayapti | Manzil https bo'lishi shart; `MINI_APP_URL`/`ADMIN_MINI_APP_URL` to'g'riligini va domenning haqiqatan ham ochiq ekanini tekshiring |
| Mini App "Kirishda xatolik" beryapti | Deyarli har doim CORS: `backend/.env`dagi `FRONTEND_URL` aynan frontend qaysi manzildan ochilayotgani bilan bir xil emas (3.5-bo'limga qarang) |
| Click to'lovdan keyin balans oshmayapti | (1) Merchant kabinetdagi Prepare/Complete manzillari joriy (eskirmagan) tunnelga ishora qilayaptimi tekshiring; (2) backend konsolidagi `[click/prepare]`/`[click/complete]` loglariga qarang — Click nima yuborayotgani va nega rad etilayotgani shu yerda ko'rinadi |
| `prisma migrate`/`db push` xato beryapti | `DATABASE_URL` to'g'riligini va MySQL/MariaDB (yoki PostgreSQL) serveri ishlab turganini tekshiring |
| Ikki foydalanuvchi bir vaqtda narx oshirganda xato | Bu kutilgan holat emas — `auctionService.js`dagi optimistik lokировка avtomatik qayta uriniladi; agar doimiy takrorlansa, loglarni tekshiring |
| Schema.prisma'ni o'zgartirdim, lekin baza eskicha | Har safar `schema.prisma` o'zgarganda `npx prisma db push` (tez, test uchun) yoki `npx prisma migrate dev` (tarixni saqlaydi) qayta ishga tushiring |

## 7. Keyingi qadamlar (loyihada hali to'liq ishlanmagan joylar)

Ushbu kod bazasi ishlaydigan **MVP skeleti** sifatida tayyorlangan va texnik topshiriqdagi barcha asosiy oqimlarni qamrab oladi, lekin production'ga chiqarishdan oldin quyidagilarga alohida e'tibor bering:

- Click.uz `sign_string` formulasini merchant kabinetingizdagi real test to'lovlar bilan tasdiqlang (yuqoriga qarang).
- **Steam orqali yetkazib berish hozircha AVTOMATIK EMAS — qo'lda.** To'liq to'langan auksionni admin o'zi Steam'da (o'z bot-akkaunti orqali, g'olibning Trade URL'idan foydalanib) yuboradi, so'ng Admin Mini App'da "yuborildi" tugmasini bosadi. To'liq avtomatlashtirish uchun kerak bo'ladigan narsalar: (1) skinlarni saqlaydigan alohida Steam bot-akkaunt, (2) shu akkauntning Steam Web API kaliti, (3) Mobile Authenticator'ning "shared secret"i (avto-tasdiqlash uchun), (4) `steam-user` + `steam-tradeoffer-manager` (Node.js) kabi kutubxonalar. Bundan tashqari, agar g'olibning Steam akkaunti Mobile Authenticator'ni kamida 7 kundan beri yoqmagan bo'lsa, Steam savdoni 15 kungacha "escrow" holatida ushlab turishi mumkin — bu "darhol yetkazish"ni kafolatlab bo'lmasligini anglatadi.
- Yuklama testlari (bir nechta foydalanuvchi bitta auksionga bir vaqtda "hujum" qilganda tizim to'g'ri ishlashini load-test qiling).
- Rasm yuklash — hozir admin bot Telegram'ning o'z fayl havolasidan yoki to'g'ridan-to'g'ri URL'dan foydalanadi (vaqtinchalik); production uchun S3/Cloudflare R2 kabi doimiy fayl xranilishchisi ulash tavsiya etiladi.
- Auksion bekor qilinganda barcha aktiv zakladlarni avtomatik qaytarish (`admin.routes.js`dagi TODO'ga qarang).
- Frontend uchun xatoliklarni ushlash (error boundary) va offline holat ko'rsatkichi.
- Rate limiting (masalan `express-rate-limit`) — ayniqsa `/bid`, `/complete-payment` va `/auth/telegram*` endpointlari uchun.
