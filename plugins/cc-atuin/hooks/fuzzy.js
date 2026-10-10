/**
 * Subsequence fuzzy matching with a score.
 *
 * A query matches when its characters appear in order in the candidate. The
 * score rewards adjacency and matches at word boundaries, which is what makes
 * short queries rank useful commands first.
 */

export function fuzzyMatch(query, candidate) {
  if (!query) return { score: 0, indices: [] };

  const lowerQuery = query.toLowerCase();
  const lowerText = candidate.toLowerCase();
  const indices = [];
  let score = 0;
  let textIndex = 0;
  let previousIndex = -1;

  for (const char of lowerQuery) {
    const found = lowerText.indexOf(char, textIndex);
    if (found === -1) return null;

    indices.push(found);
    if (found === previousIndex + 1) score += 8;
    const before = found === 0 ? "" : lowerText[found - 1];
    if (found === 0 || before === " " || before === "-" || before === "/" || before === ".") {
      score += 6;
    }
    score -= Math.min(found - textIndex, 12);
    previousIndex = found;
    textIndex = found + 1;
  }

  // Prefer shorter candidates when the query matches equally well.
  score -= Math.floor(candidate.length / 12);
  return { score, indices };
}

export function fuzzySearch(query, items, { limit = 50, text = (item) => item.text } = {}) {
  const results = [];
  for (const item of items) {
    const match = fuzzyMatch(query, text(item));
    if (match) results.push({ item, ...match });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
