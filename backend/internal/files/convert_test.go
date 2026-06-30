package files

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/gif"
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

	t.Run("png to gif", func(t *testing.T) {
		out, _, mime, ext, err := convertImageData(pngData, "gif")
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
		out, _, mime, ext, err := convertImageData(pngData, "bmp")
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
		if _, _, _, _, err := convertImageData(gifData, "png"); !errors.Is(err, errUnsupportedConversion) {
			t.Fatalf("expected unsupported, got %v", err)
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

	t.Run("jpg to png", func(t *testing.T) {
		out, _, mime, ext, err := convertImageData(jpgData, "png")
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
		out, _, mime, ext, err := convertImageData(jpgData, "gif")
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
		out, _, mime, ext, err := convertImageData(jpgData, "tiff")
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
		if _, _, _, _, err := convertImageData(pngData, "avif"); !errors.Is(err, errUnsupportedConversion) {
			t.Fatalf("expected unsupported, got %v", err)
		}
	})

	t.Run("unsupported png to wav", func(t *testing.T) {
		if _, _, _, _, err := convertImageData(pngData, "wav"); !errors.Is(err, errUnsupportedConversion) {
			t.Fatalf("expected unsupported, got %v", err)
		}
	})
}
