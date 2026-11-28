export type DataSafetyReason = "invalid-snapshot" | "future-version" | "unreadable" | "ambiguous" | "changed" | "write";

export class DataSafetyError extends Error {
	constructor(readonly reason: DataSafetyReason, readonly originalError?: unknown) {
		super(reason);
	}
}
