// Materialized-path helpers. A folder's `path` is the slash-delimited list of
// its ancestor ids ending with its own id: root folder → '/<id>/',
// child → '/<parentId>/<id>/'. Shared by seed, repositories, and services.

export function childPath(parentPath: string | null, id: string): string {
  return `${parentPath ?? "/"}${id}/`;
}

export function pathIds(path: string): string[] {
  return path.split("/").filter(Boolean);
}

export function isDescendantPath(candidate: string, ancestor: string): boolean {
  return candidate !== ancestor && candidate.startsWith(ancestor);
}
