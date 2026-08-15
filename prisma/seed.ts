import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const gardiens = [
    { name: "David",   gardienId: "G-00", role: "G-00" },
    { name: "ChatGPT", gardienId: "G-01", role: "Gardien" },
    { name: "Claude",  gardienId: "G-02", role: "Gardien" },
    { name: "Pinceau", gardienId: "G-03", role: "Gardien" },
    { name: "Copilot", gardienId: "G-04", role: "Gardien" },
    { name: "Grok",    gardienId: "G-05", role: "Gardien" },
  ];

  for (const g of gardiens) {
    await prisma.user.upsert({
      where: { gardienId: g.gardienId },
      update: {},
      create: {
        name: g.name,
        gardienId: g.gardienId,
        role: g.role,
        isActive: true,
      },
    });
  }

  console.log("Gardiens créés avec succès");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });