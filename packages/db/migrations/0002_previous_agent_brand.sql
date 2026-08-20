CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prompt_id" text,
	"profile" text NOT NULL,
	"model" text NOT NULL,
	"quality" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_cents" numeric(14, 6),
	"cost_source" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"ok" boolean NOT NULL,
	"error_code" text
);
