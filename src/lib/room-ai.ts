type RoomMode = 'active' | 'passive';

const ROOM_INVOCATION_PATTERNS = [
  /@raya\b/i,
  /\braya ai\b/i,
  /\bthe ai\b/i,
  /\bl['’]ia\b/i,
  /\braya\b/i,
];

function normalizeRoomMode(mode: string | undefined): RoomMode {
  return mode === 'passive' ? 'passive' : 'active';
}

export function isExplicitRoomInvocation(userMessage: string): boolean {
  return ROOM_INVOCATION_PATTERNS.some((pattern) => pattern.test(userMessage));
}

export function buildRoomPrompt(input: {
  mission: string;
  mode?: string;
  userMessage: string;
  actionType?: string;
  healthIntervention?: boolean;
  studentContext?: string;
  /** From study_rooms.timer_status at request time (running | idle | finished). */
  timerStatus?: string;
  maxMembers?: number;
  onlineCount?: number;
}): string {
  const mode = normalizeRoomMode(input.mode);
  const normalizedAction = typeof input.actionType === 'string'
    ? input.actionType.trim().toLowerCase()
    : 'normal';
  const isMentioned = isExplicitRoomInvocation(input.userMessage);
  const compactStudentContext = typeof input.studentContext === 'string'
    ? input.studentContext.trim()
    : '';
  const timer = typeof input.timerStatus === 'string' ? input.timerStatus.trim().toLowerCase() : 'unknown';
  const cap =
    typeof input.maxMembers === 'number' && Number.isFinite(input.maxMembers)
      ? String(input.maxMembers)
      : 'unknown';
  const occ =
    typeof input.onlineCount === 'number' && Number.isFinite(input.onlineCount)
      ? String(input.onlineCount)
      : 'unknown';

  return `
## 14. ROOM CONTEXT - INJECTED EACH SESSION

[ROOM MISSION — PRIMARY ANCHOR]
${input.mission.trim()}
Every reply must advance, clarify, or protect THIS mission. Do not drift into unrelated subjects, new syllabi, or generic tutoring unless the group explicitly agrees to repivot on-mission.

[SESSION / TIMER]
- Timer status: ${timer}
- Treat this as a LIVE group session while the timer is running; when finished, you would only help with read-only wrap-up (if ever shown — normally requests stop earlier).
- Room capacity signal: ~${occ} online (cap ${cap} seats). Speak to the whole squad; avoid turning the room into a 1:1 lesson unless someone is stuck on the shared mission.

[ROOM STATE]
- Current mode: ${mode.toUpperCase()}
- Action type: ${normalizedAction}
- Explicit invocation detected: ${isMentioned ? 'yes' : 'no'}
- Health intervention flag: ${input.healthIntervention ? 'yes' : 'no'}

[ROOM RESPONSE CONTRACT]
- Shared room, not solo chat. Keep interventions short unless the mission needs depth.
- ACTIVE: proactively unblock, summarize, and rebalance talk time — always tied to the mission or collaboration on the mission.
- PASSIVE: default to brief, surgical replies; expand only when the user clearly invokes you / the AI, uses a room action, or the group is derailing the mission.
- If the topic drifts, name it and offer ONE concrete path back to the mission.
- If tension rises, arbitrate calmly; separate people from ideas.

[LATEST ROOM MESSAGE]
${input.userMessage.trim()}

${compactStudentContext ? `[OPTIONAL USER CONTEXT]\n${compactStudentContext}` : ''}
  `.trim();
}
