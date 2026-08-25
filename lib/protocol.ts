// ============================================================
// BLOC 1 — TYPE COMMUN
// ============================================================
export type GardienInfo = {
  name: string;
  gardienId: string;
  role: string;
};

// ============================================================
// BLOC 2 — TABLES DE CORRESPONDANCE G-XX → AOA
// ============================================================
const AOA_IDS: Record<string, string> = {
  "G-00": "HOA",
  "G-01": "AOG1",
  "G-02": "AOG2",
  "G-03": "SG3",
  "G-04": "SG4",
  "G-05": "AOG3",
};

const AOA_ROLES: Record<string, string> = {
  "G-00": "Human Operational Authority",
  "G-01": "Autonomous Operational Guardian",
  "G-02": "Autonomous Operational Guardian",
  "G-03": "Stargate Guardian",
  "G-04": "Stargate Guardian",
  "G-05": "Autonomous Operational Guardian",
};

const AOA_NAMES: Record<string, string> = {
  "G-00": "David",
  "G-01": "ChatGPT",
  "G-02": "Claude",
  "G-03": "Gemini",
  "G-04": "Copilot",
  "G-05": "Grok",
};

// ============================================================
// BLOC 3 — AFFICHAGE (libellés UI)
// ============================================================
/** Ex. G-05 → "AOG3" */
export function toAoaId(gardienId: string): string {
  return AOA_IDS[gardienId] ?? gardienId;
}

/** Ex. G-05 → "Grok — AOG3" */
export function toAoaLabel(gardienId: string): string {
  const id = toAoaId(gardienId);
  const name = AOA_NAMES[gardienId];
  return name ? `${name} — ${id}` : id;
}

// ============================================================
// BLOC 4 — AIDE INTERNE (pas exportée)
// ============================================================
function resolveIdentity(gardien: GardienInfo): {
  displayId: string;
  displayRole: string;
} {
  return {
    displayId: AOA_IDS[gardien.gardienId] ?? gardien.gardienId,
    displayRole: AOA_ROLES[gardien.gardienId] ?? gardien.role,
  };
}

// ============================================================
// BLOC 5 — SIGNATURE COMPLÈTE (Module A — délibération)
// ============================================================
export function buildSignature(
  gardien: GardienInfo,
  nature: string = "contribution"
): string {
  const { displayId, displayRole } = resolveIdentity(gardien);

  return `— Convention des Gardiens —
Gardien : ${gardien.name}
Identifiant : ${displayId}
Rôle : ${displayRole}
Nature : ${nature}
Sources consultées : Canal Inter-Gardiens / corpus AOA
Niveau de confiance : élevé
Signature : ${gardien.name} — ${displayId}`;
}

// ============================================================
// BLOC 6 — SIGNATURE COURTE (Module B — chat)
// ============================================================
export function buildSignatureMinimal(gardien: GardienInfo): string {
  const displayId = toAoaId(gardien.gardienId);
  return `— ${gardien.name} — ${displayId}`;
}

// ============================================================
// BLOC 7 — TOUR SUIVANT DANS L’ORDRE
// ============================================================
export function getNextTurn(
  order: string[],
  currentTurn: string
): string | null {
  const index = order.indexOf(currentTurn);
  if (index === -1 || index === order.length - 1) return null;
  return order[index + 1];
}