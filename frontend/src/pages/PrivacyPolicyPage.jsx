import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

function P({ children }) {
  return <p className="mb-3 text-[13px] leading-relaxed text-ink-secondary">{children}</p>;
}
function H({ children }) {
  return <h2 className="mb-2 mt-5 font-display text-sm font-bold text-ink-primary">{children}</h2>;
}

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-base-border bg-base-bg/95 px-4 py-3.5 backdrop-blur">
        <button onClick={() => navigate(-1)} className="text-ink-secondary">
          <ChevronLeft size={20} />
        </button>
        <h1 className="font-display text-base font-bold text-ink-primary">Maxfiylik siyosati</h1>
      </header>

      <main className="px-4 pt-4">
        <P>
          Ushbu hujjat CS2 Skinlar Auksion Telegram Mini App ("tizim") foydalanuvchilarining shaxsiy ma'lumotlari
          qanday yig'ilishi, saqlanishi va ishlatilishini tushuntiradi. Tizimdan foydalanish orqali siz shu
          shartlarga rozilik bildirasiz.
        </P>

        <H>1. Qanday ma'lumotlar yig'iladi</H>
        <P>
          Tizimga Telegram orqali kirganingizda, Telegram tomonidan taqdim etiladigan quyidagi ma'lumotlar
          olinadi: Telegram ID raqamingiz, foydalanuvchi nomi (@username), ism va familiya (agar Telegram
          profilingizda ko'rsatilgan bo'lsa). Tizim sizning Telegram parolingiz yoki telefon raqamingizga
          kirish huquqiga ega emas.
        </P>
        <P>
          Siz o'zingiz kiritgan qo'shimcha ma'lumotlar: Steam Trade URL (g'olib bo'lgan skinlarni yuborish
          uchun), auksionlardagi takliflaringiz tarixi, hisobingizni to'ldirish va xarid tranzaksiyalari.
        </P>

        <H>2. To'lovlar</H>
        <P>
          Hisobni to'ldirish Click.uz to'lov tizimi orqali amalga oshiriladi. Tizim sizning bank kartangiz
          raqami yoki boshqa maxfiy to'lov ma'lumotlaringizni saqlamaydi va ularga kirish huquqiga ega emas —
          bu ma'lumotlar to'liq Click.uz tomonidan, ularning o'z xavfsizlik siyosatiga muvofiq qayta ishlanadi.
          Tizim faqat to'lov summasi va holatini (muvaffaqiyatli/muvaffaqiyatsiz) saqlaydi.
        </P>

        <H>3. Ma'lumotlar qanday ishlatiladi</H>
        <P>
          Yig'ilgan ma'lumotlar quyidagi maqsadlarda ishlatiladi: hisobingizni yuritish va auksionlarda
          qatnashish imkonini berish, balansingizni to'g'ri hisoblash, g'olib bo'lgan taqdirda skinni Steam
          orqali yuborish, reyting va skidkalarni hisoblash, tizim xavfsizligini ta'minlash (masalan, soxta
          yoki qoidabuzar hisoblarni aniqlash).
        </P>

        <H>4. Ma'lumotlar kimlarga oshkor qilinadi</H>
        <P>
          Sizning shaxsiy ma'lumotlaringiz uchinchi shaxslarga sotilmaydi. Ular faqat: (a) to'lovni amalga
          oshirish uchun Click.uz to'lov tizimiga (zarur hajmda), (b) qonun talab qilgan hollarda vakolatli
          davlat organlariga taqdim etilishi mumkin.
        </P>

        <H>5. Ma'lumotlarni saqlash muddati</H>
        <P>
          Ma'lumotlar hisobingiz faol bo'lgan davrda saqlanadi. Tranzaksiyalar tarixi moliyaviy shaffoflik va
          nizolarni hal qilish maqsadida uzoqroq muddat saqlanishi mumkin.
        </P>

        <H>6. Sizning huquqlaringiz</H>
        <P>
          Siz istalgan vaqtda Profil bo'limidan Trade URL kabi ma'lumotlaringizni o'zgartirishingiz yoki
          o'chirishingiz mumkin. Hisobingizni butunlay o'chirishni so'rash uchun "Yordam" bo'limi orqali
          administratsiyaga murojaat qiling.
        </P>

        <H>7. Bog'lanish</H>
        <P>
          Maxfiylik siyosatiga oid savollar bo'yicha "Profil" bo'limidagi "Yordam" tugmasi orqali biz bilan
          bog'lanishingiz mumkin.
        </P>
      </main>
    </div>
  );
}
