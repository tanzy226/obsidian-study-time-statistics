import type {StudySession} from "../interface/studySession";

export interface TrackingPrecisionSettings {
	idleTimeoutMinutes: number;
	minimumSessionSeconds: number;
}

export const DEFAULT_TRACKING_PRECISION: TrackingPrecisionSettings = {
	idleTimeoutMinutes: 20,
	minimumSessionSeconds: 0
};

export function normalizeTrackingPrecision(value: Partial<TrackingPrecisionSettings>): TrackingPrecisionSettings {
	return {
		idleTimeoutMinutes: Math.min(120, Math.max(0, Math.round(value.idleTimeoutMinutes ?? DEFAULT_TRACKING_PRECISION.idleTimeoutMinutes))),
		minimumSessionSeconds: Math.min(300, Math.max(0, Math.round(value.minimumSessionSeconds ?? DEFAULT_TRACKING_PRECISION.minimumSessionSeconds)))
	};
}

export function isIdle(lastInteractionAt: number, now: number, idleTimeoutMinutes: number): boolean {
	return idleTimeoutMinutes > 0 && now - lastInteractionAt >= idleTimeoutMinutes * 60_000;
}

export function shouldKeepSession(session: StudySession, minimumSessionSeconds: number): boolean {
	return session.source === "manual" || session.duration >= minimumSessionSeconds * 1_000;
}
