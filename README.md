# Nahir Free Chess

A lightweight browser chess game for two players on one computer.

## Features
- Correct legal move generation through chess.js
- Check, checkmate, stalemate, threefold repetition, 50-move rule, and insufficient-material draw detection
- Castling, en passant, and promotion
- Automatic board orientation: White's side on White's turn and Black's side on Black's turn
- Legal-move and capture highlighting
- Resign button
- Animated game-result popup
- No build step required; static HTML/CSS/JS

The chess rules are handled by the chess.js rules engine rather than custom move-validation code, which avoids common illegal-move and checkmate-detection mistakes.
