import * as React from "react";
import StudyTimeStatisticsPlugin from "../../main";
import I18n from "../../language/i18n";
import {FEEDBACK_LINKS} from "../../util/feedbackLinks";

interface FeedbackOptionProps {
	title: string;
	description: string;
	action: string;
	href: string;
}

function FeedbackOption({title, description, action, href}: FeedbackOptionProps) {
	return <section className="study-feedback-card">
		<div><h3>{title}</h3><p>{description}</p></div>
		<a className="study-feedback-action" href={href} target="_blank" rel="noreferrer">{action}</a>
	</section>;
}

export function FeedbackView({plugin}: {plugin: StudyTimeStatisticsPlugin}) {
	return <div className="study-feedback-view">
		<header className="study-feedback-header">
			<h2>{I18n.t("feedbackTitle")}</h2>
			<p>{I18n.t("feedbackDescription")}</p>
			<span>{I18n.t("feedbackVersion", {version: plugin.manifest.version})}</span>
		</header>
		<div className="study-feedback-options">
			<FeedbackOption title={I18n.t("feedbackBugTitle")} description={I18n.t("feedbackBugDesc")} action={I18n.t("feedbackBugAction")} href={FEEDBACK_LINKS.bug} />
			<FeedbackOption title={I18n.t("feedbackAccuracyTitle")} description={I18n.t("feedbackAccuracyDesc")} action={I18n.t("feedbackAccuracyAction")} href={FEEDBACK_LINKS.accuracy} />
			<FeedbackOption title={I18n.t("feedbackFeatureTitle")} description={I18n.t("feedbackFeatureDesc")} action={I18n.t("feedbackFeatureAction")} href={FEEDBACK_LINKS.feature} />
			<FeedbackOption title={I18n.t("feedbackDiscussionTitle")} description={I18n.t("feedbackDiscussionDesc")} action={I18n.t("feedbackDiscussionAction")} href={FEEDBACK_LINKS.discussions} />
		</div>
		<section className="study-feedback-privacy">
			<h3>{I18n.t("feedbackPrivacyTitle")}</h3>
			<p>{I18n.t("feedbackPrivacyDesc")}</p>
			<ul>
				<li>{I18n.t("feedbackPrivacyNames")}</li>
				<li>{I18n.t("feedbackPrivacyData")}</li>
				<li>{I18n.t("feedbackPrivacySubmit")}</li>
			</ul>
		</section>
	</div>;
}
