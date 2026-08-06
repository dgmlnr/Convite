import { describe, expect, it } from "vitest";
import type { TeamId } from "./ids.js";
import { resolveHandWinner } from "./hand-winner.js";
import type { TrickOutcome } from "./trick.js";

const teamA = "team-a" as TeamId;
const teamB = "team-b" as TeamId;

const won = (winnerTeamId: TeamId): TrickOutcome => ({ winnerTeamId });
const parda: TrickOutcome = { winnerTeamId: null };

describe("resolveHandWinner (parda rule)", () => {
  it("case 1: trick 1 tied -> winner of trick 2 wins the hand", () => {
    const result = resolveHandWinner([parda, won(teamA)], teamB);

    expect(result).toEqual({ decided: true, winnerTeamId: teamA });
  });

  it("case 2: tricks 1 and 2 tied -> winner of trick 3 wins the hand", () => {
    const result = resolveHandWinner([parda, parda, won(teamB)], teamA);

    expect(result).toEqual({ decided: true, winnerTeamId: teamB });
  });

  it("case 3: all three tricks tied -> mano team wins", () => {
    const result = resolveHandWinner([parda, parda, parda], teamB);

    expect(result).toEqual({ decided: true, winnerTeamId: teamB });
  });

  it("case 4: first trick won, second tied -> hand decided without a third trick", () => {
    const result = resolveHandWinner([won(teamA), parda], teamB);

    expect(result).toEqual({ decided: true, winnerTeamId: teamA });
  });

  it("case 5: split first two tricks -> not decided until trick 3, which then decides", () => {
    const pending = resolveHandWinner([won(teamA), won(teamB)], teamA);
    expect(pending).toEqual({ decided: false });

    const decided = resolveHandWinner([won(teamA), won(teamB), won(teamB)], teamA);
    expect(decided).toEqual({ decided: true, winnerTeamId: teamB });
  });

  it("case 6: tied, won, tied -> the second trick's winner takes the hand", () => {
    const result = resolveHandWinner([parda, won(teamA), parda], teamB);

    expect(result).toEqual({ decided: true, winnerTeamId: teamA });
  });

  it("is not decided after a single trick", () => {
    const result = resolveHandWinner([won(teamA)], teamB);

    expect(result).toEqual({ decided: false });
  });

  it("split first two tricks and a tied third -> the first trick's winner wins (documented Truco tie-break)", () => {
    const result = resolveHandWinner([won(teamA), won(teamB), parda], teamB);

    expect(result).toEqual({ decided: true, winnerTeamId: teamA });
  });
});
