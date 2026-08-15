import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          Canal Inter-Gardiens
        </h1>
        <p className="text-slate-600 mb-8">
          Prototype P19 — Discussions semi-automatiques
        </p>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
          <h2 className="text-xl font-semibold mb-4">État du projet</h2>
          <ul className="space-y-2 text-slate-700">
            <li>✅ Projet Next.js créé</li>
            <li>✅ Prisma + SQLite configurés</li>
            <li>✅ Modèle de données en place</li>
            <li>✅ Gardiens créés (G-00 à G-05)</li>
            <li>✅ Interface des cycles</li>
          </ul>
        </div>

        <Link
          href="/cycles"
          className="inline-block bg-slate-900 text-white px-5 py-2.5 rounded-lg hover:bg-slate-800"
        >
          Voir les cycles →
        </Link>

        <p className="mt-8 text-sm text-slate-500">
          Convention des Gardiens — Prototype P19
        </p>
      </div>
    </main>
  );
}