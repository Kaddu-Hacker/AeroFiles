#!/usr/bin/env python3
"""Net balance checker for JS sources: skips strings & comments, counts brackets."""
import sys

def check(path):
    src = open(path, encoding="utf-8").read()
    i, n, line = 0, len(src), 1
    stack, state = [], None
    pairs = {")": "(", "]": "[", "}": "{"}
    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            if state == "//":
                state = None
        if state is None:
            if c in "'\"`":
                state = c
            elif c == "/" and i + 1 < n and src[i + 1] == "/":
                state = "//"; i += 1
            elif c == "/" and i + 1 < n and src[i + 1] == "*":
                state = "/*"; i += 1
            elif c in "([{":
                stack.append((c, line))
            elif c in ")]}":
                if not stack or stack[-1][0] != pairs[c]:
                    return f"MISMATCH {c} at line {line}"
                stack.pop()
        elif state in ("'", '"'):
            if c == "\\":
                i += 1
            elif c == state:
                state = None
        elif state == "`":
            if c == "\\":
                i += 1
            elif c == "`":
                state = None
        elif state == "/*":
            if c == "*" and i + 1 < n and src[i + 1] == "/":
                state = None; i += 1
        i += 1
    if state:
        return f"unterminated {state}"
    if stack:
        return f"UNCLOSED {stack[-1][0]} opened at line {stack[-1][1]} ({len(stack)} total)"
    return "OK"

for p in sys.argv[1:]:
    print(f"{check(p):50s} {p}")
