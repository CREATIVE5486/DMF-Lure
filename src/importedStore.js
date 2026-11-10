// Registre des modèles 3D importés (hors du JSON du design pour garder l'historique léger).
// id → { raw: Float32Array (soupe brute), proc: résultat du traitement }
const store = new Map();

export function setImported(id, entry) { store.set(id, { ...(store.get(id) || {}), ...entry }); }
export function getImportedEntry(id) { return store.get(id); }
export function importedFor(design) {
  if (!design || design.type !== 'imported' || !design.imported?.id) return null;
  return store.get(design.imported.id)?.proc || null;
}
export function importedRaw(design) {
  if (!design?.imported?.id) return null;
  return store.get(design.imported.id)?.raw || null;
}
