package access

type Role string

const (
	RoleViewer Role = "viewer"
	RoleEditor Role = "editor"
	RoleAdmin  Role = "admin"
)

type Action string

const (
	ActionView         Action = "view"
	ActionDownload     Action = "download"
	ActionUpload       Action = "upload"
	ActionCreateFolder Action = "create_folder"
	ActionDelete       Action = "delete"
	ActionInvite       Action = "invite"
	ActionChangeRole   Action = "change_role"
	ActionRemoveMember Action = "remove_member"
	ActionDeleteDir    Action = "delete_directory"
)

type Permissions struct {
	View         bool `json:"view"`
	Download     bool `json:"download"`
	Upload       bool `json:"upload"`
	CreateFolder bool `json:"create_folder"`
	Delete       bool `json:"delete"`
	Invite       bool `json:"invite"`
	ChangeRole   bool `json:"change_role"`
	RemoveMember bool `json:"remove_member"`
	DeleteDir    bool `json:"delete_directory"`
}
