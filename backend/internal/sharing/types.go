package sharing

import "time"

type Role string

const (
	RoleViewer Role = "viewer"
	RoleEditor Role = "editor"
	RoleAdmin  Role = "admin"
)

type SharedDirectoryResponse struct {
	ID          string    `json:"id"`
	DirectoryID string    `json:"directory_id"`
	Name        string    `json:"name"`
	OwnerID     string    `json:"owner_id"`
	OwnerName   string    `json:"owner_name"`
	Role        Role      `json:"role"`
	CreatedAt   time.Time `json:"created_at"`
}

type MemberResponse struct {
	ID       string    `json:"id"`
	UserID   string    `json:"user_id"`
	Username string    `json:"username"`
	Role     Role      `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

type sharedDirectoryRecord struct {
	ID          string
	DirectoryID string
	OwnerID     string
	Name        string
	OwnerName   string
	Role        string
	CreatedAt   time.Time
}

type memberRecord struct {
	ID       string
	UserID   string
	Username string
	Role     string
	JoinedAt time.Time
}
