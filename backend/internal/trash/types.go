package trash

import "time"

type TrashItem struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	OwnerID   string    `json:"owner_id"`
	ParentID  *string   `json:"parent_id,omitempty"`
	Size      int64     `json:"size"`
	DeletedAt time.Time `json:"deleted_at"`
}

type TrashListResponse struct {
	Items           []TrashItem `json:"items"`
	TotalSize       int64       `json:"total_size"`
	Count           int         `json:"count"`
	NextFilesCursor *string     `json:"next_files_cursor,omitempty"`
	NextDirsCursor  *string     `json:"next_dirs_cursor,omitempty"`
}

type ClearTrashRequest struct {
	ItemIDs []string `json:"item_ids"`
}

type TrashPaginationParams struct {
	FilesLimit  int
	FilesCursor string
	DirsLimit   int
	DirsCursor  string
}

type deletedDirectoryRecord struct {
	ID        string
	Name      string
	OwnerID   string
	ParentID  *string
	Type      string
	DeletedAt *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

type deletedFileRecord struct {
	ID          string
	Filename    string
	Extension   string
	MimeType    string
	Size        int64
	DirectoryID string
	ObjectKey   string
	OwnerID     string
	DeletedAt   *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type fileForDeleteRecord struct {
	ID        string
	ObjectKey string
	Size      int64
	OwnerID   string
}
