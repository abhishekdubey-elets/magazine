CREATE TABLE "activity" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "activity_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "ai_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"article_id" text NOT NULL,
	"action" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"output" jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"usage" jsonb,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "article_versions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"article_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"publication_id" text,
	"status" text,
	CONSTRAINT "articles_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "assets_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text,
	"user_email" text,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"summary" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"publication_id" text,
	CONSTRAINT "export_jobs_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "font_files" (
	"key" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"etag" text,
	"size" integer,
	"faces" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"parsed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "indesign_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"kind" text NOT NULL,
	"adobe_job_id" text,
	"job_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"release_status" text DEFAULT 'none' NOT NULL,
	"pages" jsonb NOT NULL,
	"gates" jsonb,
	"report" jsonb,
	"outputs" jsonb,
	"error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"released_by" text,
	"released_at" timestamp with time zone,
	"release_note" text
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb,
	"settings_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"publication_id" text,
	CONSTRAINT "pages_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "publications_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "qa_runs" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "qa_runs_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "reference_profiles" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "reference_profiles_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"seq" bigserial NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "templates_org_id_id_pk" PRIMARY KEY("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"picture" text,
	"role" text DEFAULT 'contributor' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "activity_org_updated_idx" ON "activity" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_article_idx" ON "ai_suggestions" USING btree ("article_id","created_at");--> statement-breakpoint
CREATE INDEX "article_versions_article_idx" ON "article_versions" USING btree ("article_id","version");--> statement-breakpoint
CREATE INDEX "articles_org_updated_idx" ON "articles" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "assets_org_updated_idx" ON "assets" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "audit_org_at_idx" ON "audit_log" USING btree ("org_id","at");--> statement-breakpoint
CREATE INDEX "export_jobs_org_updated_idx" ON "export_jobs" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "indesign_jobs_pub_idx" ON "indesign_jobs" USING btree ("publication_id","created_at");--> statement-breakpoint
CREATE INDEX "indesign_jobs_status_idx" ON "indesign_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pages_org_updated_idx" ON "pages" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "publications_org_updated_idx" ON "publications" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "qa_runs_org_updated_idx" ON "qa_runs" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "reference_profiles_org_updated_idx" ON "reference_profiles" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE INDEX "templates_org_updated_idx" ON "templates" USING btree ("org_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");