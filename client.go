package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.unregister <- c
		c.conn.Close()
	}()
	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		msg, err := parseClientMessage(data)
		if err != nil {
			c.sendError("invalid message format")
			continue
		}
		if msg.Type != "hello" && c.sessionID != "" {
			h.sessions.Touch(c.sessionID)
		}
		c.handleMessage(h, msg)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) handleMessage(h *Hub, msg ClientMessage) {
	switch msg.Type {
	case "hello":
		c.handleHello(h, msg)
	case "nick":
		c.handleNick(h, msg)
	case "chat":
		c.handleChat(h, msg)
	case "join":
		c.handleJoin(h, msg)
	case "part":
		c.handlePart(h, msg)
	case "create_room":
		c.handleCreateRoom(h, msg)
	case "theme", "font":
		// client-side only
	case "trivia_start":
		c.handleTriviaStart(h, msg)
	case "trivia_stop":
		c.handleTriviaStop(h, msg)
	case "trivia_once":
		c.handleTriviaOnce(h, msg)
	case "ascii":
		c.handleAscii(h, msg)
	case "roll":
		c.handleRoll(h, msg)
	case "emote":
		c.handleEmote(h, msg)
	case "list":
		c.handleList(h)
	case "users":
		c.handleUsers(h, msg)
	case "board_list", "board_create", "thread_list", "thread_create", "post_list", "post_create":
		h.handleBoardCommand(c, msg)
	case "logout":
		c.handleLogout(h)
	default:
		c.sendError("unknown message type: " + msg.Type)
	}
}

func (c *Client) handleHello(h *Hub, msg ClientMessage) {
	c.mu.Lock()
	c.sessionID = strings.TrimSpace(msg.SessionID)
	c.mu.Unlock()

	if c.sessionID == "" {
		c.Send(ServerMessage{Type: "session_new", Target: TargetSystem})
		c.sendSystem("Welcome to DoomChat II. Set your nick: /nick YourName#secret")
		_ = c.joinRoom(h, lobbyRoom)
		c.sendReleaseNotice(h)
		return
	}

	if restored, ok := h.sessions.CanRestore(c.sessionID); ok {
		c.mu.Lock()
		c.nick = restored.Nick
		if msg.Nick != "" && validateNick(msg.Nick) {
			c.nick = msg.Nick
		}
		c.mu.Unlock()
		h.sessions.Upsert(c.sessionID, c.nick, restored.Rooms, c)
		for _, roomName := range restored.Rooms {
			_ = c.joinRoom(h, roomName)
		}
		if len(restored.Rooms) == 0 {
			_ = c.joinRoom(h, lobbyRoom)
		}
		c.Send(ServerMessage{
			Type:   "session_restored",
			Target: TargetSystem,
			Nick:   c.nick,
			Rooms:  c.joinedRooms(),
		})
		c.sendSystem("Session restored. Welcome back, " + displayNick(c.nick))
		c.sendReleaseNotice(h)
		return
	}

	h.sessions.Upsert(c.sessionID, "", nil, c)
	c.Send(ServerMessage{Type: "session_new", Target: TargetSystem})
	if msg.Nick != "" && validateNick(msg.Nick) {
		c.mu.Lock()
		c.nick = msg.Nick
		c.mu.Unlock()
		h.sessions.UpdateNick(c.sessionID, c.nick)
	}
	c.sendSystem("Welcome to DoomChat II. Set your nick: /nick YourName#secret")
	_ = c.joinRoom(h, lobbyRoom)
	c.sendReleaseNotice(h)
}

func (c *Client) handleNick(h *Hub, msg ClientMessage) {
	nick := strings.TrimSpace(msg.Nick)
	if !validateNick(nick) {
		switch strings.ToLower(nick) {
		case "trivia", "*trivia*", "ascii", "roll", "emote", "server":
			c.sendError("nick reserved — pick another name")
		default:
			c.sendError("invalid nick")
		}
		return
	}
	c.mu.Lock()
	if time.Since(c.lastNick) < 2*time.Second {
		c.mu.Unlock()
		c.sendError("nick change rate limited")
		return
	}
	old := c.nick
	c.nick = nick
	c.lastNick = time.Now()
	c.mu.Unlock()

	if c.sessionID != "" {
		h.sessions.UpdateNick(c.sessionID, nick)
	}
	if old != "" {
		for _, roomName := range c.joinedRooms() {
			h.broadcastRoomSystem(roomName, old+" is now known as "+nick)
		}
	}
	c.sendSystem("Nick set to " + nick)
}

