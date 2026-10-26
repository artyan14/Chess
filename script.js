// ---------- ЭКРАНЫ ----------
const mainMenu = document.getElementById("main-menu");
const modeMenu = document.getElementById("mode-menu");
const gameScreen = document.getElementById("game-screen");

const startButton = document.getElementById("start-button");
const backButton = document.getElementById("back-button");
const botModeButton = document.getElementById("bot-mode");
const friendModeButton = document.getElementById("friend-mode");
const menuButton = document.getElementById("menu-button");

const board = document.getElementById("board");
const status = document.getElementById("status");
const message = document.getElementById("message");
const gameTitle = document.getElementById("game-title");
const restartButton = document.getElementById("restart-button");
const undoButton = document.getElementById("undo-button");

// ---------- ЭКРАНЫ ИГРЫ ----------
function showScreen(screen) {
    mainMenu.classList.add("hidden");
    modeMenu.classList.add("hidden");
    gameScreen.classList.add("hidden");
    screen.classList.remove("hidden");
}

startButton.addEventListener("click", () => showScreen(modeMenu));
backButton.addEventListener("click", () => showScreen(mainMenu));
menuButton.addEventListener("click", () => showScreen(mainMenu));

// ---------- ШАХМАТЫ ----------
const game = new Chess();

let selectedSquare = null;
let legalMoves = [];
let mode = "friend";
let botThinking = false;
let engine = null;
let engineReady = false;
let engineRequestId = 0;

const pieces = {
    w: { k: "wK", q: "wQ", r: "wR", b: "wB", n: "wN", p: "wP" },
    b: { k: "bK", q: "bQ", r: "bR", b: "bB", n: "bN", p: "bP" }
};

// ---------- STOCKFISH ----------
function stopEngine() {
    engineRequestId++;

    if (engine) {
        engine.terminate();
        engine = null;
    }

    engineReady = false;
    botThinking = false;
}

function startEngine() {
    stopEngine();

    try {
        // Этот файл и stockfish.wasm должны лежать рядом с index.html.
        engine = new Worker("stockfish.wasm.js");

        engine.onmessage = function (event) {
            const line = String(event.data);

            if (line === "uciok") {
                engine.postMessage("isready");
                return;
            }

            if (line === "readyok") {
                engineReady = true;
                message.textContent = "Stockfish готов к игре!";
                maybeStartBot();
                return;
            }

            if (line.startsWith("bestmove")) {
                if (mode !== "bot" || !botThinking) return;

                const requestId = engineRequestId;
                const parts = line.split(/\s+/);
                const bestMove = parts[1];

                botThinking = false;

                if (!bestMove || bestMove === "(none)") {
                    renderBoard();
                    return;
                }

                // Не применяем устаревший ответ движка.
                if (requestId !== engineRequestId) return;

                const move = game.move({
                    from: bestMove.slice(0, 2),
                    to: bestMove.slice(2, 4),
                    promotion: bestMove.length > 4
                        ? bestMove[4]
                        : "q"
                });

                if (move) {
                    selectedSquare = null;
                    legalMoves = [];
                    message.textContent = "Stockfish сыграл: " + move.san;
                    renderBoard();
                }
            }
        };

        engine.onerror = function (event) {
            botThinking = false;
            message.textContent =
                "Ошибка Stockfish. Проверь файлы движка и Console.";
            console.error("Ошибка Stockfish:", event.message || event);
        };

        engine.postMessage("uci");
    } catch (error) {
        console.error("Не удалось запустить Stockfish:", error);
        message.textContent = "Не удалось запустить Stockfish.";
    }
}

function maybeStartBot() {
    if (
        mode !== "bot" ||
        !engineReady ||
        botThinking ||
        game.game_over() ||
        game.turn() !== "b"
    ) {
        return;
    }

    botThinking = true;
    message.textContent = "Stockfish думает...";

    setTimeout(() => {
        if (
            mode !== "bot" ||
            game.game_over() ||
            game.turn() !== "b" ||
            !engine
        ) {
            botThinking = false;
            return;
        }

        engine.postMessage("position fen " + game.fen());
        engine.postMessage("go depth 8");
    }, 1500);
}


// ---------- ДОСКА ----------
function createBoard() {
    board.innerHTML = "";

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement("button");

            square.type = "button";
            square.classList.add("square");
            square.classList.add(
                (row + col) % 2 === 0 ? "light" : "dark"
            );

            square.dataset.square = "abcdefgh"[col] + (8 - row);
            square.addEventListener("click", handleSquareClick);

            board.appendChild(square);
        }
    }
}

function renderBoard() {
    const position = game.board();
    const squares = board.querySelectorAll(".square");

    squares.forEach(square => {
        const name = square.dataset.square;
        const col = "abcdefgh".indexOf(name[0]);
        const row = 8 - Number(name[1]);
        const piece = position[row][col];

        square.innerHTML = "";
        square.classList.remove(
            "selected",
            "possible-move",
            "possible-capture",
            "in-check"
        );

        if (piece) {
            const image = document.createElement("img");

            image.src =
                "https://lichess1.org/assets/piece/cburnett/" +
                pieces[piece.color][piece.type] +
                ".svg";

            image.alt =
                piece.color === "w" ? "Белая фигура" : "Чёрная фигура";

            image.classList.add("chess-piece");
            square.appendChild(image);
        }

        if (name === selectedSquare) {
            square.classList.add("selected");
        }

        const move = legalMoves.find(m => m.to === name);

        if (move) {
            square.classList.add(
                move.captured || move.flags.includes("e")
                    ? "possible-capture"
                    : "possible-move"
            );
        }
    });

    if (game.in_check()) {
        const kingColor = game.turn();
        const kingSquare = findKingSquare(kingColor);
        const king = kingSquare
            ? board.querySelector(`[data-square="${kingSquare}"]`)
            : null;

        if (king) king.classList.add("in-check");
    }

    updateStatus();
}

