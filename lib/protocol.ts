export type GardienInfo = {
  name: string;
  gardienId: string;
  role: string;
};

/** G-XX technique (app) → identifiant AOA (signature) */
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

function resolveIdentity(gardien: GardienInfo): {
  displayId: string;
  displayRole: string;
} {
  return {
    displayId: AOA_IDS[gardien.gardienId] ?? gardien.gardienId,
    displayRole: AOA_ROLES[gardien.gardienId] ?? gardien.role,
  };
}

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

export function getNextTurn(order: string[], currentTurn: string): string | null {
  const index = order.indexOf(currentTurn);
  if (index === -1 || index === order.length - 1) return null;
  return order[index + 1];
}