-- sqlsync: declarativeTable:true
-- Table: system_config
CREATE TABLE public.system_config (
	"id" uuid NOT NULL DEFAULT uuid_generate_v4(),
	"key" text NOT NULL,
	"value" jsonb,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"description" text,
	"last_modified_by" text,
	PRIMARY KEY ("id"),
	UNIQUE ("key")
);
