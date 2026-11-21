package files

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"sharedspace/internal/access"
	"sharedspace/internal/apperror"
)

const (
	previewPrefix       = "previews/v1/"
	previewSourcePrefix = "preview-source-"
)

// Trash lists files by owner. Deleted media stays private to that owner,
// including when the parent directory has also been moved to trash.
func checkPreviewAccess(ctx context.Context, checker access.AccessChecker, userID string, file fileRecord) error {
	if file.DeletedAt != nil {
		if file.OwnerID != userID {
			return apperror.Forbidden("доступ запрещён")
		}
		return nil
	}
	ok, err := checker.Can(ctx, userID, file.DirectoryID, access.ActionView)
	if err != nil {
		return err
	}
	if !ok {
		return apperror.Forbidden("доступ запрещён")
	}
	return nil
}

func PreparePreviewTempDir(dir string) error {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.Type().IsRegular() && (strings.HasPrefix(entry.Name(), previewSourcePrefix) || strings.HasPrefix(entry.Name(), "media-output-")) {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}

func stageMedia(dir string, source io.Reader) (string, error) {
	input, err := os.CreateTemp(dir, previewSourcePrefix+"*")
	if err != nil {
		return "", err
	}
	n, copyErr := io.Copy(input, io.LimitReader(source, maxFileSize+1))
	closeErr := input.Close()
	if copyErr != nil || closeErr != nil || n > maxFileSize {
		os.Remove(input.Name())
		if n > maxFileSize {
			return "", invalidMedia("Файл превышает 512 МиБ")
		}
		return "", errors.Join(copyErr, closeErr)
	}
	return input.Name(), nil
}

func renderPreviewFile(ctx context.Context, input string) ([]byte, error) {
	// FFmpeg auto-rotates images/video and takes only the first frame. Never upscale.
	cmd := exec.CommandContext(ctx, "ffmpeg", "-nostdin", "-v", "error", "-filter_threads", "1", "-threads", "1", "-max_alloc", "67108864",
		"-protocol_whitelist", "file", "-format_whitelist", mediaDemuxers, "-i", input, "-map", "0:v:0", "-frames:v", "1",
		"-vf", "scale=w='min(256,iw)':h='min(256,ih)':force_original_aspect_ratio=decrease",
		"-threads", "1", "-c:v", "mjpeg", "-q:v", "6", "-f", "image2pipe", "pipe:1")
	data, err := cmd.Output()
	if err != nil {
		return nil, ffmpegFailure(ctx, err)
	}
	if len(data) == 0 || len(data) > 128*1024 {
		return nil, invalidMedia("Не удалось создать превью")
	}
	return data, nil
}