function findKingSquare(color) {
    const files = "abcdefgh";
    const position = game.board();

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = position[row][col];

            if (piece && piece.type === "k" && piece.color === color) {
                return files[col] + (8 - row);
            }
        }
    }

    return null;
}

// ---------- ХОДЫ ИГРОКА ----------
function handleSquareClick(event) {
    if (game.game_over() || botThinking) return;

    // В режиме бота игрок управляет только белыми.
    if (mode === "bot" && game.turn() !== "w") return;

    const square = event.currentTarget.dataset.square;
    const piece = game.get(square);

    if (selectedSquare === null) {
        selectPiece(square, piece);
        return;
    }

    if (piece && piece.color === game.turn()) {
        selectPiece(square, piece);
        return;
    }

    const move = legalMoves.find(m => m.to === square);

    if (!move) {
        message.textContent = "Выбери подсвеченную клетку.";
        return;
    }

    let promotion = "q";

    if (move.flags.includes("p")) {
        const answer = prompt(
            "Превратить пешку в ферзя, ладью, слона или коня? Введи q, r, b или n.",
            "q"
        );

        if (answer === null) return;

        promotion = answer.toLowerCase();

        if (!["q", "r", "b", "n"].includes(promotion)) {
            message.textContent = "Неверный выбор фигуры.";
            return;
        }
    }

    const result = game.move({
        from: selectedSquare,
        to: square,
        promotion
    });

    if (result) {
        message.textContent = "Твой ход: " + result.san;
    }

    selectedSquare = null;
    legalMoves = [];
    renderBoard();

    if (mode === "bot" && !game.game_over()) {
        maybeStartBot();
    }
}

function selectPiece(square, piece) {
    if (!piece || piece.color !== game.turn()) {
        selectedSquare = null;
        legalMoves = [];
        renderBoard();
        message.textContent = "Выбери фигуру своего цвета.";
        return;
    }

    selectedSquare = square;
    legalMoves = game.moves({ square, verbose: true });

    message.textContent = legalMoves.length
        ? "Выбери подсвеченную клетку."
        : "У этой фигуры нет доступных ходов.";

    renderBoard();
}

// ---------- СТАТУС ПАРТИИ ----------
function updateStatus() {
    if (game.in_checkmate()) {
        status.textContent =
            "Мат! Победили " +
            (game.turn() === "w" ? "чёрные." : "белые.");
    } else if (game.in_stalemate()) {
        status.textContent = "Пат! Ничья.";
    } else if (game.in_draw()) {
        status.textContent = "Ничья!";
    } else if (game.in_check()) {
        status.textContent =
            (game.turn() === "w" ? "Белым" : "Чёрным") + " шах!";
    } else if (mode === "bot" && game.turn() === "b" && botThinking) {
        status.textContent = "Ход Stockfish — думает...";
    } else {
        status.textContent =
            "Ход " + (game.turn() === "w" ? "белых" : "чёрных");
    }
}

// ---------- НОВАЯ ПАРТИЯ ----------
function startGame(selectedMode) {
    stopEngine();

    mode = selectedMode;
    game.reset();
    selectedSquare = null;
    legalMoves = [];

    gameTitle.textContent =
        mode === "bot" ? "Игра против Stockfish" : "Игра с другом";

    showScreen(gameScreen);
    renderBoard();

    if (mode === "bot") {
        message.textContent = "Запускаем Stockfish...";
        startEngine();
    } else {
        message.textContent = "Белые ходят первыми.";
    }
}

function restartGame() {
    game.reset();
    selectedSquare = null;
    legalMoves = [];
    botThinking = false;

    if (mode === "bot") {
        message.textContent = "Перезапускаем партию...";
        startEngine();
    } else {
        message.textContent = "Новая партия началась!";
    }

    renderBoard();
}

function undoMove() {
    if (botThinking) {
        message.textContent = "Подожди, пока Stockfish закончит ход.";
        return;
    }

    if (mode === "bot") {
        // Отменяем ответ бота и предыдущий ход игрока.
        game.undo();
        game.undo();
    } else {
        game.undo();
    }

    selectedSquare = null;
    legalMoves = [];
    botThinking = false;

    if (mode === "bot" && engine) {
        engine.postMessage("stop");
    }

    message.textContent = "Ход отменён.";
    renderBoard();
}

botModeButton.addEventListener("click", () => startGame("bot"));
friendModeButton.addEventListener("click", () => startGame("friend"));
restartButton.addEventListener("click", restartGame);
undoButton.addEventListener("click", undoMove);

createBoard();
renderBoard();
showScreen(mainMenu);
