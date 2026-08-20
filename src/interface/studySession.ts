export type StudySessionSource = "automatic" | "manual";
export type StudySessionEngagement = "interactive" | "quiet-study" | "uncertain" | "unclassified";

export interface StudySession {
	id: string;
	fileId: string;
	filePath: string;
	openedAt: number;
	closedAt: number;
	duration: number;
	source: StudySessionSource;
	createdAt: number;
	updatedAt: number;
	interactionCount?: number;
	firstInteractionAt?: number;
	lastInteractionAt?: number;
	engagement?: StudySessionEngagement;
}
