package dirs

import (
	"bytes"
	"context"
	"image"
	"image/jpeg"
	"image/png"
	"os/exec"
	"testing"
)

func TestRenderPlaylistCover(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg required")
	}
	for _, bounds := range []image.Rectangle{
		image.Rect(0, 0, 320, 160),
		image.Rect(0, 0, 160, 320),
	} {
		var input bytes.Buffer
		if err := png.Encode(&input, image.NewRGBA(bounds)); err != nil {
			t.Fatal(err)
		}
		preview, err := renderCover(context.Background(), input.Bytes())
		if err != nil {
			t.Fatal(err)
		}
		output, err := jpeg.DecodeConfig(bytes.NewReader(preview))
		if err != nil {
			t.Fatal(err)
		}
		if output.Width != 256 || output.Height != 256 {
			t.Fatalf("preview dimensions: %d×%d, expected 256×256", output.Width, output.Height)
		}
	}
}
