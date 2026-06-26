package files

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
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

func isWebP(b []byte) bool {
	return len(b) >= 12 && string(b[0:4]) == "RIFF" && string(b[8:12]) == "WEBP"
}

func TestConvertImageData_Pairs(t *testing.T) {
	pngData := makePNG(t)
	jpgData := makeJPG(t)

	t.Run("png to jpg", func(t *testing.T) {
		out, src, mime, ext, err := convertImageData(pngData, "jpg")
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
		out, _, mime, ext, err := convertImageData(pngData, "webp")
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

	t.Run("jpg to webp", func(t *testing.T) {
		out, src, _, ext, err := convertImageData(jpgData, "webp")
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

	t.Run("unsupported jpg to png", func(t *testing.T) {
		if _, _, _, _, err := convertImageData(jpgData, "png"); !errors.Is(err, errUnsupportedConversion) {
			t.Fatalf("expected unsupported, got %v", err)
		}
	})
}
