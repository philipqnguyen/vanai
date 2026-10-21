// The social windows' Babylon-free half (client/test/social_model.test.mjs):
// a roster cut into pages, and the friend action a player menu offers.

// rows per page of the Friends and Company rosters, as the server's
// Player Search pages (world.rb WHO_LIST_PAGE)
export const ROSTER_PAGE = 20;

/** One page of a list held whole: the rows, and the page actually shown
 *  (one past the end is the last, so removing the last row of the last page
 *  steps back rather than showing nothing). */
export function pageOf<T>(rows: T[], page: number, size = ROSTER_PAGE): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(pages, Math.max(1, Math.floor(page) || 1));
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages };
}

/** What the player menu's friend item does for this name: add one who is not
 *  on the list, remove one who is. Names compare case-insensitively, as the
 *  server matches them. */
export function friendAction(friends: Set<string>, name: string): { op: "add" | "remove"; label: string } {
  return friends.has(name.toLowerCase())
    ? { op: "remove", label: "Remove from Friends" }
    : { op: "add", label: "Add Friend" };
}