func (c *Client) handleChat(h *Hub, msg ClientMessage) {
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	c.mu.Lock()
	nick := c.nick
	_, inRoom := c.rooms[roomName]
	c.mu.Unlock()

	if nick == "" {
		c.sendError("set a nick first: /nick YourName#secret")
		return
	}
	if !inRoom {
		c.sendError("not in room " + roomName)
		return
	}
	if !validateText(msg.Text) {
		c.sendError("invalid message")
		return
	}

	room, ok := h.rooms.Get(roomName)
	if !ok {
		c.sendError("room not found")
		return
	}

	if room.Encrypted && !msg.Enc {
		c.sendError("encrypted room: messages must be client-encrypted")
		return
	}

	if h.trivia != nil && h.trivia.CheckAnswer(roomName, nick, msg.Text, h) {
		return
	}

	now := time.Now().UTC()
	mentions := findMentions(msg.Text, room)
	h.history.Add(roomName, nick, msg.Text, msg.Enc)

	out := ServerMessage{
		Type:      "chat",
		Target:    TargetChat,
		Room:      roomName,
		Nick:      nick,
		Text:      msg.Text,
		Timestamp: now.UnixMilli(),
		Mentions:  mentions,
	}
	room.Broadcast(out, nil)
}

func (c *Client) handleJoin(h *Hub, msg ClientMessage) {
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		c.sendError("usage: /join #room")
		return
	}
	if err := c.joinRoom(h, roomName); err != nil {
		if err == errRoomNotFound {
			c.sendError("room not found: " + roomName)
		} else {
			c.sendError(err.Error())
		}
	}
}

func (c *Client) handlePart(h *Hub, msg ClientMessage) {
	roomName := msg.Room
	if roomName == "" {
		roomName = lobbyRoom
	}
	if normalizeRoom(roomName) == lobbyRoom {
		c.sendError("cannot part from lobby")
		return
	}
	c.partRoom(h, roomName)
}

func (c *Client) handleCreateRoom(h *Hub, msg ClientMessage) {
	name := strings.TrimSpace(msg.Name)
	if name == "" {
		c.sendError("usage: /create private <name> <password>")
		return
	}
	roomName := normalizeRoom(name)
	if !msg.Encrypted {
		c.sendError("only private encrypted rooms can be created")
		return
	}
	_, err := h.rooms.Create(roomName, true)
	if err != nil {
		c.sendError(err.Error())
		return
	}
	c.sendSystem(fmt.Sprintf("Private encrypted room %s created. /join %s <password> on clients to derive keys.", roomName, roomName))
	_ = c.joinRoom(h, roomName)
}

func (c *Client) handleTriviaStart(h *Hub, msg ClientMessage) {
	if h.trivia == nil {
		c.sendError("trivia unavailable")
		return
	}
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	room, ok := h.rooms.Get(roomName)
	if !ok || room.Encrypted {
		c.sendError("trivia only in public rooms")
		return
	}
	if err := h.trivia.Start(roomName, h); err != nil {
		c.sendError(err.Error())
		return
	}
	c.sendSystem("Trivia started in " + roomName)
}

func (c *Client) handleTriviaStop(h *Hub, msg ClientMessage) {
	if h.trivia == nil {
		return
	}
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	h.trivia.Stop(roomName, h)
	c.sendSystem("Trivia stopped in " + roomName)
}

func (c *Client) handleAscii(h *Hub, msg ClientMessage) {
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	c.mu.Lock()
	nick := c.nick
	_, inRoom := c.rooms[roomName]
	c.mu.Unlock()

	if nick == "" {
		c.sendError("set a nick first: /nick YourName#secret")
		return
	}
	if !inRoom {
		c.sendError("not in room " + roomName)
		return
	}

	room, ok := h.rooms.Get(roomName)
	if !ok {
		c.sendError("room not found")
		return
	}
	if room.Encrypted {
		c.sendError("ascii art only in public rooms")
		return
	}

	artID := strings.TrimSpace(strings.ToLower(msg.Text))
	if !validateAsciiID(artID) {
		c.sendError("invalid ascii art id")
		return
	}

	now := time.Now().UTC()
	h.history.Add(roomName, "ascii", artID, false)
	out := ServerMessage{
		Type:      "chat",
		Target:    TargetChat,
		Room:      roomName,
		Nick:      "ascii",
		Text:      artID,
		Timestamp: now.UnixMilli(),
	}
	room.Broadcast(out, nil)
}

