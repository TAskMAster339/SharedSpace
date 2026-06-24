package files

import "time"

type UploadResponse struct {
	ID          string    `json:"id"`
	Filename    string    `json:"filename"`
	Extension   string    `json:"extension"`
	MimeType    string    `json:"mime_type"`
	Size        int64     `json:"size"`
	DirectoryID string    `json:"directory_id"`
	OwnerID     string    `json:"owner_id"`
	ObjectKey   string    `json:"object_key"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UploadFilesResponse struct {
	Files []UploadResponse `json:"files"`
}

type FileMetadataResponse struct {
	ID          string    `json:"id"`
	Filename    string    `json:"filename"`
	Extension   string    `json:"extension"`
	MimeType    string    `json:"mime_type"`
	Size        int64     `json:"size"`
	DirectoryID string    `json:"directory_id"`
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type FileContentResponse struct {
	URL string `json:"url"`
}

type UpdateFileRequest struct {
	Filename *string `json:"filename"`
	ParentID *string `json:"parent_id"`
}

type RecentFilesResponse struct {
	Files []FileMetadataResponse `json:"files"`
}

type fileRecord struct {
	ID          string
	Filename    string
	Extension   string
	MimeType    string
	Size        int64
	DirectoryID string
	OwnerID     string
	ObjectKey   string
	DeletedAt   *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
