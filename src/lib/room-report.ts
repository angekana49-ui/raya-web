export type StudyRoomReport = {
  id?: string;
  room_id?: string;
  conversation_id?: string;
  summary: string;
  squad_score: number;
  key_learnings?: string | null;
  highlights?: string[] | null;
  recommendations?: string | null;
  created_at?: string;
};

type RoomTranscriptLine = {
  sender: string;
  text: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function cleanHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, ""))
    .filter(Boolean)
    .slice(0, 4);
}

function clampScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function normalizeStudyRoomReport(input: Partial<StudyRoomReport>): StudyRoomReport {
  const highlights = cleanHighlights(input.highlights);

  return {
    room_id: input.room_id,
    conversation_id: input.conversation_id,
    summary: cleanText(input.summary, "The squad completed a shared study session and produced a final room summary."),
    squad_score: clampScore(input.squad_score),
    key_learnings: cleanText(input.key_learnings, "The team clarified the mission and moved the session forward together."),
    highlights: highlights.length > 0 ? highlights : [
      "The room stayed focused on the mission.",
      "Members contributed explanations or clarifications.",
    ],
    recommendations: cleanText(input.recommendations, "Review the strongest explanation again and carry it into the next session."),
    created_at: input.created_at,
  };
}

export function buildFallbackStudyRoomReport(input: {
  roomId: string;
  conversationId: string;
  mission: string;
  transcriptLines: RoomTranscriptLine[];
}): StudyRoomReport {
  const nonEmptyLines = input.transcriptLines
    .map((line) => ({
      sender: cleanText(line.sender, "member"),
      text: cleanText(line.text, ""),
    }))
    .filter((line) => line.text.length > 0);

  const participantTurns = nonEmptyLines.filter((line) => line.sender.toLowerCase() !== "assistant").length;
  const assistantTurns = nonEmptyLines.length - participantTurns;
  const coverageRatio = Math.min(1, nonEmptyLines.length / 12);
  const balanceBonus = participantTurns > 0 ? Math.min(20, participantTurns * 4) : 0;
  const supportBonus = Math.min(15, assistantTurns * 3);
  const squadScore = Math.max(35, Math.min(92, Math.round(40 + coverageRatio * 25 + balanceBonus + supportBonus)));

  const firstUsefulLine = nonEmptyLines.find((line) => line.sender.toLowerCase() !== "assistant")?.text
    ?? nonEmptyLines[0]?.text
    ?? input.mission;

  const latestUsefulLine = [...nonEmptyLines].reverse().find((line) => line.text.length > 0)?.text
    ?? input.mission;

  return normalizeStudyRoomReport({
    room_id: input.roomId,
    conversation_id: input.conversationId,
    summary: `The squad worked through the room mission together and closed the session with a usable shared understanding. The room produced ${nonEmptyLines.length} meaningful turns across members and Raya.`,
    squad_score: squadScore,
    key_learnings: `The clearest thread from the session was: ${firstUsefulLine.slice(0, 220)}${firstUsefulLine.length > 220 ? "..." : ""}`,
    highlights: [
      `Mission focus: ${cleanText(input.mission, "Shared mission").slice(0, 120)}`,
      `Strong closing moment: ${latestUsefulLine.slice(0, 120)}${latestUsefulLine.length > 120 ? "..." : ""}`,
      participantTurns > 0
        ? `Member participation stayed active with ${participantTurns} participant turns.`
        : "Raya carried most of the visible structure in this session.",
    ],
    recommendations: "Turn the strongest explanation from this room into a short recap, then reopen the topic with one follow-up question next session.",
  });
}

export function buildRoomReportHtml(input: {
  roomName: string;
  mission: string;
  report: StudyRoomReport;
}): string {
  const highlights = Array.isArray(input.report.highlights) ? input.report.highlights : [];
  const createdAt = input.report.created_at
    ? new Date(input.report.created_at).toLocaleString()
    : new Date().toLocaleString();

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.roomName)} - Squad Report</title>
    <style>
      :root {
        color-scheme: light;
        --ink: #0f172a;
        --muted: #475569;
        --line: #dbe4f0;
        --panel: #f8fafc;
        --brand: #2563eb;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background: white;
      }
      .page {
        max-width: 840px;
        margin: 0 auto;
        padding: 32px 24px 48px;
      }
      .hero {
        border: 1px solid var(--line);
        background: linear-gradient(135deg, #eff6ff, #ffffff);
        padding: 24px;
        border-radius: 18px;
      }
      .eyebrow {
        font: 700 11px/1.2 Arial, sans-serif;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--brand);
        margin: 0 0 10px;
      }
      h1 {
        margin: 0;
        font-size: 30px;
        line-height: 1.1;
      }
      .meta {
        margin-top: 12px;
        color: var(--muted);
        font: 600 13px/1.5 Arial, sans-serif;
      }
      .score {
        display: inline-block;
        margin-top: 16px;
        padding: 8px 12px;
        border-radius: 999px;
        background: #dbeafe;
        color: #1d4ed8;
        font: 700 13px/1 Arial, sans-serif;
      }
      section {
        margin-top: 22px;
        border: 1px solid var(--line);
        border-radius: 18px;
        padding: 18px 20px;
        background: var(--panel);
      }
      h2 {
        margin: 0 0 10px;
        font-size: 18px;
      }
      p, li {
        font-size: 15px;
        line-height: 1.65;
      }
      ul {
        margin: 0;
        padding-left: 20px;
      }
      .footer {
        margin-top: 24px;
        color: var(--muted);
        font: 600 12px/1.5 Arial, sans-serif;
        text-align: center;
      }
      @media print {
        body { background: white; }
        .page { padding: 0; }
        section, .hero { break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="hero">
        <p class="eyebrow">RAYA Squad Report</p>
        <h1>${escapeHtml(input.roomName)}</h1>
        <div class="meta">
          <div><strong>Mission:</strong> ${escapeHtml(input.mission)}</div>
          <div><strong>Generated:</strong> ${escapeHtml(createdAt)}</div>
        </div>
        <div class="score">Squad Score: ${Number(input.report.squad_score || 0)}/100</div>
      </header>

      <section>
        <h2>Session Summary</h2>
        <p>${escapeHtml(input.report.summary || "No summary available.")}</p>
      </section>

      <section>
        <h2>Key Learnings</h2>
        <p>${escapeHtml(input.report.key_learnings || "No key learnings were captured.")}</p>
      </section>

      <section>
        <h2>Highlights</h2>
        <ul>
          ${highlights.length > 0
            ? highlights.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")
            : "<li>No highlights were captured.</li>"}
        </ul>
      </section>

      <section>
        <h2>Recommendations</h2>
        <p>${escapeHtml(input.report.recommendations || "No recommendations available.")}</p>
      </section>

      <p class="footer">Generated by RAYA for study room review and PDF export.</p>
    </main>
  </body>
</html>`;
}