func (c *Client) handleRoll(h *Hub, msg ClientMessage) {
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	c.mu.Lock()
	nick := c.nick
	_, inRoom := c.rooms[roomName]
	c.mu.Unlock()

	if nick == "" {
		c.sendError("set a nick first: /nick YourName#secret")
		return
	}
	if !inRoom {
		c.sendError("not in room " + roomName)
		return
	}

	room, ok := h.rooms.Get(roomName)
	if !ok {
		c.sendError("room not found")
		return
	}
	if room.Encrypted {
		c.sendError("rolls only in public rooms")
		return
	}

	expr := strings.TrimSpace(msg.Text)
	if !validateRollExpr(expr) {
		c.sendError(rollUsageHint())
		return
	}

	detail, err := executeRoll(expr)
	if err != nil {
		c.sendError(err.Error())
		return
	}
	text := formatRollMessage(nick, detail)
	now := time.Now().UTC()
	h.history.Add(roomName, "roll", text, false)
	out := ServerMessage{
		Type:      "chat",
		Target:    TargetChat,
		Room:      roomName,
		Nick:      "roll",
		Text:      text,
		Timestamp: now.UnixMilli(),
	}
	room.Broadcast(out, nil)
}

func (c *Client) handleEmote(h *Hub, msg ClientMessage) {
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	c.mu.Lock()
	nick := c.nick
	_, inRoom := c.rooms[roomName]
	c.mu.Unlock()

	if nick == "" {
		c.sendError("set a nick first: /nick YourName#secret")
		return
	}
	if !inRoom {
		c.sendError("not in room " + roomName)
		return
	}

	room, ok := h.rooms.Get(roomName)
	if !ok {
		c.sendError("room not found")
		return
	}
	if room.Encrypted {
		c.sendError("emotes only in public rooms")
		return
	}

	emoteName := strings.TrimSpace(strings.ToLower(msg.Text))
	targetRaw := strings.TrimSpace(msg.Name)
	if emoteName == "" || targetRaw == "" {
		c.sendError("usage: /emote <name> <nick>  — try /emote for list")
		return
	}
	if !validateEmote(emoteName) {
		c.sendError("unknown emote — try: " + strings.Join(emoteList(), ", "))
		return
	}

	targetNick, found := resolveRoomMember(room, targetRaw)
	if !found {
		c.sendError("user not in room: " + targetRaw)
		return
	}

	text, err := formatEmote(emoteName, nick, targetNick)
	if err != nil {
		c.sendError(err.Error())
		return
	}
	mentions := findMentions("@"+targetNick, room)
	now := time.Now().UTC()
	h.history.Add(roomName, "emote", text, false)
	out := ServerMessage{
		Type:      "chat",
		Target:    TargetChat,
		Room:      roomName,
		Nick:      "emote",
		Text:      text,
		Timestamp: now.UnixMilli(),
		Mentions:  mentions,
	}
	room.Broadcast(out, nil)
}

func (c *Client) handleTriviaOnce(h *Hub, msg ClientMessage) {
	if h.trivia == nil {
		c.sendError("trivia unavailable")
		return
	}
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	room, ok := h.rooms.Get(roomName)
	if !ok || room.Encrypted {
		c.sendError("trivia only in public rooms")
		return
	}
	if err := h.trivia.AskOnce(roomName, h); err != nil {
		c.sendError(err.Error())
		return
	}
}

func (c *Client) handleList(h *Hub) {
	list := h.rooms.ListPublicWithCounts()
	if len(list) == 0 {
		c.sendSystem("No public rooms.")
		return
	}
	var lines []string
	for _, r := range list {
		lines = append(lines, fmt.Sprintf("%s (%d)", r.Name, r.Count))
	}
	c.Send(ServerMessage{
		Type:     "room_list",
		Target:   TargetSystem,
		RoomList: list,
		Text:     strings.Join(lines, ", "),
	})
}

func (c *Client) handleUsers(h *Hub, msg ClientMessage) {
	roomName := normalizeRoom(msg.Room)
	if roomName == "" {
		roomName = lobbyRoom
	}
	c.mu.Lock()
	_, inRoom := c.rooms[roomName]
	c.mu.Unlock()
	if !inRoom {
		c.sendError("not in room " + roomName)
		return
	}
	room, ok := h.rooms.Get(roomName)
	if !ok {
		c.sendError("room not found")
		return
	}
	nicks := room.MemberNicks()
	if len(nicks) == 0 {
		c.sendSystem(fmt.Sprintf("Users in %s: (none)", roomName))
		return
	}
	c.sendSystem(fmt.Sprintf("Users in %s (%d): %s", roomName, len(nicks), strings.Join(nicks, ", ")))
}

func (c *Client) handleLogout(h *Hub) {
	sid := c.sessionID
	c.mu.Lock()
	c.nick = ""
	c.sessionID = ""
	c.mu.Unlock()
	if sid != "" {
		h.sessions.Remove(sid)
	}
	c.sendSystem("Logged out. Refresh or reconnect to start a new session.")
}

func displayNick(nick string) string {
	if nick == "" {
		return "guest"
	}
	return nick
}
