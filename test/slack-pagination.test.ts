import { describe, it, expect, vi } from "vitest";
import { paginateSlack } from "../src/slack-pagination.js";

describe("paginateSlack", () => {
  it("stops after a single page when no cursor is returned", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [1, 2, 3] });
    const result = await paginateSlack(fetchPage);
    expect(result).toEqual([1, 2, 3]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(undefined);
  });

  it("follows nextCursor across multiple pages and aggregates items in order", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ items: ["a", "b"], nextCursor: "cursor-1" })
      .mockResolvedValueOnce({ items: ["c"], nextCursor: "cursor-2" })
      .mockResolvedValueOnce({ items: ["d"] });

    const result = await paginateSlack(fetchPage);

    expect(result).toEqual(["a", "b", "c", "d"]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, undefined);
    expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor-1");
    expect(fetchPage).toHaveBeenNthCalledWith(3, "cursor-2");
  });

  it("treats an empty-string cursor as no more pages", async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: [1], nextCursor: "" });
    const result = await paginateSlack(fetchPage);
    expect(result).toEqual([1]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
