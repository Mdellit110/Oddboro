-- Gmail and Google Drive, served by the office itself (`builtin`), signed in
-- with New Altitude's Google client. Every office gets both in its catalog;
-- an Odd asks for one, and the owner signs in from the desk. `google` says
-- which product a row serves: a further account of one is a row of its own.
INSERT INTO "connectors" ("id", "name", "description", "kind", "config")
VALUES
	('gmail', 'Gmail', 'Search, read, label, draft and send mail in the owner''s Gmail.', 'builtin', '{"oauth":"google","google":"gmail"}'),
	('google-drive', 'Google Drive', 'Find and read files in the owner''s Google Drive, and write Docs and Sheets.', 'builtin', '{"oauth":"google","google":"drive"}')
ON CONFLICT ("id") DO NOTHING;
