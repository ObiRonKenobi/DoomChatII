package main

import (
	"crypto/rand"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

func newSessionID() string {
	id, err := uuid.NewRandom()
	if err != nil {
		b := make([]byte, 16)
		if _, rerr := rand.Read(b); rerr != nil {
			return fmt.Sprintf("%d", randInt())
		}
		id, _ = uuid.FromBytes(b)
	}
	return id.String()
}

func randInt() int64 {
	var b [8]byte
	_, _ = rand.Read(b[:])
	var n int64
	for i := range b {
		n = n<<8 | int64(b[i])
	}
	if n < 0 {
		n = -n
	}
	return n
}

func stripTerminalEscapes(s string) string {
	var out strings.Builder
	out.Grow(len(s))
	i := 0
	for i < len(s) {
		if s[i] != '\x1b' {
			out.WriteByte(s[i])
			i++
			continue
		}
		// ESC sequence
		if i+1 >= len(s) {
			break
		}
		if s[i+1] == '[' {
			j := i + 2
			for j < len(s) && !((s[j] >= 'A' && s[j] <= 'Z') || (s[j] >= 'a' && s[j] <= 'z')) {
				j++
			}
			if j < len(s) {
				i = j + 1
				continue
			}
		}
		if s[i+1] == ']' {
			j := i + 2
			for j < len(s) && s[j] != '\x07' {
				j++
			}
			if j < len(s) {
				i = j + 1
				continue
			}
		}
		i++
	}
	return out.String()
}
