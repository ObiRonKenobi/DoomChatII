package main

import (
	"log"
	"time"
)

const messageRetention = 24 * time.Hour

type MessageLog struct {
	db *DB
}

func NewMessageLog(db *DB) *MessageLog {
	ml := &MessageLog{db: db}
	go ml.purgeLoop()
	return ml
}

func (ml *MessageLog) Add(room, nick, text string, encrypted bool) {
	at := time.Now().UTC()
	if err := ml.db.InsertChatMessage(room, nick, text, encrypted, at); err != nil {
		log.Println("chat history insert:", err)
	}
}

func (ml *MessageLog) GetRoomHistory(room string) []HistoryEntry {
	cutoff := time.Now().UTC().Add(-messageRetention)
	entries, err := ml.db.GetChatHistory(room, cutoff)
	if err != nil {
		log.Println("chat history read:", err)
		return nil
	}
	return entries
}

func (ml *MessageLog) purgeLoop() {
	ticker := time.NewTicker(15 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().UTC().Add(-messageRetention)
		if err := ml.db.PurgeChatMessages(cutoff); err != nil {
			log.Println("chat history purge:", err)
		}
	}
}
