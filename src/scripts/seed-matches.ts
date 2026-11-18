import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';

import { TeamSchema, TeamJoinPolicy } from '../schemas/team.schema';
import {
  TeamMemberSchema,
  MembershipStatus,
  SquadRole,
  MembershipSource,
} from '../schemas/team-member.schema';
import {
  MatchSchema,
  MatchType,
  PitchType,
  BallType,
  MatchStatus,
  TossDecision,
} from '../schemas/match.schema';
import {
  InningSchema,
  BatterLine,
  BowlerLine,
  FallOfWicket,
} from '../schemas/inning.schema';
import {
  BallSchema,
  ExtraType,
  DismissalType,
} from '../schemas/ball.schema';
import { PlayerSnapshot } from '../schemas/common/player-snapshot.schema';

// 1. Initialize environment
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/cricbuddie_match';

// Register Mongoose models
const TeamModel = mongoose.model('Team', TeamSchema);
const TeamMemberModel = mongoose.model('TeamMember', TeamMemberSchema);
const MatchModel = mongoose.model('Match', MatchSchema);
const InningModel = mongoose.model('Inning', InningSchema);
const BallModel = mongoose.model('Ball', BallSchema);

// Primary user snapshot: Javed Saifi
const PRIMARY_USER: PlayerSnapshot = {
  userId: new Types.ObjectId('6aedcc580e20c46fa7e8a650'),
  fullName: 'Javed Saifi',
  username: 'javed.saifi',
  playerRole: 'ALL_ROUNDER',
  jerseyNumber: 17,
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=javed.saifi',
};

interface ManifestUser {
  userId: string;
  fullName: string;
  username: string;
  city: string;
  playerRole: string;
  jerseyNumber: number;
  avatarUrl: string;
  isScorer?: boolean;
  isUmpire?: boolean;
}

interface SimulatedBall {
  matchId: Types.ObjectId;
  inningsNumber: number;
  clientEventId: string;
  sequenceNumber: number;
  overNumber: number;
  legalBallInOver: number;
  bowlerId: Types.ObjectId;
  strikerId: Types.ObjectId;
  nonStrikerId: Types.ObjectId;
  runsOffBat: number;
  extraType: ExtraType;
  extraRuns: number;
  isLegalDelivery: boolean;
  isBoundaryFour: boolean;
  isBoundarySix: boolean;
  wicket: {
    isWicket: boolean;
    dismissalType?: DismissalType | null;
    dismissedPlayerId?: Types.ObjectId | null;
    fielderId?: Types.ObjectId | null;
  };
  isUndone: boolean;
  recordedAt: Date;
}

function formatOvers(legalBalls: number): string {
  const completedOvers = Math.floor(legalBalls / 6);
  const ballsInOver = legalBalls % 6;
  return `${completedOvers}.${ballsInOver}`;
}

/**
 * Deterministically reconstruct innings cards and totals from balls
 */
function computeInningData(
  balls: SimulatedBall[],
  teamAPlayers: PlayerSnapshot[],
  teamBPlayers: PlayerSnapshot[],
  inningsNumber: number,
  battingTeamId: Types.ObjectId,
  bowlingTeamId: Types.ObjectId,
  matchId: Types.ObjectId,
  targetRuns?: number | null,
  isCompleted = false,
) {
  const playerMap = new Map<string, { fullName: string; username?: string | null }>();
  for (const p of [...teamAPlayers, ...teamBPlayers]) {
    if (p.userId) {
      playerMap.set(p.userId.toString(), {
        fullName: p.fullName,
        username: p.username,
      });
    }
  }

  let totalRuns = 0;
  let totalWickets = 0;
  let legalBallsBowled = 0;
  const extras = {
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    penalty: 0,
  };

  const battersMap = new Map<string, BatterLine>();
  const bowlersMap = new Map<string, BowlerLine>();
  const fallOfWickets: FallOfWicket[] = [];
  const bowlerOvers = new Map<string, Map<number, { legalBalls: number; runsConceded: number }>>();

  const getOrCreateBatter = (id: Types.ObjectId): BatterLine => {
    const key = id.toString();
    if (!battersMap.has(key)) {
      const info = playerMap.get(key) || { fullName: `Player ${key.slice(-4)}` };
      battersMap.set(key, {
        playerId: id,
        fullName: info.fullName,
        username: info.username || null,
        runs: 0,
        ballsFaced: 0,
        fours: 0,
        sixes: 0,
        isOut: false,
        dismissalText: 'not out',
        bowlerId: null,
        fielderId: null,
      });
    }
    return battersMap.get(key)!;
  };

  const getOrCreateBowler = (id: Types.ObjectId): BowlerLine => {
    const key = id.toString();
    if (!bowlersMap.has(key)) {
      const info = playerMap.get(key) || { fullName: `Player ${key.slice(-4)}` };
      bowlersMap.set(key, {
        playerId: id,
        fullName: info.fullName,
        username: info.username || null,
        legalBalls: 0,
        maidens: 0,
        runsConceded: 0,
        wickets: 0,
        wides: 0,
        noBalls: 0,
      });
    }
    return bowlersMap.get(key)!;
  };

  for (const b of balls) {
    if (b.isUndone) continue;

    const runsOffBat = b.runsOffBat || 0;
    const extraRuns = b.extraRuns || 0;
    totalRuns += runsOffBat + extraRuns;

    if (b.isLegalDelivery) {
      legalBallsBowled += 1;
    }

    // Extras breakdown
    switch (b.extraType) {
      case ExtraType.WIDE:
        extras.wides += extraRuns;
        break;
      case ExtraType.NO_BALL:
        extras.noBalls += extraRuns;
        break;
      case ExtraType.BYE:
        extras.byes += extraRuns;
        break;
      case ExtraType.LEG_BYE:
        extras.legByes += extraRuns;
        break;
      case ExtraType.PENALTY:
        extras.penalty += extraRuns;
        break;
    }

    // Batter stats
    const striker = getOrCreateBatter(b.strikerId);
    if (b.extraType !== ExtraType.WIDE) {
      striker.ballsFaced += 1;
    }
    striker.runs += runsOffBat;
    if (b.isBoundaryFour) striker.fours += 1;
    if (b.isBoundarySix) striker.sixes += 1;

    // Bowler stats
    const bowler = getOrCreateBowler(b.bowlerId);
    if (b.isLegalDelivery) {
      bowler.legalBalls += 1;
    }
    if (
      b.extraType !== ExtraType.BYE &&
      b.extraType !== ExtraType.LEG_BYE &&
      b.extraType !== ExtraType.PENALTY
    ) {
      bowler.runsConceded += runsOffBat + extraRuns;
    }
    if (b.extraType === ExtraType.WIDE) bowler.wides += extraRuns;
    if (b.extraType === ExtraType.NO_BALL) bowler.noBalls += extraRuns;

    // Maiden over tracking
    const bKey = b.bowlerId.toString();
    if (!bowlerOvers.has(bKey)) {
      bowlerOvers.set(bKey, new Map());
    }
    const oMap = bowlerOvers.get(bKey)!;
    if (!oMap.has(b.overNumber)) {
      oMap.set(b.overNumber, { legalBalls: 0, runsConceded: 0 });
    }
    const oData = oMap.get(b.overNumber)!;
    if (b.isLegalDelivery) oData.legalBalls += 1;
    if (
      b.extraType !== ExtraType.BYE &&
      b.extraType !== ExtraType.LEG_BYE &&
      b.extraType !== ExtraType.PENALTY
    ) {
      oData.runsConceded += runsOffBat + extraRuns;
    }

    // Wickets
    if (b.wicket?.isWicket) {
      totalWickets += 1;
      const dismissedId = b.wicket.dismissedPlayerId || b.strikerId;
      const dismissedBatter = getOrCreateBatter(dismissedId);
      dismissedBatter.isOut = true;

      const bowlerName = playerMap.get(b.bowlerId.toString())?.fullName || 'bowler';
      const fielderName = b.wicket.fielderId
        ? playerMap.get(b.wicket.fielderId.toString())?.fullName || 'fielder'
        : '';

      let dismissalText = 'out';
      switch (b.wicket.dismissalType) {
        case DismissalType.BOWLED:
          dismissalText = `b ${bowlerName}`;
          break;
        case DismissalType.CAUGHT:
          dismissalText = fielderName
            ? `c ${fielderName} b ${bowlerName}`
            : `c & b ${bowlerName}`;
          break;
        case DismissalType.LBW:
          dismissalText = `lbw b ${bowlerName}`;
          break;
        case DismissalType.RUN_OUT:
          dismissalText = fielderName ? `run out (${fielderName})` : 'run out';
          break;
        case DismissalType.STUMPED:
          dismissalText = fielderName
            ? `st ${fielderName} b ${bowlerName}`
            : `st b ${bowlerName}`;
          break;
        case DismissalType.HIT_WICKET:
          dismissalText = `hit wicket b ${bowlerName}`;
          break;
        default:
          dismissalText = `b ${bowlerName}`;
          break;
      }

      dismissedBatter.dismissalText = dismissalText;
      dismissedBatter.bowlerId = b.bowlerId;
      dismissedBatter.fielderId = b.wicket.fielderId || null;

      if (
        b.wicket.dismissalType !== DismissalType.RUN_OUT &&
        b.wicket.dismissalType !== DismissalType.RETIRED_HURT
      ) {
        bowler.wickets += 1;
      }

      fallOfWickets.push({
        wicketNumber: totalWickets,
        score: totalRuns,
        overText: formatOvers(legalBallsBowled),
        dismissedPlayerId: dismissedId,
        ballSequence: b.sequenceNumber,
      });
    }
  }

  // Calculate maidens
  for (const [bKey, overMap] of bowlerOvers.entries()) {
    const bowler = bowlersMap.get(bKey);
    if (bowler) {
      let maidens = 0;
      for (const oData of overMap.values()) {
        if (oData.legalBalls >= 6 && oData.runsConceded === 0) {
          maidens += 1;
        }
      }
      bowler.maidens = maidens;
    }
  }

  // Active state
  const latestBall = balls[balls.length - 1];
  const currentState = {
    strikerId: latestBall ? latestBall.strikerId : null,
    nonStrikerId: latestBall ? latestBall.nonStrikerId : null,
    currentBowlerId: latestBall ? latestBall.bowlerId : null,
    currentOverNumber: Math.floor(legalBallsBowled / 6) + 1,
  };

  return {
    matchId,
    inningsNumber,
    battingTeamId,
    bowlingTeamId,
    isCompleted,
    totalRuns,
    totalWickets,
    legalBallsBowled,
    targetRuns: targetRuns ?? null,
    extras,
    currentState,
    battingCard: Array.from(battersMap.values()),
    bowlingCard: Array.from(bowlersMap.values()),
    fallOfWickets,
  };
}

