ALTER TABLE pets ADD COLUMN IF NOT EXISTS code TEXT;

UPDATE pets
SET code = CASE
  WHEN name ~ '^[^ ]+ \([^)]+\)$'
    THEN 'habitica_' || lower(regexp_replace(name, '^([^ ]+) \(([^)]+)\)$', '\1_\2'))
  ELSE lower(regexp_replace(name, '[^[:alnum:]]+', '_', 'g'))
END
WHERE code IS NULL;

WITH duplicate_codes AS (
  SELECT id, code, row_number() OVER (PARTITION BY code ORDER BY id) AS position
  FROM pets
  WHERE code IS NOT NULL
)
UPDATE pets
SET code = duplicate_codes.code || '_' || pets.id
FROM duplicate_codes
WHERE pets.id = duplicate_codes.id AND duplicate_codes.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pets_code
  ON pets (code);
