CREATE TABLE `pad_auth` (
	`pad_id` text PRIMARY KEY,
	`password_salt` blob NOT NULL,
	`password_verifier` blob NOT NULL,
	CONSTRAINT `fk_pad_auth_pad_id_pads_id_fk` FOREIGN KEY (`pad_id`) REFERENCES `pads`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `pads` (
	`id` text PRIMARY KEY,
	`content` text NOT NULL,
	`content_bytes` integer NOT NULL,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pads_updated_at_idx` ON `pads` (`updated_at`);