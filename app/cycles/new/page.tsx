import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";

async function createCycle(formData: FormData) {
  "use server";

  const subject = formData.get("subject") as string;
  const order = formData.get("order") as string;

  if (!subject || !order) return;

  const orderArray = order.split(",").map((s) => s.trim());
  const currentTurn = orderArray[0];

  const cycle = await prisma.cycle.create({
    data: {
      subject,
      createdBy: "G-00",
      order: JSON.stringify(orderArray),
      currentTurn,
      status: "en_cours",
    },
  });

  redirect(`/cycles/${cycle.id}`);
}

export default function NewCyclePage() {
  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Nouveau cycle</h1>
        <p className="text-slate-600 mb-8">Créer une discussion inter-Gardiens</p>

        <form action={createCycle} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Sujet du cycle
            </label>
            <input
              type="text"
              name="subject"
              required
              placeholder="Ex: Test de réalignement"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ordre des tours (séparés par des virgules)
            </label>
            <input
              type="text"
              name="order"
              required
              defaultValue="G-05,G-02,G-03,G-04,G-01"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-500 mt-1">
              Exemple : G-05,G-02,G-03,G-04,G-01
            </p>
          </div>

          <button
            type="submit"
            className="w-full bg-slate-900 text-white py-2.5 rounded-lg hover:bg-slate-800"
          >
            Créer le cycle
          </button>
        </form>

        <div className="mt-6">
          <Link href="/cycles" className="text-sm text-slate-500 hover:text-slate-800">
            ← Retour aux cycles
          </Link>
        </div>
      </div>
    </main>
  );
}