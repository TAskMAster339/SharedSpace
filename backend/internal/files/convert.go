package files

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	_ "image/png"
	"path/filepath"
	"strings"

	"github.com/HugoSmits86/nativewebp"
)

var errUnsupportedConversion = errors.New("unsupported conversion")

var allowedConversions = map[string]map[string]bool{
	"png": {"jpg": true, "webp": true},
	"jpg": {"webp": true},
}

func convertImageData(data []byte, target string) (out []byte, sourceFormat, mimeType, ext string, err error) {
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", "", "", fmt.Errorf("декодирование: %w", err)
	}
	if format == "jpeg" {
		format = "jpg"
	}
	if !allowedConversions[format][target] {
		return nil, "", "", "", errUnsupportedConversion
	}

	var buf bytes.Buffer
	switch target {
	case "jpg":
		err = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90})
		mimeType, ext = "image/jpeg", "jpg"
	case "webp":
		err = nativewebp.Encode(&buf, img, nil)
		mimeType, ext = "image/webp", "webp"
	default:
		return nil, "", "", "", errUnsupportedConversion
	}
	if err != nil {
		return nil, "", "", "", fmt.Errorf("кодирование: %w", err)
	}
	return buf.Bytes(), format, mimeType, ext, nil
}

func replaceExt(filename, newExt string) string {
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	return base + "." + newExt
}
