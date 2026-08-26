export interface ReadingProgressEntry {
	id: string;
	fileId: string;
	filePath: string;
	percent: number;
	recordedAt: number;
	characterCount: number;
	activeDuration: number;
	createdAt: number;
	updatedAt: number;
}

export interface ReadingProgressInput {
	fileId: string;
	filePath: string;
	percent: number;
	recordedAt: number;
	characterCount: number;
	activeDuration: number;
}
