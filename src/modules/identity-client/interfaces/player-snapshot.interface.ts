export interface PlayerSnapshotDto {
  userId: string;
  fullName: string;
  username: string | null;
  playerRole: string | null;
  jerseyNumber: number | null;
  avatarUrl: string | null;
  allowDirectTeamAdd: boolean;
}

export interface BatchSnapshotsResponse {
  snapshots: Record<string, PlayerSnapshotDto>;
}
