// wouldCreateCycle: returns true if reparenting `nodeId` under `newParentId` would create a cycle.
// findParentNode(id) -> { _id, parentId } | null
export function wouldCreateCycle(nodeId, newParentId, findParentNode) {
  if (!newParentId) return false;
  const seen = new Set();
  let cursor = newParentId?.toString();
  const target = nodeId?.toString();
  while (cursor) {
    if (cursor === target) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const node = findParentNode(cursor);
    cursor = node?.parentId ? node.parentId.toString() : null;
  }
  return false;
}
