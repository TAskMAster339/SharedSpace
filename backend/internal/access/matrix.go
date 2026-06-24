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
