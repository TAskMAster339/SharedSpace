package files

import (
	"bytes"
	"context"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func makePNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{uint8(x * 32), uint8(y * 32), 128, 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("make png: %v", err)
	}
	return buf.Bytes()
}

func makeJPG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{uint8(x * 32), uint8(y * 32), 64, 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatalf("make jpg: %v", err)
	}
	return buf.Bytes()
}

func makeGIF(t *testing.T) []byte {
	t.Helper()
	pal := color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 255, 255, 255}}
	img := image.NewPaletted(image.Rect(0, 0, 8, 8), pal)
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, color.RGBA{uint8(x * 32), uint8(y * 32), 64, 255})
		}
	}
	var buf bytes.Buffer
	if err := gif.Encode(&buf, img, nil); err != nil {
		t.Fatalf("make gif: %v", err)
	}
	return buf.Bytes()
}

func isWebP(b []byte) bool {
	return len(b) >= 12 && string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP"
}

func isGIF(b []byte) bool {
	return len(b) >= 4 && b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x38
}

func isBMP(b []byte) bool {
	return len(b) >= 2 && b[0] == 0x42 && b[1] == 0x4D
}

func isTIFF(b []byte) bool {
	return len(b) >= 4 && ((b[0] == 0x49 && b[1] == 0x49 && b[2] == 0x2A && b[3] == 0x00) ||
		(b[0] == 0x4D && b[1] == 0x4D && b[2] == 0x00 && b[3] == 0x2A))
}

