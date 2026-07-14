/**
 * Generic cursor-pagination helper for Slack Web API list endpoints
 * (e.g. `conversations.list`, `users.list`), which page results via a
 * `response_metadata.next_cursor` field. Callers supply a `fetchPage`
 * function that fetches one page given an optional cursor and reports
 * back the page's items plus the cursor for the next page (or none).
 */
export async function paginateSlack<T>(
  fetchPage: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | undefined;
  do {
    const { items, nextCursor } = await fetchPage(cursor);
    all.push(...items);
    cursor = nextCursor;
  } while (cursor);
  return all;
}
