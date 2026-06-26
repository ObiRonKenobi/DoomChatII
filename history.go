package main

import (
	"sort"
	"sync"
	"time"
)

const messageRetention = 24 * time.Hour

type logMessage struct {
	Nick      string
	Text      string
	Encrypted bool
	At        time.Time
}

type MessageLog struct {
	mu     sync.RWMutex
	byRoom map[string][]logMessage
}

func NewMessageLog() *MessageLog {
	ml := &MessageLog{byRoom: make(map[string][]logMessage)}
	go ml.purgeLoop()
	return ml
}

func (ml *MessageLog) Add(room, nick, text string, encrypted bool) {
	now := time.Now().UTC()
	ml.mu.Lock()
	defer ml.mu.Unlock()
	ml.purgeLocked(now)
	entries := ml.byRoom[room]
	entries = append(entries, logMessage{
		Nick:      nick,
		Text:      text,
		Encrypted: encrypted,
		At:        now,
	})
	ml.byRoom[room] = entries
}

func (ml *MessageLog) GetRoomHistory(room string) []HistoryEntry {
	ml.mu.RLock()
	defer ml.mu.RUnlock()
	cutoff := time.Now().UTC().Add(-messageRetention)
	entries := ml.byRoom[room]
	out := make([]HistoryEntry, 0, len(entries))
	for _, e := range entries {
		if e.At.Before(cutoff) {
			continue
		}
		out = append(out, HistoryEntry{
			Nick:      e.Nick,
			Text:      e.Text,
			Timestamp: e.At.UnixMilli(),
			Enc:       e.Encrypted,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Timestamp < out[j].Timestamp
	})
	return out
}

func (ml *MessageLog) purgeLoop() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		ml.mu.Lock()
		ml.purgeLocked(time.Now().UTC())
		ml.mu.Unlock()
	}
}

func (ml *MessageLog) purgeLocked(now time.Time) {
	cutoff := now.Add(-messageRetention)
	for room, entries := range ml.byRoom {
		kept := entries[:0]
		for _, e := range entries {
			if e.At.After(cutoff) {
				kept = append(kept, e)
			}
		}
		if len(kept) == 0 {
			delete(ml.byRoom, room)
		} else {
			ml.byRoom[room] = kept
		}
	}
}
