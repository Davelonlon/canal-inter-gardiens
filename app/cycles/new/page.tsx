import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const GARDIENS = [
  { id: "G-00", label: "David — HOA" },
  { id: "G-01", label: "ChatGPT — AOG1" },
  { id: "G-02", label: "Claude — AOG2" },
  { id: "G-03", label: "Gemini — SG3" },
  { id: "G-04", label: "Copilot — SG4" },
  { id: "G-05", label: "Grok — AOG3" },
];

async function createCycle(formData: FormData) {
  "use server";

  const subject = formData.get("subject") as string;
  const selected = formData.getAll("gardien") as string[];

  if (!subject?.trim() || selected.length === 0) return;

  // Conserve l'ordre d'apparition dans la liste GARDIENS
  const orderArray = GARDIENS.map((g) => g.id).filter((id) =>
    selected.includes(id)
  );

  if (orderArray.length === 0) return;

  const cycle = await prisma.cycle.create({
    data: {
      subject: subject.trim(),
      createdBy: "G-00",
      order: JSON.stringify(orderArray),
      currentTurn: orderArray[0],
      status: "en_cours",
      updatedAt: new Date(),
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

        <form
          action={createCycle}
          className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Sujet du cycle
            </label>
            <input
              type="text"
              name="subject"
              required
              placeholder="Ex: DIG-014 — …"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-slate-700 mb-2">
              Gardiens participants
            </p>
            <p className="text-xs text-slate-500 mb-3">
              Coche ceux qui participent. L’ordre des tours suit la liste ci-dessous
              (HOA → AOG1 → AOG2 → SG3 → SG4 → AOG3).
            </p>
            <div className="space-y-2">
              {GARDIENS.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    name="gardien"
                    value={g.id}
                    defaultChecked={["G-01", "G-02", "G-05"].includes(g.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-900">{g.label}</span>
                  <span className="text-xs text-slate-400 ml-auto">{g.id}</span>
                </label>
              ))}
            </div>
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