export type GardienInfo = {
  name: string;
  gardienId: string;
  role: string;
};

export function buildSignature(gardien: GardienInfo, nature: string = "contribution"): string {
  const date = new Date().toLocaleDateString("fr-FR");

  return `— Convention des Gardiens —
Gardien : ${gardien.name}
Identifiant : ${gardien.gardienId}
Rôle : ${gardien.role}
Nature de la contribution : ${nature}
Registre et Google Drive : accès vérifié — ${date}
Documents de référence : Canal Inter-Gardiens
Niveau de confiance : élevé
Signature : ${gardien.name} — ${gardien.gardienId}`;
}

export function getNextTurn(order: string[], currentTurn: string): string | null {
  const index = order.indexOf(currentTurn);
  if (index === -1 || index === order.length - 1) return null;
  return order[index + 1];
}