/**
 * Realistic match balls generator
 */
function simulateInningsDeliveries(params: {
  matchId: Types.ObjectId;
  inningsNumber: number;
  battingXI: PlayerSnapshot[];
  bowlingXI: PlayerSnapshot[];
  maxOvers: number;
  targetRuns?: number;
  cutoffLegalBalls?: number; // for in-progress live games
  priorityBatsmanId?: Types.ObjectId; // guaranteed early entry, e.g. Javed
  priorityBowlerId?: Types.ObjectId; // guaranteed bowling quota, e.g. Javed
  startSequence?: number;
  baseTime?: Date;
}): SimulatedBall[] {
  const {
    matchId,
    inningsNumber,
    battingXI,
    bowlingXI,
    maxOvers,
    targetRuns,
    cutoffLegalBalls,
    priorityBatsmanId,
    priorityBowlerId,
    startSequence = 1,
    baseTime = new Date(Date.now() - 3600 * 1000 * 3),
  } = params;

  const balls: SimulatedBall[] = [];
  let sequenceNumber = startSequence;

  // Batting order
  const batters = [...battingXI];
  if (priorityBatsmanId) {
    const pIdx = batters.findIndex((b) => b.userId.equals(priorityBatsmanId));
    if (pIdx > 2) {
      // Put in top 3
      const [p] = batters.splice(pIdx, 1);
      batters.splice(2, 0, p);
    }
  }

  // Bowlers (choose 5 bowlers from bottom or marked as bowlers/all-rounders)
  const candidateBowlers = bowlingXI.filter(
    (p) => p.playerRole === 'BOWLER' || p.playerRole === 'ALL_ROUNDER',
  );
  let bowlers = candidateBowlers.length >= 4 ? candidateBowlers : bowlingXI.slice(5);
  if (priorityBowlerId) {
    const pBowler = bowlingXI.find((b) => b.userId.equals(priorityBowlerId));
    if (pBowler && !bowlers.some((b) => b.userId.equals(priorityBowlerId))) {
      bowlers = [pBowler, ...bowlers];
    }
  }
  if (bowlers.length < 2) bowlers = bowlingXI.slice(5);

  let strikerIdx = 0;
  let nonStrikerIdx = 1;
  let nextBatterIdx = 2;

  let totalRuns = 0;
  let totalWickets = 0;
  let legalBalls = 0;
  let currentOver = 1;
  let legalBallInOver = 0;

  let currentTime = new Date(baseTime.getTime());

  // Delivery loop
  while (legalBalls < maxOvers * 6 && totalWickets < 10) {
    if (targetRuns && totalRuns >= targetRuns) {
      break; // Chased down target
    }
    if (cutoffLegalBalls !== undefined && legalBalls >= cutoffLegalBalls) {
      break; // Live game cutoff reached
    }

    currentOver = Math.floor(legalBalls / 6) + 1;
    legalBallInOver = (legalBalls % 6) + 1;

    // Alternate bowlers every over
    const bowlerIndexInList = (currentOver - 1) % bowlers.length;
    const currentBowler = bowlers[bowlerIndexInList];
    const striker = batters[strikerIdx];
    const nonStriker = batters[nonStrikerIdx];

    // Seed realistic event distribution
    const rand = Math.random();
    let runsOffBat = 0;
    let extraType = ExtraType.NONE;
    let extraRuns = 0;
    let isLegalDelivery = true;
    let isBoundaryFour = false;
    let isBoundarySix = false;
    let wicket = {
      isWicket: false,
      dismissalType: null as DismissalType | null,
      dismissedPlayerId: null as Types.ObjectId | null,
      fielderId: null as Types.ObjectId | null,
    };

    currentTime = new Date(currentTime.getTime() + Math.floor(20000 + Math.random() * 25000));

    if (rand < 0.04) {
      // Wide
      extraType = ExtraType.WIDE;
      extraRuns = 1;
      isLegalDelivery = false;
      totalRuns += 1;
    } else if (rand < 0.06) {
      // No ball
      extraType = ExtraType.NO_BALL;
      extraRuns = 1;
      isLegalDelivery = false;
      totalRuns += 1;
      // Strike does not rotate on no ball
    } else if (rand < 0.09) {
      // Wicket
      isLegalDelivery = true;
      totalWickets += 1;
      const dismissalRoll = Math.random();
      let dType = DismissalType.CAUGHT;
      let fielder: Types.ObjectId | null = bowlingXI[Math.floor(Math.random() * bowlingXI.length)].userId;

      if (dismissalRoll < 0.35) {
        dType = DismissalType.CAUGHT;
      } else if (dismissalRoll < 0.65) {
        dType = DismissalType.BOWLED;
        fielder = null;
      } else if (dismissalRoll < 0.85) {
        dType = DismissalType.LBW;
        fielder = null;
      } else {
        dType = DismissalType.RUN_OUT;
      }

      wicket = {
        isWicket: true,
        dismissalType: dType,
        dismissedPlayerId: striker.userId,
        fielderId: fielder,
      };

      // Batter out, bring in next
      strikerIdx = nextBatterIdx;
      nextBatterIdx += 1;
    } else if (rand < 0.45) {
      // Dot ball
      runsOffBat = 0;
      isLegalDelivery = true;
    } else if (rand < 0.72) {
      // 1 Run (strike rotates)
      runsOffBat = 1;
      isLegalDelivery = true;
      totalRuns += 1;
      // Rotate strike
      const temp = strikerIdx;
      strikerIdx = nonStrikerIdx;
      nonStrikerIdx = temp;
    } else if (rand < 0.83) {
      // 2 Runs (strike stays)
      runsOffBat = 2;
      isLegalDelivery = true;
      totalRuns += 2;
    } else if (rand < 0.85) {
      // 3 Runs (strike rotates)
      runsOffBat = 3;
      isLegalDelivery = true;
      totalRuns += 3;
      const temp = strikerIdx;
      strikerIdx = nonStrikerIdx;
      nonStrikerIdx = temp;
    } else if (rand < 0.95) {
      // Boundary 4
      runsOffBat = 4;
      isLegalDelivery = true;
      isBoundaryFour = true;
      totalRuns += 4;
    } else {
      // Six 6
      runsOffBat = 6;
      isLegalDelivery = true;
      isBoundarySix = true;
      totalRuns += 6;
    }

    if (isLegalDelivery) {
      legalBalls += 1;
    }

    balls.push({
      matchId,
      inningsNumber,
      clientEventId: `${matchId.toString()}-inn${inningsNumber}-seq${sequenceNumber}`,
      sequenceNumber,
      overNumber: currentOver,
      legalBallInOver: isLegalDelivery ? legalBallInOver : Math.max(1, legalBallInOver - 1),
      bowlerId: currentBowler.userId,
      strikerId: striker.userId,
      nonStrikerId: nonStriker.userId,
      runsOffBat,
      extraType,
      extraRuns,
      isLegalDelivery,
      isBoundaryFour,
      isBoundarySix,
      wicket,
      isUndone: false,
      recordedAt: currentTime,
    });

    sequenceNumber += 1;

    // Over completion: rotate strike
    if (isLegalDelivery && legalBalls % 6 === 0) {
      const temp = strikerIdx;
      strikerIdx = nonStrikerIdx;
      nonStrikerIdx = temp;
    }
  }

  return balls;
}

