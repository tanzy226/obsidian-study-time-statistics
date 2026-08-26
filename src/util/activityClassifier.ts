import {StudySession, StudySessionEngagement} from "../interface/studySession";

export function classifySessionEngagement(session: Pick<StudySession, "duration" | "interactionCount" | "firstInteractionAt" | "lastInteractionAt">): StudySessionEngagement {
	const count = session.interactionCount ?? 0;
	const interactionSpan = Math.max(0, (session.lastInteractionAt ?? 0) - (session.firstInteractionAt ?? 0));
	if (count >= 3) return "interactive";
	if (count >= 2 && interactionSpan >= 60_000) return "quiet-study";
	if (session.duration >= 5 * 60_000 && count === 0) return "uncertain";
	return "unclassified";
}
