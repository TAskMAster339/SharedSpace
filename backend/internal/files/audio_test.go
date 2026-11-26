package files

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestProbeAudio(t *testing.T) {
	for _, binary := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(binary); err != nil {
			t.Skipf("%s unavailable: %v", binary, err)
		}
	}
	tests := []struct {
		name string
		ext  string
		mime string
		args []string
	}{
		{"MP3", "mp3", "audio/mpeg", []string{"-c:a", "libmp3lame"}},
		{"FLAC", "flac", "audio/flac", []string{"-c:a", "flac"}},
		{"AAC", "m4a", "audio/mp4", []string{"-c:a", "aac"}},
		{"Video with audio", "mp4", "", []string{"-f", "lavfi", "-i", "color=size=32x32", "-c:a", "aac", "-c:v", "mpeg4", "-shortest"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			filename := filepath.Join(t.TempDir(), "fixture."+test.ext)
			args := []string{"-v", "error", "-f", "lavfi", "-i", "sine=duration=0.1"}
			args = append(args, test.args...)
			if output, err := exec.Command("ffmpeg", append(args, filename)...).CombinedOutput(); err != nil {
				t.Fatalf("create fixture: %v: %s", err, output)
			}
			input, err := os.Open(filename)
			if err != nil {
				t.Fatal(err)
			}
			defer input.Close()
			info, err := probeAudio(context.Background(), input)
			if info.MIME != test.mime || (err == nil) != (test.mime != "") {
				t.Fatalf("got MIME %q and error %v, want MIME %q", info.MIME, err, test.mime)
			}
		})
	}
	t.Run("Forged file", func(t *testing.T) {
		if _, err := probeAudio(context.Background(), bytes.NewBufferString("not audio")); err == nil {
			t.Fatal("expected audio validation to reject text")
		}
	})
}
