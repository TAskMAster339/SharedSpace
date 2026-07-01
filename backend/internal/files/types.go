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
	Files      []FileMetadataResponse `json:"files"`
	NextCursor *string                `json:"next_cursor,omitempty"`
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

type ConvertRequest struct {
	TargetFormat string `json:"target_format"`
	Save         bool   `json:"save"`
}

type ConversionResponse struct {
	ID           string    `json:"id"`
	SourceFileID string    `json:"source_file_id"`
	ResultFileID string    `json:"result_file_id"`
	SourceFormat string    `json:"source_format"`
	TargetFormat string    `json:"target_format"`
	CreatedBy    string    `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
}

type ConversionsListResponse struct {
	Conversions []ConversionResponse `json:"conversions"`
}

type conversionRecord struct {
	ID           string
	SourceFileID string
	ResultFileID string
	SourceFormat string
	TargetFormat string
	CreatedBy    string
	CreatedAt    time.Time
}

type ConversionDownloadResponse struct {
	DownloadURL string `json:"download_url"`
	Filename    string `json:"filename"`
}
