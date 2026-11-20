package files

import (
	"archive/zip"
	"fmt"
	"io"
)

const docxMIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

type officeFormat struct {
	documentType string
	mime         string
	mainPart     string
}

var officeFormats = map[string]officeFormat{
	"docx": {"word", docxMIME, "word/document.xml"},
	"xlsx": {"cell", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xl/workbook.xml"},
	"pptx": {"slide", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "ppt/presentation.xml"},
	"doc":  {"word", "application/msword", ""},
	"xls":  {"cell", "application/vnd.ms-excel", ""},
	"ppt":  {"slide", "application/vnd.ms-powerpoint", ""},
	"odt":  {"word", "application/vnd.oasis.opendocument.text", ""},
	"ods":  {"cell", "application/vnd.oasis.opendocument.spreadsheet", ""},
	"odp":  {"slide", "application/vnd.oasis.opendocument.presentation", ""},
}

func (format officeFormat) editable() bool {
	return format.mainPart != ""
}

func validateOfficeResult(file io.ReaderAt, size int64, extension string) error {
	format := officeFormats[extension]
	if !format.editable() {
		return fmt.Errorf("unsupported Office save format: %q", extension)
	}
	z, err := zip.NewReader(file, size)
	if err != nil {
		return fmt.Errorf("invalid %s result: %w", extension, err)
	}
	var contentTypes, mainPart bool
	for _, entry := range z.File {
		switch entry.Name {
		case "[Content_Types].xml":
			contentTypes = !entry.FileInfo().IsDir()
		case format.mainPart:
			mainPart = !entry.FileInfo().IsDir()
		}
	}
	if !contentTypes || !mainPart {
		return fmt.Errorf("result is missing required %s parts", extension)
	}
	return nil
}
