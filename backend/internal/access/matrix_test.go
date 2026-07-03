package access

import "testing"

func TestCan(t *testing.T) {
	tests := []struct {
		name     string
		role     Role
		action   Action
		expected bool
	}{
		// Admin — all actions
		{name: "admin_can_view", role: RoleAdmin, action: ActionView, expected: true},
		{name: "admin_can_download", role: RoleAdmin, action: ActionDownload, expected: true},
		{name: "admin_can_upload", role: RoleAdmin, action: ActionUpload, expected: true},
		{name: "admin_can_create_folder", role: RoleAdmin, action: ActionCreateFolder, expected: true},
		{name: "admin_can_delete", role: RoleAdmin, action: ActionDelete, expected: true},
		{name: "admin_can_invite", role: RoleAdmin, action: ActionInvite, expected: true},
		{name: "admin_can_change_role", role: RoleAdmin, action: ActionChangeRole, expected: true},
		{name: "admin_can_remove_member", role: RoleAdmin, action: ActionRemoveMember, expected: true},
		{name: "admin_can_delete_directory", role: RoleAdmin, action: ActionDeleteDir, expected: true},
		{name: "admin_can_rename", role: RoleAdmin, action: ActionRename, expected: true},
		{name: "admin_can_create_link", role: RoleAdmin, action: ActionCreateLink, expected: true},

		// Editor — view, download, upload, create_folder
		{name: "editor_can_view", role: RoleEditor, action: ActionView, expected: true},
		{name: "editor_can_download", role: RoleEditor, action: ActionDownload, expected: true},
		{name: "editor_can_upload", role: RoleEditor, action: ActionUpload, expected: true},
		{name: "editor_can_create_folder", role: RoleEditor, action: ActionCreateFolder, expected: true},
		{name: "editor_cannot_delete", role: RoleEditor, action: ActionDelete, expected: false},
		{name: "editor_cannot_invite", role: RoleEditor, action: ActionInvite, expected: false},
		{name: "editor_cannot_change_role", role: RoleEditor, action: ActionChangeRole, expected: false},
		{name: "editor_cannot_remove_member", role: RoleEditor, action: ActionRemoveMember, expected: false},
		{name: "editor_cannot_rename", role: RoleEditor, action: ActionRename, expected: false},
		{name: "editor_cannot_delete_directory", role: RoleEditor, action: ActionDeleteDir, expected: false},

		// Viewer — view, download only
		{name: "viewer_can_view", role: RoleViewer, action: ActionView, expected: true},
		{name: "viewer_can_download", role: RoleViewer, action: ActionDownload, expected: true},
		{name: "viewer_cannot_upload", role: RoleViewer, action: ActionUpload, expected: false},
		{name: "viewer_cannot_create_folder", role: RoleViewer, action: ActionCreateFolder, expected: false},
		{name: "viewer_cannot_delete", role: RoleViewer, action: ActionDelete, expected: false},
		{name: "viewer_cannot_invite", role: RoleViewer, action: ActionInvite, expected: false},
		{name: "viewer_cannot_change_role", role: RoleViewer, action: ActionChangeRole, expected: false},
		{name: "viewer_cannot_remove_member", role: RoleViewer, action: ActionRemoveMember, expected: false},
		{name: "viewer_cannot_rename", role: RoleViewer, action: ActionRename, expected: false},
		{name: "viewer_cannot_delete_directory", role: RoleViewer, action: ActionDeleteDir, expected: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Can(tt.role, tt.action)
			if result != tt.expected {
				t.Errorf("Can(%v, %v) = %v, want %v", tt.role, tt.action, result, tt.expected)
			}
		})
	}
}
