import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buildSignature } from "@/lib/protocol";

export const dynamic = "force-dynamic";

async function addContribution(formData: FormData) {
  "use server";
  const cycleId = formData.get("cycleId") as string;
  const authorGardienId = formData.get("authorGardienId") as string;
  const content = formData.get("content") as string;
  if (!cycleId || !authorGardienId || !content) return;

  const author = await prisma.user.findUnique({ where: { gardienId: authorGardienId } });
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
  const currentIndex = order.indexOf(cycle.currentTurn);
  const nextTurn =
    currentIndex >= 0 && currentIndex < order.length - 1
      ? order[currentIndex + 1]
      : cycle.currentTurn;

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
  if (!cycleId || !["cloture", "interrompu", "en_cours"].includes(newStatus)) return;

  await prisma.cycle.update({
    where: { id: cycleId },
    data: { status: newStatus },
  });
  redirect(`/cycles/${cycleId}`);
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

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link href="/cycles" className="text-sm text-slate-500 hover:text-slate-800">
            ← Retour aux cycles
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{cycle.subject}</h1>
              <div className="flex gap-4 text-sm text-slate-600 mb-3">
                <span>Statut : <strong>{cycle.status}</strong></span>
                <span>Tour actuel : <strong>{cycle.currentTurn}</strong></span>
              </div>

              {/* Ordre des tours */}
              <div className="flex flex-wrap gap-2 mt-2">
                {order.map((gardienId, index) => {
                  const isCurrent = gardienId === cycle.currentTurn;
                  const isPast = order.indexOf(cycle.currentTurn) > index;
                  return (
                    <span
                      key={gardienId}
                      className={
                        isCurrent
                          ? "text-xs px-2.5 py-1 rounded-full bg-slate-900 text-white font-medium"
                          : isPast
                          ? "text-xs px-2.5 py-1 rounded-full bg-slate-200 text-slate-500"
                          : "text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700"
                      }
                    >
                      {index + 1}. {gardienId}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              {cycle.status === "en_cours" ? (
                <>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="interrompu" />
                    <button type="submit" className="text-sm px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50">
                      Interrompre
                    </button>
                  </form>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="cloture" />
                    <button type="submit" className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                      Clôturer
                    </button>
                  </form>
                </>
              ) : (
                <form action={updateCycleStatus}>
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <input type="hidden" name="status" value="en_cours" />
                  <button type="submit" className="text-sm px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50">
                    Reprendre
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          {cycle.contributions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-500">
              Aucune contribution pour le moment.
            </div>
          ) : (
            cycle.contributions.map((c) => (
              <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-slate-900">
                    Tour {c.turnNumber} — {c.author.name} ({c.author.gardienId})
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(c.createdAt).toLocaleString("fr-FR")}
                  </span>
                </div>
                <div className="text-slate-700 whitespace-pre-wrap mb-4">{c.content}</div>
                <pre className="text-xs text-slate-500 bg-slate-50 p-3 rounded overflow-x-auto">
                  {c.signature}
                </pre>
              </div>
            ))
          )}
        </div>

        {cycle.status === "en_cours" ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Nouvelle contribution</h2>
            <form action={addContribution} className="space-y-4">
              <input type="hidden" name="cycleId" value={cycle.id} />
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">Auteur</label>
                <select
                  name="authorGardienId"
                  required
                  defaultValue={cycle.currentTurn}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.gardienId}>
                      {u.name} ({u.gardienId})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-1">Contenu</label>
                <textarea
                  name="content"
                  required
                  rows={6}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
                  placeholder="Écris ta contribution ici..."
                />
              </div>
              <p className="text-xs text-slate-600">
                La signature sera générée automatiquement.
              </p>
              <button type="submit" className="w-full bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800">
                Publier la contribution
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl border border-slate-200 p-6 text-center text-slate-700">
            Ce cycle est <strong>{cycle.status}</strong>. Aucune nouvelle contribution possible.
          </div>
        )}
      </div>
    </main>
  );
}