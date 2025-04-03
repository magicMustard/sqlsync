ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_operating_hours_check;

ALTER TABLE public.profiles
	ADD CONSTRAINT profiles_operating_hours_check
	CHECK (
		extensions.jsonb_matches_schema(
			'{
				"$schema": "http://json-schema.org/draft-07/schema#",
				"type": "object",
				"properties": {
					"operating_hours": {
						"type": "array",
						"minItems": 7,
						"maxItems": 7,
						"items": {
							"type": "array",
							"items": {
								"type": "string"
							}
						}
					}
				},
				"required": ["operating_hours"],
				"additionalProperties": false
			}',
			operating_hours
		)
	);