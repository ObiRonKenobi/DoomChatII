package main

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"regexp"
	"strconv"
	"strings"
)

const (
	maxRollDice = 20
	maxRollMod  = 999
)

var (
	rollExprRE = regexp.MustCompile(`(?i)^(\d*)d(%|\d+)(?:\s*([+-]\s*\d+))?\s*$`)
	dndDiceSides = map[int]struct{}{
		2: {}, 4: {}, 6: {}, 8: {}, 10: {}, 12: {}, 20: {},
	}
)

func dndDiceList() string {
	return "d20, d12, d10, d%, d8, d6, d4, d2"
}

func rollUsageHint() string {
	return "usage: /roll d20  OR  /roll 2d6+3  OR  /roll d%  (" + dndDiceList() + ")"
}

func validateRollExpr(expr string) bool {
	_, _, _, err := parseRollExpr(expr)
	return err == nil
}

func parseSidesToken(token string) (int, error) {
	if strings.EqualFold(token, "%") {
		return 100, nil
	}
	sides, err := strconv.Atoi(token)
	if err != nil {
		return 0, fmt.Errorf("invalid die sides")
	}
	if _, ok := dndDiceSides[sides]; !ok {
		return 0, fmt.Errorf("invalid die — use: %s", dndDiceList())
	}
	return sides, nil
}

func parseRollExpr(expr string) (count, sides, modifier int, err error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return 0, 0, 0, fmt.Errorf("empty roll")
	}
	m := rollExprRE.FindStringSubmatch(expr)
	if m == nil {
		return 0, 0, 0, fmt.Errorf("invalid roll expression")
	}
	count = 1
	if m[1] != "" {
		count, err = strconv.Atoi(m[1])
		if err != nil || count < 1 {
			return 0, 0, 0, fmt.Errorf("invalid dice count")
		}
	}
	sides, err = parseSidesToken(m[2])
	if err != nil {
		return 0, 0, 0, err
	}
	if count > maxRollDice {
		return 0, 0, 0, fmt.Errorf("roll too large (max %d dice)", maxRollDice)
	}
	if m[3] != "" {
		modStr := strings.ReplaceAll(m[3], " ", "")
		modifier, err = strconv.Atoi(modStr)
		if err != nil {
			return 0, 0, 0, fmt.Errorf("invalid modifier")
		}
		if modifier > maxRollMod || modifier < -maxRollMod {
			return 0, 0, 0, fmt.Errorf("modifier out of range")
		}
	}
	return count, sides, modifier, nil
}

func rollDie(sides int) (int, error) {
	if sides <= 0 {
		return 0, fmt.Errorf("invalid sides")
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(sides)))
	if err != nil {
		return 0, err
	}
	return int(n.Int64()) + 1, nil
}

func executeRoll(expr string) (string, error) {
	count, sides, modifier, err := parseRollExpr(expr)
	if err != nil {
		return "", err
	}
	rolls := make([]int, count)
	sum := 0
	for i := 0; i < count; i++ {
		r, err := rollDie(sides)
		if err != nil {
			return "", err
		}
		rolls[i] = r
		sum += r
	}
	total := sum + modifier
	return formatRollDetail(expr, rolls, modifier, total), nil
}

func formatRollDetail(expr string, rolls []int, modifier, total int) string {
	parts := make([]string, 0, len(rolls)+1)
	for _, r := range rolls {
		parts = append(parts, strconv.Itoa(r))
	}
	rollPart := strings.Join(parts, ", ")
	modPart := ""
	if modifier > 0 {
		modPart = fmt.Sprintf(" + %d", modifier)
	} else if modifier < 0 {
		modPart = fmt.Sprintf(" - %d", -modifier)
	}
	return fmt.Sprintf("%s → %d (%s%s)", strings.TrimSpace(expr), total, rollPart, modPart)
}

func formatRollMessage(actor, detail string) string {
	return actor + " rolled " + detail
}
