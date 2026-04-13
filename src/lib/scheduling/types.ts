export type SchedulingStatus = 'collecting' | 'polling' | 'resolved';

export interface SchedulingRequest {
	id: string;
	organizer_did: string;
	title: string;
	date_start: string;
	date_end: string;
	time_start: string;
	time_end: string;
	organizer_tz: string;
	slot_minutes: number;
	duration_minutes: number;
	status: SchedulingStatus;
	poll_options: string | null; // JSON: Array<{ start: string; end: string }>
	event_uri: string | null;
	created_at: string;
}

export interface PollOption {
	start: string; // UTC ISO
	end: string; // UTC ISO
}

export interface SlotCount {
	slot_start: string;
	count: number;
}

export interface CandidateWindow {
	start: string;
	end: string;
	count: number;
	participants: string[];
}

export interface PollVoteSummary {
	option_index: number;
	count: number;
	voters: string[];
}