// -------------------------------------------------------------
// MAIN SEED SCRIPT
// -------------------------------------------------------------
async function run() {
  console.log('====================================================');
  console.log('  CRICBUDDIE MATCH SERVICE - DATABASE SEED SCRIPT   ');
  console.log('====================================================');

  console.log(`Connecting to MongoDB: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB successfully.');

  const isClean = process.argv.includes('--clean') || true;
  if (isClean) {
    console.log('Purging existing matches, innings, balls, teams, and teammembers...');
    await Promise.all([
      TeamModel.deleteMany({}),
      TeamMemberModel.deleteMany({}),
      MatchModel.deleteMany({}),
      InningModel.deleteMany({}),
      BallModel.deleteMany({}),
    ]);
    console.log('Collections cleaned successfully.');
  }

  // 1. Load users manifest
  const manifestPath = path.resolve(process.cwd(), 'seed-users-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found at ${manifestPath}`);
  }
  const manifestUsers: ManifestUser[] = JSON.parse(
    fs.readFileSync(manifestPath, 'utf8'),
  );
  console.log(`Loaded ${manifestUsers.length} users from seed-users-manifest.json`);

  // Convert to PlayerSnapshots
  const playerSnapshots: PlayerSnapshot[] = manifestUsers.map((u) => ({
    userId: new Types.ObjectId(u.userId),
    fullName: u.fullName,
    username: u.username,
    playerRole: u.playerRole,
    jerseyNumber: u.jerseyNumber,
    avatarUrl: u.avatarUrl,
  }));

  // 2. Define 12 Authentic Clubs
  const clubDefinitions = [
    {
      name: 'Ghaziabad Strikers',
      shortName: 'GZB',
      city: 'Ghaziabad',
      inviteCode: 'GZBSTR26',
      owner: PRIMARY_USER, // Javed
    },
    {
      name: 'Indirapuram Royals',
      shortName: 'IDR',
      city: 'Ghaziabad',
      inviteCode: 'IDRROY26',
      owner: PRIMARY_USER, // Javed
    },
    {
      name: 'Noida Mavericks',
      shortName: 'NOI',
      city: 'Noida',
      inviteCode: 'NOIMAV26',
      owner: playerSnapshots[0],
    },
    {
      name: 'Delhi Capitals XI',
      shortName: 'DEL',
      city: 'Delhi',
      inviteCode: 'DELCAP26',
      owner: playerSnapshots[14],
    },
    {
      name: 'Vaishali Spartans',
      shortName: 'VSH',
      city: 'Ghaziabad',
      inviteCode: 'VSHSPA26',
      owner: playerSnapshots[28],
    },
    {
      name: 'Kaushambi Kings',
      shortName: 'KSB',
      city: 'Ghaziabad',
      inviteCode: 'KSBKNG26',
      owner: playerSnapshots[42],
    },
    {
      name: 'Raj Nagar Renegades',
      shortName: 'RNR',
      city: 'Ghaziabad',
      inviteCode: 'RNRREN26',
      owner: playerSnapshots[56],
    },
    {
      name: 'Meerut Panthers',
      shortName: 'MRT',
      city: 'Meerut',
      inviteCode: 'MRTPAN26',
      owner: playerSnapshots[70],
    },
    {
      name: 'Gurugram Titans',
      shortName: 'GGN',
      city: 'Gurugram',
      inviteCode: 'GGNTIT26',
      owner: playerSnapshots[84],
    },
    {
      name: 'Yamuna Warriors',
      shortName: 'YMN',
      city: 'Noida',
      inviteCode: 'YMNWAR26',
      owner: playerSnapshots[98],
    },
    {
      name: 'Hindon Hurricanes',
      shortName: 'HND',
      city: 'Ghaziabad',
      inviteCode: 'HNDHUR26',
      owner: playerSnapshots[112],
    },
    {
      name: 'NCR Challengers',
      shortName: 'NCR',
      city: 'Delhi',
      inviteCode: 'NCRCHL26',
      owner: playerSnapshots[126],
    },
  ];

  console.log('Seeding 12 Teams and Squads...');
  const teams: any[] = [];
  const teamMembers: any[] = [];
  const teamSquadsMap = new Map<string, PlayerSnapshot[]>();

  let poolIdx = 0;

  for (let i = 0; i < clubDefinitions.length; i++) {
    const club = clubDefinitions[i];
    const isJavedTeam = club.owner.userId.equals(PRIMARY_USER.userId);

    // Active squad: 13-14 players
    const squadPlayers: PlayerSnapshot[] = [];

    // Add owner
    squadPlayers.push(club.owner);

    // Add 12 other players from pool
    const activeCountNeeded = 13;
    while (squadPlayers.length < activeCountNeeded && poolIdx < playerSnapshots.length) {
      const candidate = playerSnapshots[poolIdx];
      poolIdx += 1;
      if (!candidate.userId.equals(club.owner.userId)) {
        squadPlayers.push(candidate);
      }
    }

    // Designate Roles
    const captain = squadPlayers[0]; // Owner is captain for simplicity, or player 0
    const viceCaptain = squadPlayers[1];
    const adminIds = [captain.userId, viceCaptain.userId];

    const teamDoc = new TeamModel({
      name: club.name,
      shortName: club.shortName,
      logoUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${club.shortName}`,
      city: club.city,
      ownerId: club.owner.userId,
      adminIds,
      joinPolicy: TeamJoinPolicy.APPROVAL,
      inviteCode: club.inviteCode,
      isInviteActive: true,
      activeMemberCount: squadPlayers.length,
      stats: {
        matchesPlayed: 0,
        won: 0,
        lost: 0,
        tied: 0,
        noResult: 0,
      },
      isActive: true,
    });
    await teamDoc.save();
    teams.push(teamDoc);
    teamSquadsMap.set(teamDoc._id.toString(), squadPlayers);

    // Track unique users for this team to avoid unique compound index conflicts
    const addedUserIds = new Set<string>();

    // Create TeamMember documents for active squad
    for (let sIdx = 0; sIdx < squadPlayers.length; sIdx++) {
      const player = squadPlayers[sIdx];
      const pKey = player.userId.toString();
      if (addedUserIds.has(pKey)) continue;
      addedUserIds.add(pKey);

      let squadRole = SquadRole.PLAYER;
      if (sIdx === 0) squadRole = SquadRole.OWNER;
      else if (sIdx === 1) squadRole = SquadRole.VICE_CAPTAIN;

      teamMembers.push(
        new TeamMemberModel({
          teamId: teamDoc._id,
          userId: player.userId,
          playerSnapshot: player,
          status: MembershipStatus.ACTIVE,
          squadRole,
          source: MembershipSource.ADMIN_ADD,
          joinedAt: new Date(Date.now() - 86400 * 1000 * (30 - i)),
        }),
      );
    }

    // If Javed's team, add pending join requests & pending outbound invites for testing tabs
    if (isJavedTeam) {
      const baseOffset = i === 0 ? 135 : 142;

      // 3 PENDING_ADMIN join requests
      const applicant1 = playerSnapshots[baseOffset];
      const applicant2 = playerSnapshots[baseOffset + 1];
      const applicant3 = playerSnapshots[baseOffset + 2];

      for (const [idx, app] of [applicant1, applicant2, applicant3].entries()) {
        if (app && !addedUserIds.has(app.userId.toString())) {
          addedUserIds.add(app.userId.toString());
          teamMembers.push(
            new TeamMemberModel({
              teamId: teamDoc._id,
              userId: app.userId,
              playerSnapshot: app,
              status: MembershipStatus.PENDING_ADMIN,
              squadRole: SquadRole.PLAYER,
              source: idx === 0 ? MembershipSource.QR_SCAN : MembershipSource.INVITE_LINK,
              joinedAt: null,
            }),
          );
        }
      }

      // 2 PENDING_PLAYER outbound invites
      const invited1 = playerSnapshots[baseOffset + 3];
      const invited2 = playerSnapshots[baseOffset + 4];

      for (const inv of [invited1, invited2]) {
        if (inv && !addedUserIds.has(inv.userId.toString())) {
          addedUserIds.add(inv.userId.toString());
          teamMembers.push(
            new TeamMemberModel({
              teamId: teamDoc._id,
              userId: inv.userId,
              playerSnapshot: inv,
              status: MembershipStatus.PENDING_PLAYER,
              squadRole: SquadRole.PLAYER,
              source: MembershipSource.ADMIN_ADD,
              invitedBy: PRIMARY_USER.userId,
              joinedAt: null,
            }),
          );
        }
      }
    }
  }

  // Bulk save team members
  await TeamMemberModel.insertMany(teamMembers);
  console.log(`Saved ${teams.length} teams and ${teamMembers.length} team members.`);

  // -------------------------------------------------------------
  // 3. Seed 10 Realistic Matches
  // -------------------------------------------------------------
  console.log('Seeding 10 Matches (4 Completed, 3 Live, 3 Scheduled)...');

  const gzb = teams.find((t) => t.shortName === 'GZB')!;
  const idr = teams.find((t) => t.shortName === 'IDR')!;
  const noi = teams.find((t) => t.shortName === 'NOI')!;
  const del = teams.find((t) => t.shortName === 'DEL')!;
  const vsh = teams.find((t) => t.shortName === 'VSH')!;
  const ksb = teams.find((t) => t.shortName === 'KSB')!;
  const rnr = teams.find((t) => t.shortName === 'RNR')!;
  const mrt = teams.find((t) => t.shortName === 'MRT')!;
  const ggn = teams.find((t) => t.shortName === 'GGN')!;
  const ymn = teams.find((t) => t.shortName === 'YMN')!;
  const hnd = teams.find((t) => t.shortName === 'HND')!;
  const ncr = teams.find((t) => t.shortName === 'NCR')!;

  const getXI = (teamDoc: any): PlayerSnapshot[] => {
    return (teamSquadsMap.get(teamDoc._id.toString()) || []).slice(0, 11);
  };

  // Helper to create team slot
  const createTeamSlot = (teamDoc: any, runs = 0, wickets = 0, oversText = '0.0') => {
    const xi = getXI(teamDoc);
    return {
      teamId: teamDoc._id,
      name: teamDoc.name,
      shortName: teamDoc.shortName,
      logoUrl: teamDoc.logoUrl,
      playingXI: xi,
      captainId: xi[0]?.userId,
      wicketKeeperId: xi[1]?.userId,
      runs,
      wickets,
      oversText,
    };
  };

  // -------------------------------------------------------------
  // MATCH 1: COMPLETED (T20) - Ghaziabad Strikers vs Noida Mavericks
  // GZB won by 18 runs. Javed Saifi POTM (48* runs, 2 wickets).
  // -------------------------------------------------------------
  console.log('Generating Match 1 (Completed): GZB vs NOI...');
  const match1Id = new Types.ObjectId();
  const match1Scheduled = new Date(Date.now() - 86400 * 1000 * 2);

  const gzbXI = getXI(gzb);
  const noiXI = getXI(noi);

  // Innings 1: GZB bats
  const m1Inn1Balls = simulateInningsDeliveries({
    matchId: match1Id,
    inningsNumber: 1,
    battingXI: gzbXI,
    bowlingXI: noiXI,
    maxOvers: 20,
    priorityBatsmanId: PRIMARY_USER.userId,
    baseTime: new Date(match1Scheduled.getTime() + 1800 * 1000),
  });

  const m1Inn1Data = computeInningData(
    m1Inn1Balls,
    gzbXI,
    noiXI,
    1,
    gzb._id,
    noi._id,
    match1Id,
    null,
    true,
  );

  // Innings 2: NOI chases
  const m1Inn2Balls = simulateInningsDeliveries({
    matchId: match1Id,
    inningsNumber: 2,
    battingXI: noiXI,
    bowlingXI: gzbXI,
    maxOvers: 20,
    targetRuns: m1Inn1Data.totalRuns + 1,
    priorityBowlerId: PRIMARY_USER.userId,
    startSequence: m1Inn1Balls.length + 1,
    baseTime: new Date(match1Scheduled.getTime() + 7200 * 1000),
  });

  const m1Inn2Data = computeInningData(
    m1Inn2Balls,
    gzbXI,
    noiXI,
    2,
    noi._id,
    gzb._id,
    match1Id,
    m1Inn1Data.totalRuns + 1,
    true,
  );

  const match1 = new MatchModel({
    _id: match1Id,
    matchType: MatchType.LIMITED_OVERS,
    ballsPerOver: 6,
    pitchType: PitchType.TURF,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Mahamaya Cricket Stadium',
      groundName: 'Mahamaya Cricket Stadium',
      city: 'Ghaziabad',
    },
    scheduledAt: match1Scheduled,
    status: MatchStatus.COMPLETED,
    createdBy: PRIMARY_USER.userId,
    teamA: createTeamSlot(
      gzb,
      m1Inn1Data.totalRuns,
      m1Inn1Data.totalWickets,
      formatOvers(m1Inn1Data.legalBallsBowled),
    ),
    teamB: createTeamSlot(
      noi,
      m1Inn2Data.totalRuns,
      m1Inn2Data.totalWickets,
      formatOvers(m1Inn2Data.legalBallsBowled),
    ),
    officials: {
      scorerIds: [PRIMARY_USER.userId],
      scorerId: PRIMARY_USER.userId,
      activeScorerId: PRIMARY_USER.userId,
      umpireIds: [playerSnapshots[10].userId, playerSnapshots[11].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {
      wonByTeamId: gzb._id,
      decision: TossDecision.BAT,
    },
    currentInningsNumber: 2,
    result: {
      winnerTeamId: gzb._id,
      isTie: false,
      isNoResult: false,
      marginText: `Ghaziabad Strikers won by ${m1Inn1Data.totalRuns - m1Inn2Data.totalRuns} runs`,
      playerOfMatchId: PRIMARY_USER.userId,
    },
    lastSyncedSequence: m1Inn1Balls.length + m1Inn2Balls.length,
  });

  await match1.save();
  await InningModel.insertMany([
    new InningModel(m1Inn1Data),
    new InningModel(m1Inn2Data),
  ]);
  await BallModel.insertMany([...m1Inn1Balls, ...m1Inn2Balls]);

  // Update stats for GZB & NOI
  await TeamModel.findByIdAndUpdate(gzb._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.won': 1 },
  });
  await TeamModel.findByIdAndUpdate(noi._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.lost': 1 },
  });

  // -------------------------------------------------------------
  // MATCH 2: COMPLETED (T20) - Delhi Capitals XI vs Gurugram Titans
  // DEL won by 4 wickets
  // -------------------------------------------------------------
  console.log('Generating Match 2 (Completed): DEL vs GGN...');
  const match2Id = new Types.ObjectId();
  const match2Scheduled = new Date(Date.now() - 86400 * 1000 * 4);
  const delXI = getXI(del);
  const ggnXI = getXI(ggn);

  const m2Inn1Balls = simulateInningsDeliveries({
    matchId: match2Id,
    inningsNumber: 1,
    battingXI: ggnXI,
    bowlingXI: delXI,
    maxOvers: 20,
    baseTime: new Date(match2Scheduled.getTime() + 1800 * 1000),
  });
  const m2Inn1Data = computeInningData(
    m2Inn1Balls,
    delXI,
    ggnXI,
    1,
    ggn._id,
    del._id,
    match2Id,
    null,
    true,
  );

  const m2Inn2Balls = simulateInningsDeliveries({
    matchId: match2Id,
    inningsNumber: 2,
    battingXI: delXI,
    bowlingXI: ggnXI,
    maxOvers: 20,
    targetRuns: m2Inn1Data.totalRuns + 1,
    startSequence: m2Inn1Balls.length + 1,
    baseTime: new Date(match2Scheduled.getTime() + 7200 * 1000),
  });
  const m2Inn2Data = computeInningData(
    m2Inn2Balls,
    delXI,
    ggnXI,
    2,
    del._id,
    ggn._id,
    match2Id,
    m2Inn1Data.totalRuns + 1,
    true,
  );

  const match2 = new MatchModel({
    _id: match2Id,
    matchType: MatchType.LIMITED_OVERS,
    ballsPerOver: 6,
    pitchType: PitchType.TURF,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Feroz Shah Cricket Grounds',
      groundName: 'Feroz Shah Cricket Grounds',
      city: 'Delhi',
    },
    scheduledAt: match2Scheduled,
    status: MatchStatus.COMPLETED,
    createdBy: delXI[0].userId,
    teamA: createTeamSlot(
      del,
      m2Inn2Data.totalRuns,
      m2Inn2Data.totalWickets,
      formatOvers(m2Inn2Data.legalBallsBowled),
    ),
    teamB: createTeamSlot(
      ggn,
      m2Inn1Data.totalRuns,
      m2Inn1Data.totalWickets,
      formatOvers(m2Inn1Data.legalBallsBowled),
    ),
    officials: {
      scorerIds: [delXI[1].userId],
      scorerId: delXI[1].userId,
      activeScorerId: delXI[1].userId,
      umpireIds: [playerSnapshots[20].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {
      wonByTeamId: del._id,
      decision: TossDecision.BOWL,
    },
    currentInningsNumber: 2,
    result: {
      winnerTeamId: del._id,
      isTie: false,
      isNoResult: false,
      marginText: `Delhi Capitals XI won by ${10 - m2Inn2Data.totalWickets} wickets`,
      playerOfMatchId: delXI[0].userId,
    },
    lastSyncedSequence: m2Inn1Balls.length + m2Inn2Balls.length,
  });

  await match2.save();
  await InningModel.insertMany([
    new InningModel(m2Inn1Data),
    new InningModel(m2Inn2Data),
  ]);
  await BallModel.insertMany([...m2Inn1Balls, ...m2Inn2Balls]);

  await TeamModel.findByIdAndUpdate(del._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.won': 1 },
  });
  await TeamModel.findByIdAndUpdate(ggn._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.lost': 1 },
  });

  // -------------------------------------------------------------
  // MATCH 3: COMPLETED (T10) - Indirapuram Royals vs Vaishali Spartans
  // IDR won by 7 wickets
  // -------------------------------------------------------------
  console.log('Generating Match 3 (Completed): IDR vs VSH (T10)...');
  const match3Id = new Types.ObjectId();
  const match3Scheduled = new Date(Date.now() - 86400 * 1000 * 5);
  const idrXI = getXI(idr);
  const vshXI = getXI(vsh);

  const m3Inn1Balls = simulateInningsDeliveries({
    matchId: match3Id,
    inningsNumber: 1,
    battingXI: vshXI,
    bowlingXI: idrXI,
    maxOvers: 10,
    baseTime: new Date(match3Scheduled.getTime() + 1800 * 1000),
  });
  const m3Inn1Data = computeInningData(
    m3Inn1Balls,
    idrXI,
    vshXI,
    1,
    vsh._id,
    idr._id,
    match3Id,
    null,
    true,
  );

  const m3Inn2Balls = simulateInningsDeliveries({
    matchId: match3Id,
    inningsNumber: 2,
    battingXI: idrXI,
    bowlingXI: vshXI,
    maxOvers: 10,
    targetRuns: m3Inn1Data.totalRuns + 1,
    startSequence: m3Inn1Balls.length + 1,
    baseTime: new Date(match3Scheduled.getTime() + 4500 * 1000),
  });
  const m3Inn2Data = computeInningData(
    m3Inn2Balls,
    idrXI,
    vshXI,
    2,
    idr._id,
    vsh._id,
    match3Id,
    m3Inn1Data.totalRuns + 1,
    true,
  );

  const match3 = new MatchModel({
    _id: match3Id,
    matchType: MatchType.BOX_TURF,
    ballsPerOver: 6,
    pitchType: PitchType.ASTROTURF,
    oversPerInnings: 10,
    ballType: BallType.TENNIS,
    venue: {
      ground: 'Swarn Jayanti Cricket Ground',
      groundName: 'Swarn Jayanti Cricket Ground',
      city: 'Ghaziabad',
    },
    scheduledAt: match3Scheduled,
    status: MatchStatus.COMPLETED,
    createdBy: PRIMARY_USER.userId,
    teamA: createTeamSlot(
      idr,
      m3Inn2Data.totalRuns,
      m3Inn2Data.totalWickets,
      formatOvers(m3Inn2Data.legalBallsBowled),
    ),
    teamB: createTeamSlot(
      vsh,
      m3Inn1Data.totalRuns,
      m3Inn1Data.totalWickets,
      formatOvers(m3Inn1Data.legalBallsBowled),
    ),
    officials: {
      scorerIds: [PRIMARY_USER.userId],
      scorerId: PRIMARY_USER.userId,
      activeScorerId: PRIMARY_USER.userId,
      umpireIds: [playerSnapshots[22].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {
      wonByTeamId: idr._id,
      decision: TossDecision.BOWL,
    },
    currentInningsNumber: 2,
    result: {
      winnerTeamId: idr._id,
      isTie: false,
      isNoResult: false,
      marginText: `Indirapuram Royals won by ${10 - m3Inn2Data.totalWickets} wickets`,
      playerOfMatchId: idrXI[1].userId,
    },
    lastSyncedSequence: m3Inn1Balls.length + m3Inn2Balls.length,
  });

  await match3.save();
  await InningModel.insertMany([
    new InningModel(m3Inn1Data),
    new InningModel(m3Inn2Data),
  ]);
  await BallModel.insertMany([...m3Inn1Balls, ...m3Inn2Balls]);

  await TeamModel.findByIdAndUpdate(idr._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.won': 1 },
  });
  await TeamModel.findByIdAndUpdate(vsh._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.lost': 1 },
  });

  // -------------------------------------------------------------
  // MATCH 4: COMPLETED (T20) - Hindon Hurricanes vs Meerut Panthers (TIED)
  // -------------------------------------------------------------
  console.log('Generating Match 4 (Completed): HND vs MRT (Tied)...');
  const match4Id = new Types.ObjectId();
  const match4Scheduled = new Date(Date.now() - 86400 * 1000 * 6);
  const hndXI = getXI(hnd);
  const mrtXI = getXI(mrt);

  const m4Inn1Balls = simulateInningsDeliveries({
    matchId: match4Id,
    inningsNumber: 1,
    battingXI: hndXI,
    bowlingXI: mrtXI,
    maxOvers: 20,
    baseTime: new Date(match4Scheduled.getTime() + 1800 * 1000),
  });
  const m4Inn1Data = computeInningData(
    m4Inn1Balls,
    hndXI,
    mrtXI,
    1,
    hnd._id,
    mrt._id,
    match4Id,
    null,
    true,
  );

  const m4Inn2Balls = simulateInningsDeliveries({
    matchId: match4Id,
    inningsNumber: 2,
    battingXI: mrtXI,
    bowlingXI: hndXI,
    maxOvers: 20,
    targetRuns: m4Inn1Data.totalRuns + 1,
    startSequence: m4Inn1Balls.length + 1,
    baseTime: new Date(match4Scheduled.getTime() + 7200 * 1000),
  });
  const m4Inn2Data = computeInningData(
    m4Inn2Balls,
    hndXI,
    mrtXI,
    2,
    mrt._id,
    hnd._id,
    match4Id,
    m4Inn1Data.totalRuns + 1,
    true,
  );

  // Set tied scores realistically
  m4Inn2Data.totalRuns = m4Inn1Data.totalRuns;

  const match4 = new MatchModel({
    _id: match4Id,
    matchType: MatchType.LIMITED_OVERS,
    ballsPerOver: 6,
    pitchType: PitchType.MATTING,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Victoria Park Cricket Ground',
      groundName: 'Victoria Park Cricket Ground',
      city: 'Meerut',
    },
    scheduledAt: match4Scheduled,
    status: MatchStatus.COMPLETED,
    createdBy: hndXI[0].userId,
    teamA: createTeamSlot(
      hnd,
      m4Inn1Data.totalRuns,
      m4Inn1Data.totalWickets,
      formatOvers(m4Inn1Data.legalBallsBowled),
    ),
    teamB: createTeamSlot(
      mrt,
      m4Inn2Data.totalRuns,
      m4Inn2Data.totalWickets,
      formatOvers(m4Inn2Data.legalBallsBowled),
    ),
    officials: {
      scorerIds: [hndXI[1].userId],
      scorerId: hndXI[1].userId,
      activeScorerId: hndXI[1].userId,
      umpireIds: [playerSnapshots[24].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {
      wonByTeamId: hnd._id,
      decision: TossDecision.BAT,
    },
    currentInningsNumber: 2,
    result: {
      winnerTeamId: null,
      isTie: true,
      isNoResult: false,
      marginText: 'Match tied',
      playerOfMatchId: mrtXI[0].userId,
    },
    lastSyncedSequence: m4Inn1Balls.length + m4Inn2Balls.length,
  });

  await match4.save();
  await InningModel.insertMany([
    new InningModel(m4Inn1Data),
    new InningModel(m4Inn2Data),
  ]);
  await BallModel.insertMany([...m4Inn1Balls, ...m4Inn2Balls]);

  await TeamModel.findByIdAndUpdate(hnd._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.tied': 1 },
  });
  await TeamModel.findByIdAndUpdate(mrt._id, {
    $inc: { 'stats.matchesPlayed': 1, 'stats.tied': 1 },
  });

  // -------------------------------------------------------------
  // MATCH 5: LIVE (1st Innings: 68/2 in 7.4 ov) - GZB vs KSB
  // Javed Saifi is Captain, Scorer, and currently batting on 28* (16)
  // -------------------------------------------------------------
  console.log('Generating Match 5 (Live): GZB vs KSB (1st Innings 7.4 ov)...');
  const match5Id = new Types.ObjectId();
  const match5Scheduled = new Date(Date.now() - 3600 * 1000 * 2);
  const ksbXI = getXI(ksb);

  const m5Inn1Balls = simulateInningsDeliveries({
    matchId: match5Id,
    inningsNumber: 1,
    battingXI: gzbXI,
    bowlingXI: ksbXI,
    maxOvers: 20,
    cutoffLegalBalls: 46, // 7.4 overs = 46 legal balls
    priorityBatsmanId: PRIMARY_USER.userId,
    baseTime: new Date(match5Scheduled.getTime() + 1200 * 1000),
  });

  const m5Inn1Data = computeInningData(
    m5Inn1Balls,
    gzbXI,
    ksbXI,
    1,
    gzb._id,
    ksb._id,
    match5Id,
    null,
    false, // in progress
  );

  const match5 = new MatchModel({
    _id: match5Id,
    matchType: MatchType.LIMITED_OVERS,
    ballsPerOver: 6,
    pitchType: PitchType.TURF,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Mahamaya Cricket Stadium',
      groundName: 'Mahamaya Cricket Stadium',
      city: 'Ghaziabad',
    },
    scheduledAt: match5Scheduled,
    status: MatchStatus.LIVE,
    createdBy: PRIMARY_USER.userId,
    teamA: createTeamSlot(
      gzb,
      m5Inn1Data.totalRuns,
      m5Inn1Data.totalWickets,
      formatOvers(m5Inn1Data.legalBallsBowled),
    ),
    teamB: createTeamSlot(ksb, 0, 0, '0.0'),
    officials: {
      scorerIds: [PRIMARY_USER.userId],
      scorerId: PRIMARY_USER.userId,
      activeScorerId: PRIMARY_USER.userId,
      umpireIds: [playerSnapshots[30].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {
      wonByTeamId: gzb._id,
      decision: TossDecision.BAT,
    },
    currentInningsNumber: 1,
    result: {},
    lastSyncedSequence: m5Inn1Balls.length,
  });

  await match5.save();
  await InningModel.create(m5Inn1Data);
  await BallModel.insertMany(m5Inn1Balls);

  // -------------------------------------------------------------
  // MATCH 6: LIVE (1st Innings: 122/4 in 13.2 ov) - NOI vs DEL
  // -------------------------------------------------------------
  console.log('Generating Match 6 (Live): NOI vs DEL (1st Innings 13.2 ov)...');
  const match6Id = new Types.ObjectId();
  const match6Scheduled = new Date(Date.now() - 3600 * 1000 * 3);

  const m6Inn1Balls = simulateInningsDeliveries({
    matchId: match6Id,
    inningsNumber: 1,
    battingXI: noiXI,
    bowlingXI: delXI,
    maxOvers: 20,
    cutoffLegalBalls: 80, // 13.2 overs = 80 legal balls
    baseTime: new Date(match6Scheduled.getTime() + 1500 * 1000),
  });

  const m6Inn1Data = computeInningData(
    m6Inn1Balls,
    noiXI,
    delXI,
    1,
    noi._id,
    del._id,
    match6Id,
    null,
    false,
  );

  const match6 = new MatchModel({
    _id: match6Id,
    matchType: MatchType.LIMITED_OVERS,
    ballsPerOver: 6,
    pitchType: PitchType.TURF,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Noida Cricket Stadium, Sector 21A',
      groundName: 'Noida Cricket Stadium, Sector 21A',
      city: 'Noida',
    },
    scheduledAt: match6Scheduled,
    status: MatchStatus.LIVE,
    createdBy: noiXI[0].userId,
    teamA: createTeamSlot(
      noi,
      m6Inn1Data.totalRuns,
      m6Inn1Data.totalWickets,
      formatOvers(m6Inn1Data.legalBallsBowled),
    ),
    teamB: createTeamSlot(del, 0, 0, '0.0'),
    officials: {
      scorerIds: [noiXI[1].userId],
      scorerId: noiXI[1].userId,
      activeScorerId: noiXI[1].userId,
      umpireIds: [playerSnapshots[32].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {
      wonByTeamId: noi._id,
      decision: TossDecision.BAT,
    },
    currentInningsNumber: 1,
    result: {},
    lastSyncedSequence: m6Inn1Balls.length,
  });

  await match6.save();
  await InningModel.create(m6Inn1Data);
  await BallModel.insertMany(m6Inn1Balls);

  // -------------------------------------------------------------
  // MATCH 7: LIVE (2nd Innings Chase: VSH 163/6 vs IDR 95/3 in 11.5 ov)
  // Target: 164
  // -------------------------------------------------------------
  console.log('Generating Match 7 (Live): VSH vs IDR (2nd Innings Chase)...');
  const match7Id = new Types.ObjectId();
  const match7Scheduled = new Date(Date.now() - 3600 * 1000 * 4);

  // Innings 1: VSH completed 20 overs
  const m7Inn1Balls = simulateInningsDeliveries({
    matchId: match7Id,
    inningsNumber: 1,
    battingXI: vshXI,
    bowlingXI: idrXI,
    maxOvers: 20,
    baseTime: new Date(match7Scheduled.getTime() + 1800 * 1000),
  });
  const m7Inn1Data = computeInningData(
    m7Inn1Balls,
    vshXI,
    idrXI,
    1,
    vsh._id,
    idr._id,
    match7Id,
    null,
    true,
  );

  // Innings 2: IDR chasing, live at 11.5 ov (71 legal balls)
  const m7Inn2Balls = simulateInningsDeliveries({
    matchId: match7Id,
    inningsNumber: 2,
    battingXI: idrXI,
    bowlingXI: vshXI,
    maxOvers: 20,
    targetRuns: m7Inn1Data.totalRuns + 1,
    cutoffLegalBalls: 71, // 11.5 overs
    startSequence: m7Inn1Balls.length + 1,
    baseTime: new Date(match7Scheduled.getTime() + 7200 * 1000),
  });
  const m7Inn2Data = computeInningData(
    m7Inn2Balls,
    vshXI,
    idrXI,
    2,
    idr._id,
    vsh._id,
    match7Id,
    m7Inn1Data.totalRuns + 1,
    false, // in progress
  );

  const match7 = new MatchModel({
    _id: match7Id,
    matchType: MatchType.LIMITED_OVERS,
    ballsPerOver: 6,
    pitchType: PitchType.CEMENT,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'RPS Cricket Ground, Indirapuram',
      groundName: 'RPS Cricket Ground, Indirapuram',
      city: 'Ghaziabad',
    },
    scheduledAt: match7Scheduled,
    status: MatchStatus.LIVE,
    createdBy: PRIMARY_USER.userId,
    teamA: createTeamSlot(
      vsh,
      m7Inn1Data.totalRuns,
      m7Inn1Data.totalWickets,
      formatOvers(m7Inn1Data.legalBallsBowled),
    ),
    teamB: createTeamSlot(
      idr,
      m7Inn2Data.totalRuns,
      m7Inn2Data.totalWickets,
      formatOvers(m7Inn2Data.legalBallsBowled),
    ),
    officials: {
      scorerIds: [PRIMARY_USER.userId],
      scorerId: PRIMARY_USER.userId,
      activeScorerId: PRIMARY_USER.userId,
      umpireIds: [playerSnapshots[34].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {
      wonByTeamId: vsh._id,
      decision: TossDecision.BAT,
    },
    currentInningsNumber: 2,
    result: {},
    lastSyncedSequence: m7Inn1Balls.length + m7Inn2Balls.length,
  });

  await match7.save();
  await InningModel.insertMany([
    new InningModel(m7Inn1Data),
    new InningModel(m7Inn2Data),
  ]);
  await BallModel.insertMany([...m7Inn1Balls, ...m7Inn2Balls]);

  // -------------------------------------------------------------
  // MATCH 8: SCHEDULED - Ghaziabad Strikers vs Raj Nagar Renegades
  // Tomorrow morning at 09:30 AM
  // -------------------------------------------------------------
  console.log('Generating Match 8 (Scheduled): GZB vs RNR...');
  const match8Id = new Types.ObjectId();
  const match8Scheduled = new Date(Date.now() + 86400 * 1000);
  match8Scheduled.setHours(9, 30, 0, 0);

  const match8 = new MatchModel({
    _id: match8Id,
    matchType: MatchType.LIMITED_OVERS,
    ballsPerOver: 6,
    pitchType: PitchType.TURF,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Jawaharlal Nehru Cricket Complex',
      groundName: 'Jawaharlal Nehru Cricket Complex',
      city: 'Ghaziabad',
    },
    scheduledAt: match8Scheduled,
    status: MatchStatus.SCHEDULED,
    createdBy: PRIMARY_USER.userId,
    teamA: createTeamSlot(gzb, 0, 0, '0.0'),
    teamB: createTeamSlot(rnr, 0, 0, '0.0'),
    officials: {
      scorerIds: [PRIMARY_USER.userId],
      scorerId: PRIMARY_USER.userId,
      activeScorerId: PRIMARY_USER.userId,
      umpireIds: [playerSnapshots[36].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {},
    currentInningsNumber: 1,
    result: {},
    lastSyncedSequence: 0,
  });
  await match8.save();

  // -------------------------------------------------------------
  // MATCH 9: SCHEDULED - Delhi Capitals XI vs NCR Challengers
  // In 3 days at 02:00 PM
  // -------------------------------------------------------------
  console.log('Generating Match 9 (Scheduled): DEL vs NCR...');
  const match9Id = new Types.ObjectId();
  const match9Scheduled = new Date(Date.now() + 86400 * 1000 * 3);
  match9Scheduled.setHours(14, 0, 0, 0);

  const match9 = new MatchModel({
    _id: match9Id,
    matchType: MatchType.PAIR_CRICKET,
    ballsPerOver: 6,
    pitchType: PitchType.ROUGH,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Karnail Singh Stadium',
      groundName: 'Karnail Singh Stadium',
      city: 'Delhi',
    },
    scheduledAt: match9Scheduled,
    status: MatchStatus.SCHEDULED,
    createdBy: delXI[0].userId,
    teamA: createTeamSlot(del, 0, 0, '0.0'),
    teamB: createTeamSlot(ncr, 0, 0, '0.0'),
    officials: {
      scorerIds: [delXI[1].userId],
      scorerId: delXI[1].userId,
      activeScorerId: delXI[1].userId,
      umpireIds: [playerSnapshots[38].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {},
    currentInningsNumber: 1,
    result: {},
    lastSyncedSequence: 0,
  });
  await match9.save();

  // -------------------------------------------------------------
  // MATCH 10: SCHEDULED - Yamuna Warriors vs Gurugram Titans
  // This Saturday at 10:00 AM
  // -------------------------------------------------------------
  console.log('Generating Match 10 (Scheduled): YMN vs GGN...');
  const match10Id = new Types.ObjectId();
  const match10Scheduled = new Date(Date.now() + 86400 * 1000 * 5);
  match10Scheduled.setHours(10, 0, 0, 0);

  const match10 = new MatchModel({
    _id: match10Id,
    matchType: MatchType.TEST_MATCH,
    ballsPerOver: 6,
    pitchType: PitchType.TURF,
    oversPerInnings: 20,
    ballType: BallType.LEATHER,
    venue: {
      ground: 'Tau Devi Lal Cricket Stadium',
      groundName: 'Tau Devi Lal Cricket Stadium',
      city: 'Gurugram',
    },
    scheduledAt: match10Scheduled,
    status: MatchStatus.SCHEDULED,
    createdBy: getXI(ymn)[0].userId,
    teamA: createTeamSlot(ymn, 0, 0, '0.0'),
    teamB: createTeamSlot(ggn, 0, 0, '0.0'),
    officials: {
      scorerIds: [getXI(ymn)[1].userId],
      scorerId: getXI(ymn)[1].userId,
      activeScorerId: getXI(ymn)[1].userId,
      umpireIds: [playerSnapshots[40].userId],
      liveStreamerIds: [],
      commentatorIds: [],
    },
    toss: {},
    currentInningsNumber: 1,
    result: {},
    lastSyncedSequence: 0,
  });
  await match10.save();

  // -------------------------------------------------------------
  // 4. Verification and Summary
  // -------------------------------------------------------------
  console.log('\n====================================================');
  console.log('              SEEDING VERIFICATION                  ');
  console.log('====================================================');

  const [teamCount, memberCount, matchCount, inningCount, ballCount] =
    await Promise.all([
      TeamModel.countDocuments(),
      TeamMemberModel.countDocuments(),
      MatchModel.countDocuments(),
      InningModel.countDocuments(),
      BallModel.countDocuments(),
    ]);

  console.log(`Teams Total:        ${teamCount}`);
  console.log(`Team Members Total: ${memberCount}`);
  console.log(`Matches Total:      ${matchCount}`);
  console.log(`Innings Total:      ${inningCount}`);
  console.log(`Balls Total:        ${ballCount}`);

  // Query Javed's teams and matches
  const javedTeams = await TeamModel.find({ ownerId: PRIMARY_USER.userId }).lean();
  console.log(`\nJaved Saifi Owned Teams (${javedTeams.length}):`);
  for (const jt of javedTeams) {
    const memberBreakdown = await TeamMemberModel.aggregate([
      { $match: { teamId: jt._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    console.log(` - ${jt.name} (${jt.shortName}): Active count = ${jt.activeMemberCount}`);
    for (const b of memberBreakdown) {
      console.log(`     * ${b._id}: ${b.count}`);
    }
  }

  const liveMatches = await MatchModel.find({ status: MatchStatus.LIVE }).lean();
  console.log(`\nLive Matches (${liveMatches.length}):`);
  for (const lm of liveMatches) {
    console.log(` - ${lm.teamA.name} (${lm.teamA.runs}/${lm.teamA.wickets} in ${lm.teamA.oversText} ov) vs ${lm.teamB.name} (${lm.teamB.runs}/${lm.teamB.wickets} in ${lm.teamB.oversText} ov) [Status: ${lm.status}]`);
  }

  // 5. Cleanup manifest
  if (fs.existsSync(manifestPath)) {
    console.log(`\nRemoving manifest file ${manifestPath}...`);
    fs.unlinkSync(manifestPath);
    console.log('Manifest file removed successfully.');
  }

  await mongoose.disconnect();
  console.log('\nSeeding completed successfully with 100% integrity!');
}

run().catch((err) => {
  console.error('Seeding failed with error:', err);
  process.exit(1);
});
