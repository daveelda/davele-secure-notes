export type NoteColor =
  | "default"
  | "amber"
  | "emerald"
  | "sky"
  | "violet"
  | "rose"
  | "slate";

export type NoteAttachment = {
  id: number;
  note_id: number;
  file_name: string;
  file_size: number;
  file_type: string;
  storage_path: string;
  created_at: string;
};

export type Note = {
  id: number;
  user_id?: string;
  title: string;
  body: string;
  color: NoteColor;
  is_pinned: boolean;
  is_favorite: boolean;
  is_archived: boolean;
  reminder_at?: string | null;
  share_token?: string | null;
  share_enabled?: boolean;
  attachments?: NoteAttachment[];
  created_at: string;
  updated_at: string;
};

export type ViewFilter =
  | "all"
  | "pinned"
  | "favorites"
  | "archive"
  | "reminders";

export type SortOption =
  | "updated_desc"
  | "updated_asc"
  | "created_desc"
  | "created_asc"
  | "title_asc"
  | "title_desc";
