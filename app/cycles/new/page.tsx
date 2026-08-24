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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function createCycle(formData: FormData) {
  "use server";

  const subject = (formData.get("subject") as string)?.trim();
  const type = (formData.get("type") as string) || "deliberation";
  const facilitatorId = (formData.get("facilitatorId") as string) || "";
  const selected = formData.getAll("gardien") as string[];

  if (!subject || selected.length === 0) return;
  if (type !== "deliberation" && type !== "chat") return;

  let orderArray = GARDIENS.map((g) => g.id).filter((id) =>
    selected.includes(id)
  );
  if (orderArray.length === 0) return;

  if (type === "deliberation") {
    orderArray = shuffle(orderArray);
  }

  const fac =
    facilitatorId && orderArray.includes(facilitatorId)
      ? facilitatorId
      : orderArray.find((id) => id !== "G-00") || orderArray[0];

  const cycle = await prisma.cycle.create({
    data: {
      subject,
      createdBy: "G-00",
      order: JSON.stringify(orderArray),
      currentTurn: orderArray[0],
      status: "en_cours",
      type,
      phase: "depot",
      facilitatorId: fac,
      turnRound: 1,
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
        <p className="text-slate-600 mb-8">Module A (délibération) ou B (chat)</p>

        <form
          action={createCycle}
          className="bg-white rounded-xl border border-slate-200 p-6 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Sujet
            </label>
            <input
              type="text"
              name="subject"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
            />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Module</p>
            <label className="flex items-center gap-2 mb-2">
              <input type="radio" name="type" value="deliberation" defaultChecked />
              <span className="text-sm text-slate-900">
                A — Délibération (aveugle, synthèse, arbitrage)
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="type" value="chat" />
              <span className="text-sm text-slate-900">
                B — Chat (visible, but au départ)
              </span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Facilitateur (synthèse Module A)
            </label>
            <select
              name="facilitatorId"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-900 bg-white"
              defaultValue="G-02"
            >
              {GARDIENS.filter((g) => g.id !== "G-00").map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-sm font-medium text-slate-700 mb-2">Participants</p>
            <div className="space-y-2">
              {GARDIENS.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200"
                >
                  <input
                    type="checkbox"
                    name="gardien"
                    value={g.id}
                    defaultChecked={["G-01", "G-02", "G-05"].includes(g.id)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-slate-900">{g.label}</span>
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