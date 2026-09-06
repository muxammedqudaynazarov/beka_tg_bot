// Boshlang'ich ma'lumotlar: kategoriyalar va ularning sub-kategoriyalari.
// Ishga tushirish: npm run seed (backend papkasida)
//
// MUHIM: bu yerdagi sub-kategoriyalar (ayniqsa Брелки, Агенты, Стикеры,
// Кейсы и Капсулы, Ключи, Наборы музыки, Значки, Нашивки, Граффити ichidagilar)
// FAQAT boshlang'ich namuna sifatida berilgan — CS2'ning haqiqiy to'liq
// ro'yxati doimiy yangilanib turadi (yangi keyslar, agentlar va h.k.), shuning
// uchun bularni Admin Mini App > Kategoriyalar bo'limidan o'zingiz to'liq
// ro'yxatga moslashtirishingiz kerak bo'ladi. Qurol turlari (Ножи, Винтовки,
// Пистолеты, ПП, Тяжелое, Перчатки) esa o'yinning barqaror qismi bo'lgani
// uchun to'liqroq berilgan.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TREE = [
  {
    name: 'Ножи', subcats: [
      'Karambit', 'Butterfly Knife', 'Bayonet', 'M9 Bayonet', 'Flip Knife',
      'Gut Knife', 'Huntsman Knife', 'Falchion Knife', 'Bowie Knife',
      'Ursus Knife', 'Navaja Knife', 'Stiletto Knife', 'Talon Knife',
      'Skeleton Knife', 'Nomad Knife', 'Survival Knife', 'Paracord Knife',
      'Classic Knife', 'Kukri Knife', 'Shadow Daggers',
    ],
  },
  {
    name: 'Перчатки', subcats: [
      'Sport Gloves', 'Specialist Gloves', 'Driver Gloves', 'Hand Wraps',
      'Moto Gloves', 'Hydra Gloves', 'Broken Fang Gloves', 'Bloodhound Gloves',
    ],
  },
  {
    name: 'Пистолеты', subcats: [
      'Glock-18', 'USP-S', 'P2000', 'P250', 'Five-SeveN', 'Tec-9',
      'CZ75-Auto', 'Dual Berettas', 'Desert Eagle', 'R8 Revolver',
    ],
  },
  {
    name: 'Винтовки', subcats: [
      'AK-47', 'M4A4', 'M4A1-S', 'AWP', 'SSG 08', 'SG 553', 'AUG',
      'Galil AR', 'FAMAS', 'SCAR-20', 'G3SG1',
    ],
  },
  {
    name: 'ПП', subcats: [
      'MP9', 'MAC-10', 'MP7', 'UMP-45', 'P90', 'PP-Bizon', 'MP5-SD',
    ],
  },
  {
    name: 'Тяжелое', subcats: [
      'Nova', 'XM1014', 'Sawed-Off', 'MAG-7', 'M249', 'Negev',
    ],
  },
  {
    name: 'Брелки', subcats: [
      'Стандартные брелки', 'Коллекционные брелки',
    ],
  },
  {
    name: 'Агенты', subcats: [
      'Elite Crew', 'Phoenix', 'Sabre', 'FBI', 'SAS', 'GIGN',
      'SEAL Frogman', 'Guerrilla Warfare',
    ],
  },
  {
    name: 'Стикеры', subcats: [
      'Autograph', 'Holo', 'Foil', 'Gold', 'Tournament',
    ],
  },
  {
    name: 'Кейсы и Капсулы', subcats: [
      'Оружейные кейсы', 'Капсулы наклеек', 'Сувенирные капсулы',
    ],
  },
  {
    name: 'Ключи', subcats: [
      'Ключи от кейсов',
    ],
  },
  {
    name: 'Наборы музыки', subcats: [
      'Стандартные наборы', 'Коллекционные наборы',
    ],
  },
  {
    name: 'Значки', subcats: [
      'Командные значки', 'Турнирные значки',
    ],
  },
  {
    name: 'Нашивки', subcats: [
      'Командные нашивки', 'Коллекционные нашивки',
    ],
  },
  {
    name: 'Граффити', subcats: [
      'Стандартные граффити', 'Коллекционные граффити',
    ],
  },
];

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  let categoryCount = 0;
  let subcategoryCount = 0;

  for (let i = 0; i < TREE.length; i++) {
    const { name, subcats } = TREE[i];
    const slug = slugify(name);
    const category = await prisma.weaponCategory.upsert({
      where: { name },
      update: { sortOrder: i },
      create: { name, slug, sortOrder: i },
    });
    categoryCount++;

    for (const subName of subcats) {
      await prisma.weaponSubcategory.upsert({
        where: { categoryId_name: { categoryId: category.id, name: subName } },
        update: {},
        create: { categoryId: category.id, name: subName, slug: slugify(subName) },
      });
      subcategoryCount++;
    }
  }

  console.log(`✅ ${categoryCount} ta kategoriya va ${subcategoryCount} ta sub-kategoriya tayyorlandi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
