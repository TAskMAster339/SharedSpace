package sharelinks

import "time"

type CreateShareLinkRequest struct {
	AccessType string  `json:"access_type"`
	ExpiresAt  *string `json:"expires_at"`
	Password   string  `json:"password"`
}

type UpdateShareLinkRequest struct {
	AccessType *string `json:"access_type"`
	ExpiresAt  *string `json:"expires_at"`
	Password   *string `json:"password"`
}

type ShareLinkResponse struct {
	ID          string    `json:"id"`
	FileID      *string   `json:"file_id"`
	DirectoryID *string   `json:"directory_id"`
	Token       string    `json:"token"`
	AccessType  string    `json:"access_type"`
	CreatedBy   string    `json:"created_by"`
	ExpiresAt   *string   `json:"expires_at"`
	HasPassword bool      `json:"has_password"`
	CreatedAt   time.Time `json:"created_at"`
}

type FileContentResponse struct {
	URL           string    `json:"url"`
	FileID        string    `json:"file_id"`
	Filename      string    `json:"filename"`
	Extension     string    `json:"extension"`
	MimeType      string    `json:"mime_type"`
	Size          int64     `json:"size"`
	OwnerUsername string    `json:"owner_username"`
	CreatedAt     time.Time `json:"created_at"`
}

type DirectoryFileItem struct {
	ID        string    `json:"id"`
	Filename  string    `json:"filename"`
	Extension string    `json:"extension"`
	MimeType  string    `json:"mime_type"`
	Size      int64     `json:"size"`
	URL       string    `json:"url"`
	CreatedAt time.Time `json:"created_at"`
}

type DirectoryContentResponse struct {
	ID              string              `json:"id"`
	Name            string              `json:"name"`
	Token           string              `json:"token"`
	Subdirectories  []DirectorySubdir   `json:"subdirectories"`
	Files           []DirectoryFileItem `json:"files"`
	OwnerUsername   string              `json:"owner_username"`
	NextDirsCursor  string              `json:"next_dirs_cursor,omitempty"`
	NextFilesCursor string              `json:"next_files_cursor,omitempty"`
}

type ResolveDirectoryParams struct {
	SubDirID    string
	DirsLimit   int
	DirsCursor  string
	FilesLimit  int
	FilesCursor string
}

type DirectorySubdir struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type shareLinkRecord struct {
	ID           string
	FileID       *string
	DirectoryID  *string
	Token        string
	AccessType   string
	CreatedBy    string
	ExpiresAt    *time.Time
	PasswordHash *string
	CreatedAt    time.Time
}

type fileRecord struct {
	ID          string
	DirectoryID string
	OwnerID     string
	ObjectKey   string
	Filename    string
	Extension   string
	MimeType    string
	Size        int64
	CreatedAt   time.Time
}

type directoryRecord struct {
	ID      string
	Name    string
	OwnerID string
}

type dirFileRecord struct {
	ID        string
	Filename  string
	Extension string
	MimeType  string
	Size      int64
	ObjectKey string
	CreatedAt time.Time
}

type dirSubdirRecord struct {
	ID   string
	Name string
}
