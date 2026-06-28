package main

import (
	"time"
)

func (db *DB) InsertChatMessage(room, nick, text string, encrypted bool, at time.Time) error {
	enc := 0
	if encrypted {
		enc = 1
	}
	_, err := db.conn.Exec(
		`INSERT INTO chat_messages(room, nick, body, encrypted, created_at) VALUES(?, ?, ?, ?, ?)`,
		room, nick, text, enc, at.UTC(),
	)
	return err
}

func (db *DB) GetChatHistory(room string, since time.Time) ([]HistoryEntry, error) {
	rows, err := db.conn.Query(
		`SELECT nick, body, encrypted, created_at FROM chat_messages
		 WHERE room = ? AND created_at >= ? ORDER BY created_at ASC`,
		room, since.UTC(),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []HistoryEntry
	for rows.Next() {
		var nick, body string
		var enc int
		var created time.Time
		if err := rows.Scan(&nick, &body, &enc, &created); err != nil {
			return nil, err
		}
		out = append(out, HistoryEntry{
			Nick:      nick,
			Text:      body,
			Timestamp: created.UTC().UnixMilli(),
			Enc:       enc == 1,
		})
	}
	return out, rows.Err()
}

func (db *DB) PurgeChatMessages(before time.Time) error {
	_, err := db.conn.Exec(`DELETE FROM chat_messages WHERE created_at < ?`, before.UTC())
	return err
}

func (db *DB) GetMeta(key string) (string, error) {
	var value string
	err := db.conn.QueryRow(`SELECT value FROM meta WHERE key = ?`, key).Scan(&value)
	return value, err
}

func (db *DB) SetMeta(key, value string) error {
	_, err := db.conn.Exec(
		`INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	return err
}
