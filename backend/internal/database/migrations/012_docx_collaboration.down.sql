DROP TABLE document_edit_members;
DROP TABLE document_edit_sessions;
DROP TRIGGER file_version_cleanup_after_delete ON file_versions;
DROP FUNCTION queue_file_version_cleanup();
DROP TABLE file_versions;
DROP TABLE file_version_cleanup;
