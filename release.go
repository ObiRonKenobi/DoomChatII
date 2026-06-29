package main

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"
)

func (h *Hub) LoadRelease(path string) {
	version, notes, err := parseReleaseFile(path)
	if err != nil {
		log.Println("release notes disabled:", err)
		return
	}
	stored, _ := h.db.GetMeta("release_version")
	h.releaseVersion = version
	h.releaseNotes = notes
	if stored != version {
		if err := h.db.SetMeta("release_version", version); err != nil {
			log.Println("release meta:", err)
		} else {
			log.Printf("new release published: %s", version)
			h.announceReleaseInLobby(version, notes)
		}
	}
}

func (h *Hub) announceReleaseInLobby(version, notes string) {
	h.rooms.ensureLobby()
	text := buildReleaseChatMessage(version, notes)
	now := time.Now().UTC()
	h.history.Add(lobbyRoom, "server", text, false)
	h.broadcastRoom(lobbyRoom, ServerMessage{
		Type:      "chat",
		Target:    TargetChat,
		Room:      lobbyRoom,
		Nick:      "server",
		Text:      text,
		Timestamp: now.UnixMilli(),
	})
}

func buildReleaseChatMessage(version, notes string) string {
	if notes == "" {
		return "DoomChat II v" + version + " — hard refresh for the latest client."
	}
	var parts []string
	for _, line := range strings.Split(strings.TrimSpace(notes), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts = append(parts, line)
		if len(parts) >= 2 {
			break
		}
	}
	return "DoomChat II v" + version + ": " + strings.Join(parts, " ")
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
