package dirs

import (
	"time"

	"sharedspace/internal/access"
)

type CreateDirectoryRequest struct {
	Name     string `json:"name"`
	ParentID string `json:"parent_id"`
	Shared   bool   `json:"shared"`
}

type UpdateDirectoryRequest struct {
	Name     *string `json:"name"`
	ParentID *string `json:"parent_id"`
}

type DirectoryResponse struct {
	ID            string              `json:"id"`
	Name          string              `json:"name"`
	OwnerID       string              `json:"owner_id"`
	ParentID      *string             `json:"parent_id"`
	Type          string              `json:"type"`
	FilesCount    int                 `json:"files_count"`
	CreatedAt     time.Time           `json:"created_at"`
	UpdatedAt     time.Time           `json:"updated_at"`
	Permissions   *access.Permissions `json:"permissions,omitempty"`
	HasShareLinks bool                `json:"has_share_links"`
}

type FileItem struct {
	ID            string    `json:"id"`
	Filename      string    `json:"filename"`
	Extension     string    `json:"extension"`
	MimeType      string    `json:"mime_type"`
	Size          int64     `json:"size"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	HasShareLinks bool      `json:"has_share_links"`
}

type DirectoryContentsResponse struct {
	ID             string              `json:"id"`
	Name           string              `json:"name"`
	Subdirectories []DirectoryResponse `json:"subdirectories"`
	Files          []FileItem          `json:"files"`
}

type directoryRecord struct {
	ID         string
	Name       string
	OwnerID    string
	ParentID   *string
	Type       string
	FilesCount int
	DeletedAt  *time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type fileRecord struct {
	ID        string
	Filename  string
	Extension string
	MimeType  string
	Size      int64
	ObjectKey string
	OwnerID   string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type SharedDirsInfo struct {
	Count int `json:"shared_dirs_count"`
	Quota int `json:"shared_dirs_quota"`
}
