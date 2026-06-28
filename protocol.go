package main

import (
	"encoding/json"
	"strings"
	"unicode/utf8"
)

const (
	maxMessageLen = 2048
	maxNickLen    = 32
	lobbyRoom     = "#lobby"
)

const (
	TargetChat   = "chat"
	TargetSystem = "system"
)

// Inbound from client.
type ClientMessage struct {
	Type      string `json:"type"`
	SessionID string `json:"session_id,omitempty"`
	Nick      string `json:"nick,omitempty"`
	Theme     string `json:"theme,omitempty"`
	Font      string `json:"font,omitempty"`
	Room      string `json:"room,omitempty"`
	Text      string `json:"text,omitempty"`
	Name      string `json:"name,omitempty"`
	Password  string `json:"password,omitempty"`
	Encrypted bool   `json:"encrypted,omitempty"`
	Enc       bool   `json:"enc,omitempty"`
	Board     string `json:"board,omitempty"`
	Thread    string `json:"thread,omitempty"`
	Title     string `json:"title,omitempty"`
	Body      string `json:"body,omitempty"`
}

type HistoryEntry struct {
	Nick      string `json:"nick"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
	Enc       bool   `json:"enc,omitempty"`
}

// Outbound to client.
type ServerMessage struct {
	Type      string         `json:"type"`
	Target    string         `json:"target"`
	Room      string         `json:"room,omitempty"`
	Nick      string         `json:"nick,omitempty"`
	Text      string         `json:"text,omitempty"`
	Timestamp int64          `json:"timestamp,omitempty"`
	History   []HistoryEntry `json:"history,omitempty"`
	Rooms    []string       `json:"rooms,omitempty"`
	Question string         `json:"question,omitempty"`
	Number   int            `json:"number,omitempty"`
	Winner   string         `json:"winner,omitempty"`
	Answer   string         `json:"answer,omitempty"`
	NextIn   int            `json:"next_in,omitempty"`
	Scores   map[string]int `json:"scores,omitempty"`
	RoomList []RoomCount    `json:"room_list,omitempty"`
	Version  string         `json:"version,omitempty"`
	Boards   []BoardInfo    `json:"boards,omitempty"`
	Threads  []ThreadInfo   `json:"threads,omitempty"`
	Posts    []PostInfo     `json:"posts,omitempty"`
}

type BoardInfo struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type ThreadInfo struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
	Nick  string `json:"nick"`
}

type PostInfo struct {
	ID   int64  `json:"id"`
	Nick string `json:"nick"`
	Body string `json:"body"`
}

type RoomCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func (m ServerMessage) JSON() []byte {
	b, _ := json.Marshal(m)
	return b
}

func parseClientMessage(data []byte) (ClientMessage, error) {
	var msg ClientMessage
	err := json.Unmarshal(data, &msg)
	return msg, err
}

func validateNick(nick string) bool {
	if nick == "" || utf8.RuneCountInString(nick) > maxNickLen {
		return false
	}
	if strings.ContainsAny(nick, " \t\r\n#") {
		return false
	}
	bang := strings.Index(nick, "!")
	if bang >= 0 {
		if bang == 0 {
			return false
		}
		name := nick[:bang]
		trip := nick[bang+1:]
		if name == "" || len(trip) != 8 {
			return false
		}
		for i := 0; i < 8; i++ {
			c := trip[i]
			if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
				return false
			}
		}
	}
	return true
}

func validateText(text string) bool {
	return text != "" && utf8.RuneCountInString(text) <= maxMessageLen
}

func normalizeRoom(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	if !strings.HasPrefix(name, "#") {
		name = "#" + name
	}
	return strings.ToLower(name)
}