func TestConvertImageData_Pairs(t *testing.T) {
	pngData := makePNG(t)
	jpgData := makeJPG(t)
	gifData := makeGIF(t)

	t.Run("png to jpg", func(t *testing.T) {
		out, src, mime, ext, err := testRenderConversion(t, pngData, "jpg", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if src != "png" || ext != "jpg" || mime != "image/jpeg" {
			t.Fatalf("meta: src=%s ext=%s mime=%s", src, ext, mime)
		}
		if _, err := jpeg.Decode(bytes.NewReader(out)); err != nil {
			t.Fatalf("not a valid jpeg: %v", err)
		}
	})

	t.Run("png to webp", func(t *testing.T) {
		out, _, mime, ext, err := testRenderConversion(t, pngData, "webp", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if ext != "webp" || mime != "image/webp" {
			t.Fatalf("meta: ext=%s mime=%s", ext, mime)
		}
		if !isWebP(out) {
			t.Fatal("not a valid webp container")
		}
	})

	t.Run("png to gif", func(t *testing.T) {
		out, _, mime, ext, err := testRenderConversion(t, pngData, "gif", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if ext != "gif" || mime != "image/gif" {
			t.Fatalf("meta: ext=%s mime=%s", ext, mime)
		}
		if !isGIF(out) {
			t.Fatal("not a valid gif")
		}
	})

	t.Run("png to bmp", func(t *testing.T) {
		out, _, mime, ext, err := testRenderConversion(t, pngData, "bmp", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if ext != "bmp" || mime != "image/bmp" {
			t.Fatalf("meta: ext=%s mime=%s", ext, mime)
		}
		if !isBMP(out) {
			t.Fatal("not a valid bmp")
		}
	})

	t.Run("gif unsupported to png", func(t *testing.T) {
		if _, _, _, _, err := testRenderConversion(t, gifData, "png", ""); err == nil {
			t.Fatalf("expected unsupported, got %v", err)
		}
	})

	t.Run("jpg to webp", func(t *testing.T) {
		out, src, _, ext, err := testRenderConversion(t, jpgData, "webp", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if src != "jpg" || ext != "webp" {
			t.Fatalf("meta: src=%s ext=%s", src, ext)
		}
		if !isWebP(out) {
			t.Fatal("not a valid webp container")
		}
	})

	t.Run("jpg to png", func(t *testing.T) {
		out, _, mime, ext, err := testRenderConversion(t, jpgData, "png", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if ext != "png" || mime != "image/png" {
			t.Fatalf("meta: ext=%s mime=%s", ext, mime)
		}
		if _, err := png.Decode(bytes.NewReader(out)); err != nil {
			t.Fatalf("not a valid png: %v", err)
		}
	})

	t.Run("jpg to gif", func(t *testing.T) {
		out, _, mime, ext, err := testRenderConversion(t, jpgData, "gif", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if ext != "gif" || mime != "image/gif" {
			t.Fatalf("meta: ext=%s mime=%s", ext, mime)
		}
		if !isGIF(out) {
			t.Fatal("not a valid gif")
		}
	})

	t.Run("jpg to tiff", func(t *testing.T) {
		out, _, mime, ext, err := testRenderConversion(t, jpgData, "tiff", "")
		if err != nil {
			t.Fatalf("convert: %v", err)
		}
		if ext != "tiff" || mime != "image/tiff" {
			t.Fatalf("meta: ext=%s mime=%s", ext, mime)
		}
		if !isTIFF(out) {
			t.Fatal("not a valid tiff")
		}
	})

	t.Run("unsupported png to avif", func(t *testing.T) {
		if _, _, _, _, err := testRenderConversion(t, pngData, "avif", ""); err == nil {
			t.Fatalf("expected unsupported, got %v", err)
		}
	})

	t.Run("unsupported png to wav", func(t *testing.T) {
		if _, _, _, _, err := testRenderConversion(t, pngData, "wav", ""); err == nil {
			t.Fatalf("expected unsupported, got %v", err)
		}
	})
}

func testRenderConversion(t *testing.T, data []byte, target, ext string) ([]byte, string, string, string, error) {
	t.Helper()
	dir := t.TempDir()
	input, err := stageMedia(dir, bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	output, source, _, err := renderConversion(context.Background(), dir, input, target, ext)
	if err != nil {
		return nil, "", "", "", err
	}
	body, err := os.ReadFile(output)
	return body, source, mimeMap[target], target, err
}

func TestRenderAudioConversionAndCancellation(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg required")
	}
	dir := t.TempDir()
	input := filepath.Join(dir, "input.wav")
	cmd := exec.Command("ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", input)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg fixture: %v %s", err, out)
	}
	path, source, n, err := renderConversion(context.Background(), dir, input, "mp3", "wav")
	if err != nil || source != "wav" || n <= 0 {
		t.Fatalf("audio conversion: %q %d %v", source, n, err)
	}
	encoded, err := os.ReadFile(path)
	if err != nil || detectFormat(encoded, "mp3") != "mp3" {
		t.Fatalf("encoded audio is not MP3: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, _, err := renderConversion(ctx, dir, input, "mp3", "wav"); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled ffmpeg returned %v", err)
	}
}

func TestConvertAACDurationAndCover(t *testing.T) {
	for _, tool := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(tool); err != nil {
			t.Skipf("%s unavailable", tool)
		}
	}
	for _, tc := range []struct {
		name  string
		cover bool
	}{{"with cover", true}, {"without cover", false}} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			dir := t.TempDir()
			input := filepath.Join(dir, "source.mp3")
			args := []string{"-v", "error", "-f", "lavfi", "-i", "sine=duration=3"}
			if tc.cover {
				coverPath := filepath.Join(dir, "cover.png")
				if err := os.WriteFile(coverPath, makePNG(t), 0600); err != nil {
					t.Fatal(err)
				}
				args = append(args, "-i", coverPath, "-map", "0:a", "-map", "1:v", "-c:v", "copy", "-disposition:v", "attached_pic")
			}
			if log, err := exec.CommandContext(ctx, "ffmpeg", append(args, input)...).CombinedOutput(); err != nil {
				t.Fatalf("generate MP3: %v: %s", err, log)
			}

			output, source, _, err := renderConversion(ctx, dir, input, "aac", "mp3")
			if err != nil {
				t.Fatal(err)
			}
			if source != "mp3" || filepath.Ext(output) != ".m4a" {
				t.Fatalf("unexpected conversion: %s -> %s", source, output)
			}
			audio, err := os.Open(output)
			if err != nil {
				t.Fatal(err)
			}
			defer audio.Close()
			info, err := probeAudio(ctx, audio)
			if err != nil {
				t.Fatal(err)
			}
			if info.MIME != "audio/mp4" || (len(info.Cover) > 0) != tc.cover {
				t.Fatalf("MIME %s, cover bytes %d", info.MIME, len(info.Cover))
			}
			raw, err := exec.CommandContext(ctx, "ffprobe", "-v", "error", "-show_entries", "format=duration",
				"-of", "default=nokey=1:noprint_wrappers=1", output).Output()
			if err != nil {
				t.Fatal(err)
			}
			duration, err := strconv.ParseFloat(strings.TrimSpace(string(raw)), 64)
			if err != nil || duration < 2.99 || duration > 3.05 {
				t.Fatalf("duration = %q, expected 3 seconds", raw)
			}
		})
	}
}
