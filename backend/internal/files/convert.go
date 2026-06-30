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
	"png":  {"jpg": true, "webp": true, "gif": true, "bmp": true, "tiff": true},
	"jpg":  {"png": true, "webp": true, "gif": true, "bmp": true, "tiff": true},
	"webp": {"png": true, "jpg": true, "gif": true, "bmp": true, "tiff": true},
	"gif":  {"mp4": true, "webm": true, "avi": true, "mov": true, "mkv": true},
	"bmp":  {"png": true, "jpg": true, "webp": true, "gif": true, "tiff": true},
	"tiff": {"png": true, "jpg": true, "webp": true, "gif": true, "bmp": true},
	"mp4":  {"webm": true, "avi": true, "mov": true, "mkv": true, "gif": true},
	"webm": {"mp4": true, "avi": true, "mov": true, "mkv": true, "gif": true},
	"avi":  {"mp4": true, "webm": true, "mov": true, "mkv": true, "gif": true},
	"mov":  {"mp4": true, "webm": true, "avi": true, "mkv": true, "gif": true},
	"mkv":  {"mp4": true, "webm": true, "avi": true, "mov": true, "gif": true},
	"mp3":  {"wav": true, "flac": true, "ogg": true, "aac": true},
	"wav":  {"mp3": true, "flac": true, "ogg": true, "aac": true},
	"flac": {"mp3": true, "wav": true, "ogg": true, "aac": true},
	"ogg":  {"mp3": true, "wav": true, "flac": true, "aac": true},
}

var videoCodecMap = map[string]string{
	"jpg":  "mjpeg",
	"webp": "libwebp",
	"gif":  "gif",
}

var audioCodecMap = map[string]string{
	"mp3":  "mp3",
	"aac":  "aac",
	"flac": "flac",
	"ogg":  "vorbis",
	"wav":  "pcm_s16le",
}

var mimeMap = map[string]string{
	"jpg":  "image/jpeg",
	"webp": "image/webp",
	"png":  "image/png",
	"gif":  "image/gif",
	"bmp":  "image/bmp",
	"tiff": "image/tiff",
	"mp4":  "video/mp4",
	"webm": "video/webm",
	"avi":  "video/x-msvideo",
	"mov":  "video/quicktime",
	"mkv":  "video/x-matroska",
	"mp3":  "audio/mpeg",
	"wav":  "audio/wav",
	"flac": "audio/flac",
	"ogg":  "audio/ogg",
	"aac":  "audio/aac",
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

	inPath, err := writeTempFile(data, "convert_in_*."+sourceFormat)
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

	args := ffmpeg.KwArgs{}
	if codec, ok := videoCodecMap[target]; ok {
		args["c:v"] = codec
	} else if codec, ok := audioCodecMap[target]; ok {
		args["c:a"] = codec
	}

	if err := ffmpeg.Input(inPath).
		Output(outPath, args).
		OverWriteOutput().
		Run(); err != nil {
		return nil, "", "", "", fmt.Errorf("ffmpeg: %w", err)
	}

	out, err = os.ReadFile(outPath)
	if err != nil {
		return nil, "", "", "", fmt.Errorf("read output: %w", err)
	}

	mimeType = mimeMap[target]
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	ext = target
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
	if data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x38 {
		return "gif"
	}
	if data[0] == 0x42 && data[1] == 0x4D {
		return "bmp"
	}
	if data[0] == 0x49 && data[1] == 0x49 && data[2] == 0x2A && data[3] == 0x00 {
		return "tiff"
	}
	if data[0] == 0x4D && data[1] == 0x4D && data[2] == 0x00 && data[3] == 0x2A {
		return "tiff"
	}
	if string(data[0:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "webp"
	}
	if string(data[0:4]) == "RIFF" && string(data[8:12]) == "AVI " {
		return "avi"
	}
	if string(data[0:4]) == "RIFF" && string(data[8:12]) == "WAVE" {
		return "wav"
	}
	if data[0] == 0x1A && data[1] == 0x45 && data[2] == 0xDF && data[3] == 0xA3 {
		if len(data) > 64 && strings.Contains(strings.ToLower(string(data[:64])), "webm") {
			return "webm"
		}
		return "mkv"
	}
	if data[0] == 0xFF && (data[1]&0xE0) == 0xE0 {
		return "mp3"
	}
	if data[0] == 0x49 && data[1] == 0x44 && data[2] == 0x33 {
		return "mp3"
	}
	if data[0] == 0x66 && data[1] == 0x4C && data[2] == 0x61 && data[3] == 0x43 {
		return "flac"
	}
	if data[0] == 0x4F && data[1] == 0x67 && data[2] == 0x67 && data[3] == 0x53 {
		return "ogg"
	}
	if string(data[4:8]) == "ftyp" {
		if string(data[8:12]) == "qt  " {
			return "mov"
		}
		return "mp4"
	}
	return ""
}

func replaceExt(filename, newExt string) string {
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	return base + "." + newExt
}
