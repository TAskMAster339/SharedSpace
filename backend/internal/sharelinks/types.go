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
	FileID      string    `json:"file_id"`
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

type shareLinkRecord struct {
	ID           string
	FileID       string
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
