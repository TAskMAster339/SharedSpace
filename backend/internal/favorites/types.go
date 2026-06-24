package favorites

import "time"

type FavoriteFileResponse struct {
	ID          string    `json:"id"`
	Filename    string    `json:"filename"`
	Extension   string    `json:"extension"`
	MimeType    string    `json:"mime_type"`
	Size        int64     `json:"size"`
	DirectoryID string    `json:"directory_id"`
	OwnerID     string    `json:"owner_id"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	FavoritedAt time.Time `json:"favorited_at"`
}

type FavoritesListResponse struct {
	Favorites []FavoriteFileResponse `json:"favorites"`
}

type favoriteFileRecord struct {
	ID          string
	Filename    string
	Extension   string
	MimeType    string
	Size        int64
	DirectoryID string
	OwnerID     string
	CreatedAt   time.Time
	UpdatedAt   time.Time
	FavoritedAt time.Time
}
