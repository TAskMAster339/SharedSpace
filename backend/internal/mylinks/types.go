package mylinks

import "time"

type LinkItemResponse struct {
	ID            string    `json:"id"`
	ItemType      string    `json:"item_type"`
	Filename      string    `json:"filename"`
	Extension     string    `json:"extension"`
	MimeType      string    `json:"mime_type"`
	Size          int64     `json:"size"`
	DirectoryID   string    `json:"directory_id"`
	OwnerID       string    `json:"owner_id"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	LinkToken     string    `json:"link_token"`
	LinkID        string    `json:"link_id"`
	IsActive      bool      `json:"is_active"`
	LinkCreatedAt time.Time `json:"link_created_at"`
}

type LinksListResponse struct {
	Items      []LinkItemResponse `json:"items"`
	NextCursor *string            `json:"next_cursor,omitempty"`
}

type linkItemRecord struct {
	ID            string
	ItemType      string
	Filename      string
	Extension     string
	MimeType      string
	Size          int64
	DirectoryID   string
	OwnerID       string
	CreatedAt     time.Time
	UpdatedAt     time.Time
	LinkToken     string
	LinkID        string
	IsActive      bool
	LinkCreatedAt time.Time
}
