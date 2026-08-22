const REPOSITORY_URL = "https://github.com/tanzy226/obsidian-study-time-statistics";

export const FEEDBACK_LINKS = {
	bug: `${REPOSITORY_URL}/issues/new?template=bug_report.yml`,
	accuracy: `${REPOSITORY_URL}/issues/new?template=data_accuracy.yml`,
	feature: `${REPOSITORY_URL}/issues/new?template=feature_request.yml`,
	discussions: `${REPOSITORY_URL}/discussions`
} as const;
