CREATE TABLE `movements` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`request_id` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`,`product_id`) REFERENCES `products`(`workspace_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_movements_delta" CHECK("movements"."delta" != 0 AND abs("movements"."delta") <= 999999 AND typeof("movements"."delta") = 'integer'),
	CONSTRAINT "ck_movements_reason" CHECK(length("movements"."reason") BETWEEN 2 AND 200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_movements_workspace_request` ON `movements` (`workspace_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `idx_movements_workspace_product` ON `movements` (`workspace_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`request_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`reorder_point` integer NOT NULL,
	`initial_quantity` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_products_threshold" CHECK("products"."reorder_point" BETWEEN 0 AND 999999 AND typeof("products"."reorder_point") = 'integer'),
	CONSTRAINT "ck_products_initial" CHECK("products"."initial_quantity" BETWEEN 0 AND 999999 AND typeof("products"."initial_quantity") = 'integer')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_products_workspace_sku` ON `products` (`workspace_id`,`sku`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_products_workspace_request` ON `products` (`workspace_id`,`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_products_workspace_id` ON `products` (`workspace_id`,`id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
