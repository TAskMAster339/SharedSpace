package access

func Can(role Role, action Action) bool {
	switch role {
	case RoleAdmin:
		return true
	case RoleEditor:
		switch action {
		case ActionView, ActionDownload, ActionUpload, ActionCreateFolder:
			return true
		default:
			return false
		}
	case RoleViewer:
		switch action {
		case ActionView, ActionDownload:
			return true
		default:
			return false
		}
	default:
		return false
	}
}

func GetPermissions(role Role) Permissions {
	return Permissions{
		View:         Can(role, ActionView),
		Download:     Can(role, ActionDownload),
		Upload:       Can(role, ActionUpload),
		CreateFolder: Can(role, ActionCreateFolder),
		Delete:       Can(role, ActionDelete),
		Rename:       Can(role, ActionRename),
		Invite:       Can(role, ActionInvite),
		ChangeRole:   Can(role, ActionChangeRole),
		RemoveMember: Can(role, ActionRemoveMember),
		DeleteDir:    Can(role, ActionDeleteDir),
		CreateLink:   Can(role, ActionCreateLink),
	}
}
