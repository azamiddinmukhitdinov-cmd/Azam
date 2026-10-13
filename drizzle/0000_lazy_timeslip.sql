CREATE TABLE `date_responses` (
	`invitation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`respondent_email` text NOT NULL,
	`cuisines_json` text NOT NULL,
	`wishes` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`invitation_id`, `user_id`)
);
