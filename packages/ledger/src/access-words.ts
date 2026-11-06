// The words for access, in one place: the owner's permission levels, and how
// the owner and an Odd read a level, a grant and a folder, and the name of the
// tab where the owner sets an Odd's access. The page imports
// this, so it imports nothing.

/** The owner's permission levels, lowest first. */
export const LEVELS = ['read', 'draft', 'act'] as const;
export type Level = (typeof LEVELS)[number];
export const levelAtMost = (a: Level, b: Level): boolean => LEVELS.indexOf(a) <= LEVELS.indexOf(b);
/** `v` when it names a level, for a request body or a tool input. */
export const parseLevel = (v: unknown): Level | undefined => LEVELS.find((l) => l === v);
/** What the owner reads for each level. */
export const LEVEL_LABEL: Record<Level, string> = {
  read: 'Reads and reports',
  draft: 'Drafts for your yes',
  act: 'Acts on its own'
};
/** What the Odd reads for each level. */
export const LEVEL_NAME: Record<Level, string> = { read: 'Read', draft: 'Draft', act: 'Act' };
/** A grant to an outside tool is read or act. */
export type GrantLevel = Extract<Level, 'read' | 'act'>;
/** What the owner reads for a grant level; the Odd reads the same words in lower case. */
export const GRANT_LABEL: Record<GrantLevel, string> = { read: 'Read only', act: 'Read and write' };
/** A folder the owner gives is read, or read and changed (`write`). */
export type FolderAccess = 'read' | 'write';
/** What the owner reads for a folder level. */
export const FOLDER_LABEL: Record<FolderAccess, string> = {
  read: 'Can read',
  write: 'Can read and change'
};
/** What the Odd reads for a folder level. */
export const FOLDER_SAID: Record<FolderAccess, string> = {
  read: 'read only',
  write: 'read and change'
};

/**
 * The name of the Odd card's tab that holds its switches, folders and tools.
 * The card shows it and the Odds are told it, so a rename reaches both.
 */
export const SETTINGS_TAB = 'Settings';
/** That tab in a sentence, by whose card it is on: "your", "Rowan's", "this Odd's". */
export const settingsTab = (whose: string): string => `${whose} ${SETTINGS_TAB} tab`;
