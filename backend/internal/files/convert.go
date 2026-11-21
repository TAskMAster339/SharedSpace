package files

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

const mediaDemuxers = "aac,apng,asf,avi,bmp_pipe,dv,flac,flv,gif,ico,j2k_pipe,jpeg_pipe,jpegxl_pipe,matroska,mjpeg,mov,mp3,mpeg,mpegts,mpegvideo,ogg,png_pipe,psd_pipe,qoi_pipe,rm,svg_pipe,tiff_pipe,wav,webp_pipe"

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
	"aac":  {"mp3": true, "wav": true, "flac": true, "ogg": true},
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
	"wav":  "pcm_s16le",
}

var audioTargets = map[string]bool{
	"mp3": true, "aac": true, "flac": true, "ogg": true, "wav": true,
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

func renderConversion(ctx context.Context, dir, input, target, extension string) (string, string, int64, error) {
	file, err := os.Open(input)
	if err != nil {
		return "", "", 0, err
	}
	var header [64]byte
	n, err := io.ReadFull(file, header[:])
	file.Close()
	if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		return "", "", 0, err
	}
	source := detectFormat(header[:n], extension)
	if source == "jpeg" {
		source = "jpg"
	}
	if !allowedConversions[source][target] {
		return "", "", 0, invalidMedia("неподдерживаемая пара форматов")
	}

	out, err := os.CreateTemp(dir, "media-output-*."+target)
	if err != nil {
		return "", "", 0, err
	}
	output := out.Name()
	if err := out.Close(); err != nil {
		os.Remove(output)
		return "", "", 0, err
	}
	args := []string{"-nostdin", "-v", "error", "-xerror", "-filter_threads", "1", "-filter_complex_threads", "1",
		"-threads", "1", "-max_alloc", "67108864", "-protocol_whitelist", "file", "-format_whitelist", mediaDemuxers, "-i", input, "-threads", "1",
		"-fs", strconv.Itoa(maxFileSize + 1), "-y"}
	if codec, ok := videoCodecMap[target]; ok {
		args = append(args, "-c:v", codec)
	}
	if codec, ok := audioCodecMap[target]; ok {
		args = append(args, "-c:a", codec)
	}
	if audioTargets[target] {
		args = append(args, "-vn")
	}
	if err := exec.CommandContext(ctx, "ffmpeg", append(args, output)...).Run(); err != nil {
		os.Remove(output)
		return "", "", 0, ffmpegFailure(ctx, err)
	}
	info, err := os.Stat(output)
	if err != nil || info.Size() == 0 || info.Size() > maxFileSize {
		os.Remove(output)
		if err != nil {
			return "", "", 0, err
		}
		return "", "", 0, invalidMedia("Результат пуст или превышает 512 МиБ")
	}
	return output, source, info.Size(), nil
}

func ffmpegFailure(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) && exit.ExitCode() >= 0 {
		return invalidMedia("Не удалось обработать файл")
	}
	return fmt.Errorf("ffmpeg: %w", err)
}

func detectFormat(data []byte, ext string) string {
	if len(data) < 12 {
		return ""
	}
	ext = strings.ToLower(strings.TrimPrefix(ext, "."))

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
		if len(data) >= 64 && strings.Contains(strings.ToLower(string(data[:64])), "webm") {
			return "webm"
		}
		return "mkv"
	}
	if data[0] == 0xFF && (data[1]&0xE0) == 0xE0 {
		if ext == "aac" || ext == "m4a" {
			return "aac"
		}
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
		brand := string(data[8:12])
		if brand == "qt  " {
			return "mov"
		}
		if brand == "M4A " || ext == "m4a" || ext == "aac" {
			return "aac"
		}
		return "mp4"
	}
	return ""
}

func replaceExt(filename, newExt string) string {
	base := strings.TrimSuffix(filename, filepath.Ext(filename))
	return base + "." + newExt
}
