package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

func OpenDB(dataDir string) (*DB, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}
	path := filepath.Join(dataDir, "doomchat.db")
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)
	db := &DB{conn: conn}
	if err := db.migrate(); err != nil {
		conn.Close()
		return nil, err
	}
	return db, nil
}

func (db *DB) Close() error {
	return db.conn.Close()
}

func (db *DB) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  author_nick TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(board_id) REFERENCES boards(id)
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  author_nick TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(thread_id) REFERENCES threads(id)
);`
	_, err := db.conn.Exec(schema)
	return err
}

func (db *DB) ListBoards() ([]BoardInfo, error) {
	rows, err := db.conn.Query(`SELECT id, name FROM boards ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var boards []BoardInfo
	for rows.Next() {
		var b BoardInfo
		if err := rows.Scan(&b.ID, &b.Name); err != nil {
			return nil, err
		}
		boards = append(boards, b)
	}
	return boards, rows.Err()
}

func (db *DB) CreateBoard(name string) (int64, error) {
	res, err := db.conn.Exec(`INSERT INTO boards(name, created_at) VALUES(?, ?)`, name, time.Now().UTC())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) GetBoardByName(name string) (int64, error) {
	var id int64
	err := db.conn.QueryRow(`SELECT id FROM boards WHERE name = ?`, name).Scan(&id)
	return id, err
}

func (db *DB) ListThreads(boardID int64) ([]ThreadInfo, error) {
	rows, err := db.conn.Query(`SELECT id, title, author_nick FROM threads WHERE board_id = ? ORDER BY created_at DESC`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var threads []ThreadInfo
	for rows.Next() {
		var t ThreadInfo
		if err := rows.Scan(&t.ID, &t.Title, &t.Nick); err != nil {
			return nil, err
		}
		threads = append(threads, t)
	}
	return threads, rows.Err()
}

func (db *DB) CreateThread(boardID int64, title, nick string) (int64, error) {
	res, err := db.conn.Exec(`INSERT INTO threads(board_id, title, author_nick, created_at) VALUES(?, ?, ?, ?)`,
		boardID, title, nick, time.Now().UTC())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) ListPosts(threadID int64) ([]PostInfo, error) {
	rows, err := db.conn.Query(`SELECT id, author_nick, body FROM posts WHERE thread_id = ? ORDER BY created_at`, threadID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var posts []PostInfo
	for rows.Next() {
		var p PostInfo
		if err := rows.Scan(&p.ID, &p.Nick, &p.Body); err != nil {
			return nil, err
		}
		posts = append(posts, p)
	}
	return posts, rows.Err()
}

func (db *DB) CreatePost(threadID int64, nick, body string) (int64, error) {
	res, err := db.conn.Exec(`INSERT INTO posts(thread_id, author_nick, body, created_at) VALUES(?, ?, ?, ?)`,
		threadID, nick, body, time.Now().UTC())
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (db *DB) GetThreadBoard(threadID int64) (int64, error) {
	var boardID int64
	err := db.conn.QueryRow(`SELECT board_id FROM threads WHERE id = ?`, threadID).Scan(&boardID)
	return boardID, err
}

func boardNotFoundErr(name string) error {
	return fmt.Errorf("board %q not found", name)
}
