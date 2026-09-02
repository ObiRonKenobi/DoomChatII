package main

import "testing"

func TestValidateRoomName(t *testing.T) {
	if !validateRoomName("#my-room") {
		t.Fatal("expected valid room")
	}
	if validateRoomName("#lobby") {
		t.Fatal("lobby should be invalid for create")
	}
	if validateRoomName("#bad room") {
		t.Fatal("spaces invalid")
	}
	if validateRoomName("") {
		t.Fatal("empty invalid")
	}
}

func TestValidateSessionID(t *testing.T) {
	if !validateSessionID("550e8400-e29b-41d4-a716-446655440000") {
		t.Fatal("expected valid uuid")
	}
	if validateSessionID("not-a-uuid") {
		t.Fatal("expected invalid")
	}
}

func TestMemberCapDefaults(t *testing.T) {
	cfg := LoadLimitConfig()
	if cfg.memberCap(lobbyRoom, false) != cfg.MaxLobbyMembers {
		t.Fatalf("lobby cap")
	}
	if cfg.memberCap("#test", false) != cfg.MaxPublicRoomMembers {
		t.Fatalf("public cap")
	}
	if cfg.memberCap("#test", true) != cfg.MaxPrivateRoomMembers {
		t.Fatalf("private cap")
	}
}

func TestOriginAllowed(t *testing.T) {
	allowed := []string{"https://chat.rbyt3r.com"}
	if !originAllowed("https://chat.rbyt3r.com", allowed) {
		t.Fatal("should allow")
	}
	if originAllowed("https://evil.com", allowed) {
		t.Fatal("should deny")
	}
	if !originAllowed("", allowed) {
		t.Fatal("empty origin allowed for non-browser clients")
	}
}

func TestStripTerminalEscapes(t *testing.T) {
	in := "hello \x1b[31mred\x1b[0m world"
	out := stripTerminalEscapes(in)
	if out != "hello red world" {
		t.Fatalf("got %q", out)
	}
}
