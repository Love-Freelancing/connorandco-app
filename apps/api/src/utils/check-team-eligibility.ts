export interface TeamEligibilityData {
  plan: "trial" | "starter" | "pro";
  createdAt: string;
}

/**
 * All teams are eligible for sync operations.
 */
export function isTeamEligibleForSync(team: TeamEligibilityData): boolean {
  return Boolean(team);
}
