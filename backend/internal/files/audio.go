package files

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"

	"sharedspace/internal/apperror"
)

type audioInfo struct {
	MIME  string
	Cover []byte
}

func probeAudio(ctx context.Context, input io.Reader) (audioInfo, error) {
	temp, err := os.CreateTemp("", "sharedspace-audio-*")
	if err != nil {
		return audioInfo{}, apperror.WrapInternal("подготовка проверки аудиофайла", err)
	}
	defer os.Remove(temp.Name())
	size, copyErr := io.Copy(temp, io.LimitReader(input, maxFileSize+1))
	closeErr := temp.Close()
	if err := errors.Join(copyErr, closeErr); err != nil {
		return audioInfo{}, apperror.WrapInternal("чтение аудиофайла", err)
	}
	if size > maxFileSize {
		return audioInfo{}, uploadTooLarge("аудиофайл превышает 512 МиБ")
	}

	probeCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(probeCtx, "ffprobe", "-v", "error",
		"-protocol_whitelist", "file", "-format_whitelist", "mp3,aac,mov,flac,wav,ogg",
		"-max_alloc", "67108864", "-show_entries",
		"format=format_name:stream=codec_type,codec_name:stream_disposition=attached_pic",
		"-of", "json", temp.Name())
	raw, err := cmd.Output()
	if err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) && probeCtx.Err() == nil {
			return audioInfo{}, apperror.Validation("поддерживаемый аудиоформат не распознан")
		}
		return audioInfo{}, apperror.WrapInternal("проверка аудиофайла", err)
	}

	var info struct {
		Format struct {
			Name string `json:"format_name"`
		} `json:"format"`
		Streams []struct {
			Type        string `json:"codec_type"`
			Codec       string `json:"codec_name"`
			Disposition struct {
				AttachedPicture int `json:"attached_pic"`
			} `json:"disposition"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(raw, &info); err != nil {
		return audioInfo{}, apperror.WrapInternal("чтение результата проверки аудиофайла", err)
	}

	var codec string
	var hasCover bool
	for _, stream := range info.Streams {
		if stream.Type == "video" && stream.Disposition.AttachedPicture == 0 {
			return audioInfo{}, apperror.Validation("аудиопапки не принимают файлы с видеодорожкой")
		}
		if stream.Type == "video" && stream.Disposition.AttachedPicture == 1 {
			hasCover = true
		}
		if stream.Type == "audio" {
			codec = stream.Codec
		}
	}

	format, _, _ := strings.Cut(info.Format.Name, ",")
	result := audioInfo{}
	switch {
	case format == "mp3" && codec == "mp3":
		result.MIME = "audio/mpeg"
	case format == "aac" && codec == "aac":
		result.MIME = "audio/aac"
	case format == "mov" && codec == "aac":
		result.MIME = "audio/mp4"
	case format == "flac" && codec == "flac":
		result.MIME = "audio/flac"
	case format == "wav" && codec != "":
		result.MIME = "audio/wav"
	case format == "ogg" && (codec == "vorbis" || codec == "opus"):
		result.MIME = "audio/ogg"
	default:
		return audioInfo{}, apperror.Validation("поддерживаемый аудиоформат не распознан")
	}
	if hasCover {
		result.Cover, _ = renderPreviewFile(probeCtx, temp.Name())
	}
	return result, nil
}

func (s *Service) probeStoredAudio(ctx context.Context, key string) (audioInfo, error) {
	input, err := s.storage.Get(ctx, key)
	if err != nil {
		return audioInfo{}, apperror.WrapInternal("открытие файла для проверки аудио", err)
	}
	defer input.Close()
	return probeAudio(ctx, input)
}
