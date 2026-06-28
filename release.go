package main

import (
	"fmt"
	"log"
	"os"
	"strings"
)

func (h *Hub) LoadRelease(path string) {
	version, notes, err := parseReleaseFile(path)
	if err != nil {
		log.Println("release notes disabled:", err)
		return
	}
	stored, _ := h.db.GetMeta("release_version")
	if stored != version {
		if err := h.db.SetMeta("release_version", version); err != nil {
			log.Println("release meta:", err)
		} else {
			log.Printf("new release published: %s", version)
		}
	}
	h.releaseVersion = version
	h.releaseNotes = notes
}

func parseReleaseFile(path string) (version, notes string, err error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", "", err
	}
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
	if len(lines) == 0 || strings.TrimSpace(lines[0]) == "" {
		return "", "", fmt.Errorf("empty release file")
	}
	version = strings.TrimSpace(lines[0])
	if len(lines) > 1 {
		notes = strings.TrimSpace(strings.Join(lines[1:], "\n"))
	}
	return version, notes, nil
}

func (c *Client) sendReleaseNotice(h *Hub) {
	if h.releaseVersion == "" {
		return
	}
	c.Send(ServerMessage{
		Type:    "release",
		Target:  TargetSystem,
		Version: h.releaseVersion,
		Text:    h.releaseNotes,
	})
}
