ALTER TABLE document_edit_sessions ADD COLUMN format text NOT NULL DEFAULT 'docx'
    CHECK (format IN ('docx', 'xlsx', 'pptx'));
ALTER TABLE file_versions ADD COLUMN format text NOT NULL DEFAULT 'docx'
    CHECK (format IN ('docx', 'xlsx', 'pptx'));
