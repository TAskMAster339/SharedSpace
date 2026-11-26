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

type RenameDirectoryRequest struct {
	Name string `json:"name"`
}

type DirectoryResponse struct {
	CoverURL          string              `json:"cover_url,omitempty"`
	ID                string              `json:"id"`
	Name              string              `json:"name"`
	OwnerID           string              `json:"owner_id"`
	OwnerUsername     string              `json:"owner_username,omitempty"`
	ParentID          *string             `json:"parent_id"`
	Type              string              `json:"type"`
	Purpose           string              `json:"purpose"`
	IsMusicRoot       bool                `json:"is_music_root"`
	FilesCount        int                 `json:"files_count"`
	SizeBytes         int64               `json:"size_bytes"`
	CreatedAt         time.Time           `json:"created_at"`
	UpdatedAt         time.Time           `json:"updated_at"`
	Permissions       *access.Permissions `json:"permissions,omitempty"`
	HasShareLinks     bool                `json:"has_share_links"`
	SharedDirectoryID *string             `json:"shared_directory_id"`
}

type BreadcrumbItem struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	IsShared bool   `json:"is_shared"`
}

type DirectoryPathResponse struct {
	Path []BreadcrumbItem `json:"path"`
}

type FileItem struct {
	CoverURL      string    `json:"cover_url,omitempty"`
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
	CoverURL        string              `json:"cover_url,omitempty"`
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	Subdirectories  []DirectoryResponse `json:"subdirectories"`
	Files           []FileItem          `json:"files"`
	NextFilesCursor *string             `json:"next_files_cursor,omitempty"`
	NextDirsCursor  *string             `json:"next_dirs_cursor,omitempty"`
}

type directoryRecord struct {
	ID            string
	Name          string
	OwnerID       string
	OwnerUsername string
	ParentID      *string
	Type          string
	Purpose       string
	IsMusicRoot   bool
	FilesCount    int
	SizeBytes     int64
	DeletedAt     *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

type fileRecord struct {
	CoverKey  string
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
