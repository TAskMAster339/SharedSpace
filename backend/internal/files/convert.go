package files

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	ffmpeg "github.com/u2takey/ffmpeg-go"
)

var errUnsupportedConversion = errors.New("unsupported conversion")

var allowedConversions = map[string]map[string]bool{
	"png": {"jpg": true, "webp": true},
	"jpg": {"webp": true},
}

func ffmpegAvailable() bool {
	_, err := exec.LookPath("ffmpeg")
	return err == nil
}

func convertImageData(data []byte, target string) (out []byte, sourceFormat, mimeType, ext string, err error) {
	target = strings.ToLower(target)
	if target == "jpeg" {
		target = "jpg"
	}

	sourceFormat = detectFormat(data)
	if sourceFormat == "jpeg" {
		sourceFormat = "jpg"
	}
	if sourceFormat == "" {
		return nil, "", "", "", fmt.Errorf("неизвестный формат исходного файла")
	}
	if !allowedConversions[sourceFormat][target] {
		return nil, "", "", "", errUnsupportedConversion
	}

	inPath, err := writeTempFile(data, "convert_in_*")
	if err != nil {
		return nil, "", "", "", err
	}
	defer os.Remove(inPath)

	outFile, err := os.CreateTemp("", "convert_out_*."+target)
	if err != nil {
		return nil, "", "", "", fmt.Errorf("create temp output: %w", err)
	}
	outPath := outFile.Name()
	outFile.Close()
	defer os.Remove(outPath)

	codec := "mjpeg"
	if target == "webp" {
		codec = "libwebp"
	}

	if err := ffmpeg.Input(inPath).
		Output(outPath, ffmpeg.KwArgs{"c:v": codec}).
		OverWriteOutput().
		Run(); err != nil {
		return nil, "", "", "", fmt.Errorf("ffmpeg: %w", err)
	}

	out, err = os.ReadFile(outPath)
	if err != nil {
		return nil, "", "", "", fmt.Errorf("read output: %w", err)
	}

	switch target {
	case "jpg":
		mimeType, ext = "image/jpeg", "jpg"
	case "webp":
		mimeType, ext = "image/webp", "webp"
	default:
		mimeType, ext = "application/octet-stream", target
	}
	return out, sourceFormat, mimeType, ext, nil
}

func writeTempFile(data []byte, pattern string) (string, error) {
	f, err := os.CreateTemp("", pattern)
	if err != nil {
		return "", fmt.Errorf("create temp: %w", err)
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		os.Remove(f.Name())
		return "", fmt.Errorf("write temp: %w", err)
	}
	if err := f.Close(); err != nil {
		os.Remove(f.Name())
		return "", fmt.Errorf("close temp: %w", err)
	}
	return f.Name(), nil
}

func detectFormat(data []byte) string {
	if len(data) < 12 {
		return ""
	}
	if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
		return "png"
	}
	if data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
		return "jpeg"
	}
	if string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "webp"
	}
	return ""
}

func replaceExt(filename, newExt string) string {
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	return base + "." + newExt
}
