import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buildSignature, toAoaId, toAoaLabel } from "@/lib/protocol";

export const dynamic = "force-dynamic";

async function addContribution(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  const authorGardienId = formData.get("authorGardienId") as string;
  const content = formData.get("content") as string;
  if (!cycleId || !authorGardienId || !content) return;

  const author = await prisma.user.findUnique({
    where: { gardienId: authorGardienId },
  });
  if (!author) return;

  const cycle = await prisma.cycle.findUnique({ where: { id: cycleId } });
  if (!cycle || cycle.status !== "en_cours") return;

  const count = await prisma.contribution.count({ where: { cycleId } });
  const signature = buildSignature({
    name: author.name,
    gardienId: author.gardienId,
    role: author.role,
  });

  await prisma.contribution.create({
    data: {
      cycleId,
      authorId: author.id,
      content,
      signature,
      turnNumber: count + 1,
    },
  });

  const order: string[] = JSON.parse(cycle.order);
  let nextTurn = cycle.currentTurn;

  if (authorGardienId === "G-00") {
    const hoaIndex = order.indexOf("G-00");
    if (hoaIndex >= 0 && hoaIndex < order.length - 1) {
      nextTurn = order[hoaIndex + 1];
    } else {
      nextTurn = "G-00";
    }
  } else {
    const authorIndex = order.indexOf(authorGardienId);
    if (authorIndex >= 0 && authorIndex < order.length - 1) {
      nextTurn = order[authorIndex + 1];
    } else if (authorIndex === order.length - 1) {
      nextTurn = "G-00";
    } else {
      const currentIndex = order.indexOf(cycle.currentTurn);
      if (currentIndex >= 0 && currentIndex < order.length - 1) {
        nextTurn = order[currentIndex + 1];
      } else {
        nextTurn = "G-00";
      }
    }
  }

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { currentTurn: nextTurn },
  });

  redirect(`/cycles/${cycleId}`);
}

async function updateCycleStatus(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  const newStatus = formData.get("status") as string;
  if (
    !cycleId ||
    !["cloture", "interrompu", "en_cours", "archive"].includes(newStatus)
  )
    return;

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { status: newStatus },
  });
  redirect(`/cycles/${cycleId}`);
}

async function deleteCycle(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  if (!cycleId) return;

  await prisma.contribution.deleteMany({ where: { cycleId } });
  await prisma.cycle.delete({ where: { id: cycleId } });
  redirect("/cycles");
}

export default async function CyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      contributions: {
        orderBy: { turnNumber: "asc" },
        include: { author: true },
      },
    },
  });
  if (!cycle) notFound();

  const users = await prisma.user.findMany({
    where: { isActive: true },
    orderBy: { gardienId: "asc" },
  });

  const order: string[] = JSON.parse(cycle.order);
  const apiUrl = `https://canal-inter-gardiens-2dhi.vercel.app/api/cycles/${cycle.id}`;

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            href="/cycles"
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            ← Retour aux cycles
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                {cycle.subject}
              </h1>

              <div className="flex flex-wrap gap-3 text-sm text-slate-600 mb-3">
                <span>
                  Statut : <strong>{cycle.status}</strong>
                </span>
                <span>
                  Tour actuel :{" "}
                  <strong>{toAoaId(cycle.currentTurn)}</strong>
                  <span className="text-slate-400 text-xs ml-1">
                    ({cycle.currentTurn})
                  </span>
                </span>
              </div>

              <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs font-medium text-slate-500 mb-1">
                  ID du cycle
                </div>
                <code className="text-sm text-slate-900 break-all">
                  {cycle.id}
                </code>
                <div className="text-xs text-slate-500 mt-2">API JSON</div>
                <code className="text-xs text-slate-700 break-all">
                  {apiUrl}
                </code>
              </div>

              <div class