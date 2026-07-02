package main

import (
	"strings"
	"testing"
)

func TestValidateRollExpr_DnDDice(t *testing.T) {
	valid := []string{
		"d20", "D20", "2d6", "2d6+3", "1d20-2", "d%", "D%", "3d%", "4d2", "d4", "d6", "d8", "d10", "d12",
	}
	for _, expr := range valid {
		if !validateRollExpr(expr) {
			t.Errorf("expected valid: %q", expr)
		}
	}
}

func TestValidateRollExpr_RejectsNonDnD(t *testing.T) {
	invalid := []string{
		"", "d3", "d7", "d100", "2d3", "coin", "d20d6", "21d20",
	}
	for _, expr := range invalid {
		if validateRollExpr(expr) {
			t.Errorf("expected invalid: %q", expr)
		}
	}
}

func TestExecuteRoll_Range(t *testing.T) {
	for i := 0; i < 200; i++ {
		detail, err := executeRoll("d20")
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(detail, "→") {
			t.Fatalf("unexpected detail: %s", detail)
		}
	}
}

func TestRollUsageHint(t *testing.T) {
	if !strings.Contains(rollUsageHint(), "d%") {
		t.Fatal("usage hint should mention d%")
	}
}
