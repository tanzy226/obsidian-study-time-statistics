export type StudySessionSource = "automatic" | "manual";

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
}
