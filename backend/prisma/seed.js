// Boshlang'ich ma'lumotlar: eng ko'p ishlatiladigan qurol kategoriyalari.
// Ishga tushirish: npm run seed (backend papkasida)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CATEGORIES = [
  'AK-47', 'M4A4', 'M4A1-S', 'AWP', 'Desert Eagle', 'USP-S', 'Glock-18',
  'Karambit', 'Butterfly Knife', 'Gloves',
];

async function main() {
  for (const name of CATEGORIES) {
    const slug = name.toLowerCase().replace(/\s+/g, '-');
    await prisma.weaponCategory.upsert({
      where: { name },
      update: {},
      create: { name, slug },
    });
  }
  console.log(`✅ ${CATEGORIES.length} ta kategoriya tayyorlandi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
