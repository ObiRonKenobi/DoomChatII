package main

import (
	"fmt"
	"strconv"
	"strings"
)

func (h *Hub) handleBoardCommand(c *Client, msg ClientMessage) {
	if h.db == nil {
		c.sendError("boards unavailable")
		return
	}
	switch msg.Type {
	case "board_list":
		boards, err := h.db.ListBoards()
		if err != nil {
			c.sendError("failed to list boards")
			return
		}
		if len(boards) == 0 {
			c.sendSystem("No boards yet. Use /board create <name>")
			return
		}
		var lines []string
		for _, b := range boards {
			lines = append(lines, fmt.Sprintf("[%d] %s", b.ID, b.Name))
		}
		c.sendSystem("Boards:\n" + strings.Join(lines, "\n"))
	case "board_create":
		name := strings.TrimSpace(msg.Name)
		if name == "" {
			c.sendError("usage: /board create <name>")
			return
		}
		if _, err := h.db.CreateBoard(name); err != nil {
			c.sendError("could not create board (name may exist)")
			return
		}
		c.sendSystem(fmt.Sprintf("Board %q created.", name))
	case "thread_list":
		boardName := strings.TrimSpace(msg.Board)
		if boardName == "" {
			c.sendError("usage: /threads <board>")
			return
		}
		boardID, err := h.db.GetBoardByName(boardName)
		if err != nil {
			c.sendError(boardNotFoundErr(boardName).Error())
			return
		}
		threads, err := h.db.ListThreads(boardID)
		if err != nil {
			c.sendError("failed to list threads")
			return
		}
		if len(threads) == 0 {
			c.sendSystem(fmt.Sprintf("No threads on board %q.", boardName))
			return
		}
		var lines []string
		for _, t := range threads {
			lines = append(lines, fmt.Sprintf("[%d] %s — %s", t.ID, t.Title, t.Nick))
		}
		c.sendSystem(fmt.Sprintf("Threads on %q:\n%s", boardName, strings.Join(lines, "\n")))
	case "thread_create":
		boardName := strings.TrimSpace(msg.Board)
		title := strings.TrimSpace(msg.Title)
		if boardName == "" || title == "" {
			c.sendError("usage: /thread create <board> <title>")
			return
		}
		if c.nick == "" {
			c.sendError("set a nick first")
			return
		}
		boardID, err := h.db.GetBoardByName(boardName)
		if err != nil {
			c.sendError(boardNotFoundErr(boardName).Error())
			return
		}
		id, err := h.db.CreateThread(boardID, title, c.nick)
		if err != nil {
			c.sendError("failed to create thread")
			return
		}
		c.sendSystem(fmt.Sprintf("Thread [%d] %q created on %q.", id, title, boardName))
	case "post_list":
		threadID, err := strconv.ParseInt(strings.TrimSpace(msg.Thread), 10, 64)
		if err != nil {
			c.sendError("usage: /posts <thread_id>")
			return
		}
		posts, err := h.db.ListPosts(threadID)
		if err != nil {
			c.sendError("failed to list posts")
			return
		}
		if len(posts) == 0 {
			c.sendSystem("No posts in this thread.")
			return
		}
		var lines []string
		for _, p := range posts {
			lines = append(lines, fmt.Sprintf("[%d] <%s> %s", p.ID, p.Nick, p.Body))
		}
		c.sendSystem(strings.Join(lines, "\n"))
	case "post_create":
		threadID, err := strconv.ParseInt(strings.TrimSpace(msg.Thread), 10, 64)
		if err != nil {
			c.sendError("usage: /post <thread_id> <body>")
			return
		}
		body := strings.TrimSpace(msg.Body)
		if body == "" {
			c.sendError("post body required")
			return
		}
		if c.nick == "" {
			c.sendError("set a nick first")
			return
		}
		if !validateText(body) {
			c.sendError("invalid post body")
			return
		}
		id, err := h.db.CreatePost(threadID, c.nick, body)
		if err != nil {
			c.sendError("failed to create post")
			return
		}
		c.sendSystem(fmt.Sprintf("Posted [%d] to thread %d.", id, threadID))
	}
}
