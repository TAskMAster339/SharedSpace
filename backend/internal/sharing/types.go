package sharing

import "time"

type Role string

const (
	RoleViewer Role = "viewer"
	RoleEditor Role = "editor"
	RoleAdmin  Role = "admin"
)

type InvitationStatus string

const (
	InvitationPending  InvitationStatus = "pending"
	InvitationAccepted InvitationStatus = "accepted"
	InvitationDeclined InvitationStatus = "declined"
	InvitationRevoked  InvitationStatus = "revoked"
)

type SharedDirectoryResponse struct {
	ID                string    `json:"id"`
	SharedDirectoryID string    `json:"shared_directory_id"`
	DirectoryID       string    `json:"directory_id"`
	Name              string    `json:"name"`
	OwnerID           string    `json:"owner_id"`
	OwnerName         string    `json:"owner_name"`
	ParentID          *string   `json:"parent_id,omitempty"`
	Type              string    `json:"type"`
	Role              Role      `json:"role"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// SharedDirectoriesListResponse wraps shared dirs with optional pagination cursor.
type SharedDirectoriesListResponse struct {
	Items      []SharedDirectoryResponse `json:"items"`
	NextCursor *string                   `json:"next_cursor"`
}

type SharedDirectoryWithStatsResponse struct {
	ID          string    `json:"id"`
	DirectoryID string    `json:"directory_id"`
	Name        string    `json:"name"`
	OwnerID     string    `json:"owner_id"`
	OwnerName   string    `json:"owner_name"`
	Role        Role      `json:"role"`
	MemberCount int       `json:"member_count"`
	FileCount   int       `json:"file_count"`
	CreatedAt   time.Time `json:"created_at"`
}

type MemberResponse struct {
	ID       string    `json:"id"`
	UserID   string    `json:"user_id"`
	Username string    `json:"username"`
	Role     Role      `json:"role"`
	JoinedAt time.Time `json:"joined_at"`
}

// MembersListResponse wraps members with optional pagination cursor.
type MembersListResponse struct {
	Members    []MemberResponse `json:"members"`
	NextCursor *string          `json:"next_cursor"`
}

type InvitationResponse struct {
	ID                string           `json:"id"`
	SharedDirectoryID string           `json:"shared_directory_id"`
	DirectoryName     string           `json:"directory_name"`
	InvitedByUserID   string           `json:"invited_by_user_id"`
	InvitedByUsername string           `json:"invited_by_username"`
	Role              Role             `json:"role"`
	Status            InvitationStatus `json:"status"`
	CreatedAt         time.Time        `json:"created_at"`
}

type InviteRequest struct {
	Username string `json:"username"`
}

type ChangeRoleRequest struct {
	Role Role `json:"role"`
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

type sharedDirectoryWithStatsRecord struct {
	ID          string
	DirectoryID string
	OwnerID     string
	Name        string
	OwnerName   string
	Role        string
	MemberCount int
	FileCount   int
	CreatedAt   time.Time
}

type memberRecord struct {
	ID       string
	UserID   string
	Username string
	Role     string
	JoinedAt time.Time
}

type invitationRecord struct {
	ID                string
	SharedDirectoryID string
	DirectoryName     string
	InvitedUserID     string
	InvitedByUserID   string
	InvitedByUsername string
	Role              string
	Status            string
	CreatedAt         time.Time
}
