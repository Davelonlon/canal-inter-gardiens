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
  let nextTurn = cycle.currentTurn;

  if (authorGardienId === "G-00") {
    nextTurn = order[0] || "G-00";
  } else {
    const currentIndex = order.indexOf(cycle.currentTurn);
    if (currentIndex >= 0 && currentIndex < order.length - 1) {
      nextTurn = order[currentIndex + 1];
    } else {
      nextTurn = "G-00";
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
  if (!cycleId || !["cloture", "interrompu", "en_cours", "archive"].includes(newStatus)) return;

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
          <Link href="/cycles" className="text-sm text-slate-500 hover:text-slate-800">
            ← Retour aux cycles
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold text-slate-900 mb-2">{cycle.subject}</h1>

              <div className="flex flex-wrap gap-3 text-sm text-slate-600 mb-3">
                <span>Statut : <strong>{cycle.status}</strong></span>
                <span>Tour actuel : <strong>{cycle.currentTurn}</strong></span>
              </div>

              <div className="mb-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-xs font-medium text-slate-500 mb-1">ID du cycle</div>
                <code className="text-sm text-slate-900 break-all">{cycle.id}</code>
                <div className="text-xs text-slate-500 mt-2">API JSON</div>
                <code className="text-xs text-slate-700 break-all">{apiUrl}</code>
              </div>

              <div className="flex flex-wrap gap-2 mt-2">
                {order.map((gardienId, index) => {
                  const isCurrent = gardienId === cycle.currentTurn;
                  const currentIndex = order.indexOf(cycle.currentTurn);
                  const isPast = currentIndex > index;
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
                {cycle.currentTurn === "G-00" && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-green-700 text-white font-medium">
                    G-00 (avis de sortie)
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              {cycle.status === "en_cours" ? (
                <>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="interrompu" />
                    <button type="submit" className="w-full text-sm px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50">
                      Interrompre
                    </button>
                  </form>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="cloture" />
                    <button type="submit" className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50">
                      Clôturer
                    </button>
                  </form>
                </>
              ) : cycle.status === "archive" ? (
                <form action={updateCycleStatus}>
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <input type="hidden" name="status" value="en_cours" />
                  <button type="submit" className="w-full text-sm px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50">
                    Désarchiver
                  </button>
                </form>
              ) : (
                <>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="en_cours" />
                    <button type="submit" className="w-full text-sm px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50">
                      Reprendre
                    </button>
                  </form>
                  <form action={updateCycleStatus}>
                    <input type="hidden" name="cycleId" value={cycle.id} />
                    <input type="hidden" name="status" value="archive" />
                    <button type="submit" className="w-full text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">
                      Archiver
                    </button>
                  </form>
                </>
              )}

              {cycle.status !== "en_cours" && (
                <form action={deleteCycle}>
                  <input type="hidden" name="cycleId" value={cycle.id} />
                  <button
                    type="submit"
                    className="w-full text-sm px-3 py-1.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Supprimer
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
                  placeholder={
                    cycle.currentTurn === "G-00"
                      ? "Avis de sortie / arbitrage G-00..."
                      : "Écris ta contribution ici..."
                  }
                />
              </div>
              <p className="text-xs text-slate-600">
                La signature sera générée automatiquement.
                {cycle.currentTurn === "G-00" && " — Après publication, tu peux clôturer le cycle."}
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