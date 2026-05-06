import type { GenealogyFamily } from "../stores/genealogy";

export function filterGenealogyFamilies(
  families: GenealogyFamily[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  return families
    .filter((family) => {
      if (!normalizedQuery) return true;
      return [
        family.title,
        family.prompt,
        family.root_id,
        family.latest_updated_at,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    })
    .sort((left, right) => new Date(right.latest_updated_at || 0).getTime() - new Date(left.latest_updated_at || 0).getTime());
}
