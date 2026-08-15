import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CyclesPage() {
  const cycles = await prisma.cycle.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Cycles</h1>
            <p className="text-slate-600">Discussions inter-Gardiens</p>
          </div>
          <Link
            href="/cycles/new"
            className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800"
          >
            Nouveau cycle
          </Link>
        </div>

        {cycles.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            Aucun cycle pour le moment.
          </div>
        ) : (
          <div className="space-y-3">
            {cycles.map((cycle) => (
              <Link
                key={cycle.id}
                href={`/cycles/${cycle.id}`}
                className="block bg-white rounded-xl border border-slate-200 p-5 hover:border-slate-400 transition"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-slate-900">{cycle.subject}</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Tour actuel : {cycle.currentTurn} · Statut : {cycle.status}
                    </p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                    {cycle.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← Retour à l’accueil
          </Link>
        </div>
      </div>
    </main>
  );
}