import { useEffect, useRef, useState } from "react";
import "./App.css";

const SAVE_KEY = "halloween-machigai-sagashi-save-v1";

/* ---------- データ型 ---------- */

type Mode = "easy" | "normal";
type Phase = "select" | "playing" | "clear";
type Side = "left" | "right";

const DIFF_COUNT: Record<Mode, number> = { easy: 3, normal: 5 };
const MODE_LABEL: Record<Mode, string> = {
  easy: "かんたん",
  normal: "ふつう",
};

interface DiffInfo {
  type: "change" | "remove" | "add" | "size";
  /** change / add のときの、みぎの え に出る絵文字 */
  emoji?: string;
  /** size のときの大きさ */
  size?: "big" | "small";
}

interface Scene {
  name: string;
  /** 4列×3行 = 12マス。null は何もないマス（空） */
  cells: (string | null)[];
}

interface SaveData {
  clears: number;
  bestEasy: number | null;
  bestNormal: number | null;
}

interface Round {
  scene: Scene;
  diffs: Map<number, DiffInfo>;
}

/* ---------- 場面データ（怖くない、かわいい絵文字だけ） ---------- */

const SCENES: Scene[] = [
  {
    name: "おばけやしき",
    cells: [
      "🎃", "👻", "🦇", "🌙",
      "🍬", null, "🍭", "🧹",
      "🐱", "🕸️", "🍄", "🦉",
    ],
  },
  {
    name: "かぼちゃばたけ",
    cells: [
      "🌙", "⭐", "👻", "🦇",
      "🎃", "🌻", null, "🍬",
      "🐰", "🧺", "🍂", "🐦",
    ],
  },
  {
    name: "まほうのもり",
    cells: [
      "🧙", "🔮", "🌲", "🌙",
      "🍄", null, "⭐", "🦉",
      "👻", "🎃", "🍭", "🐸",
    ],
  },
];

/** 差分（変わる・増える）用の絵文字プール */
const EXTRA_EMOJIS = [
  "🎃", "👻", "🦇", "🍬", "🍭", "🌙", "⭐", "🧙",
  "🐱", "🦉", "🍄", "🔮", "🕷️", "🧹", "🍂", "🐰",
];

/* ---------- ユーティリティ ---------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SaveData>;
      return {
        clears: typeof p.clears === "number" ? p.clears : 0,
        bestEasy: typeof p.bestEasy === "number" ? p.bestEasy : null,
        bestNormal: typeof p.bestNormal === "number" ? p.bestNormal : null,
      };
    }
  } catch {
    /* 読み込めなくても初期値で続ける */
  }
  return { clears: 0, bestEasy: null, bestNormal: null };
}

function formatTime(sec: number): string {
  if (sec < 60) return `${sec}びょう`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}ふん` : `${m}ふん ${s}びょう`;
}

/** ラウンドをランダムに作る（場面・差分の場所・差分の種類すべてランダム） */
function makeRound(mode: Mode): Round {
  const scene = SCENES[Math.floor(Math.random() * SCENES.length)];
  const count = DIFF_COUNT[mode];
  const chosen = shuffle(scene.cells.map((_, i) => i)).slice(0, count);
  const diffs = new Map<number, DiffInfo>();

  for (const idx of chosen) {
    const base = scene.cells[idx];
    if (base === null) {
      // 何もないマスに、みぎの え だけ絵文字が増える
      const emoji =
        EXTRA_EMOJIS[Math.floor(Math.random() * EXTRA_EMOJIS.length)];
      diffs.set(idx, { type: "add", emoji });
      continue;
    }
    const types: DiffInfo["type"][] = ["change", "remove", "size"];
    const t = types[Math.floor(Math.random() * types.length)];
    if (t === "change") {
      const candidates = EXTRA_EMOJIS.filter((e) => e !== base);
      const emoji =
        candidates[Math.floor(Math.random() * candidates.length)];
      diffs.set(idx, { type: "change", emoji });
    } else if (t === "size") {
      diffs.set(idx, {
        type: "size",
        size: Math.random() < 0.5 ? "big" : "small",
      });
    } else {
      diffs.set(idx, { type: "remove" });
    }
  }
  return { scene, diffs };
}

/* ---------- アプリ本体 ---------- */

export default function App() {
  const [save, setSave] = useState<SaveData>(loadSave);
  const [phase, setPhase] = useState<Phase>("select");
  const [mode, setMode] = useState<Mode>("easy");
  const [round, setRound] = useState<Round | null>(null);
  const [found, setFound] = useState<Set<number>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState("");
  const [missKey, setMissKey] = useState<string | null>(null);
  const missTimer = useRef<number | null>(null);

  /* タイマー（あそんでいる間だけ進む） */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    return () => {
      if (missTimer.current !== null) {
        window.clearTimeout(missTimer.current);
      }
    };
  }, []);

  const start = (m: Mode) => {
    setMode(m);
    setRound(makeRound(m));
    setFound(new Set());
    setElapsed(0);
    setMissKey(null);
    setMessage("ひだりと みぎの えを くらべて、ちがうところを タップしてね！");
    setPhase("playing");
  };

  const backToSelect = () => {
    setPhase("select");
    setRound(null);
    setFound(new Set());
    setMissKey(null);
  };

  const handleTap = (side: Side, idx: number) => {
    if (phase !== "playing" || !round) return;
    if (found.has(idx)) return;

    if (round.diffs.has(idx)) {
      const next = new Set(found);
      next.add(idx);
      setFound(next);
      const total = round.diffs.size;
      if (next.size >= total) {
        // ぜんぶ見つけた → クリア
        setPhase("clear");
        setSave((prev) => {
          const updated: SaveData = { ...prev, clears: prev.clears + 1 };
          if (mode === "easy") {
            updated.bestEasy =
              prev.bestEasy === null
                ? elapsed
                : Math.min(prev.bestEasy, elapsed);
          } else {
            updated.bestNormal =
              prev.bestNormal === null
                ? elapsed
                : Math.min(prev.bestNormal, elapsed);
          }
          try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(updated));
          } catch {
            /* 保存できなくてもゲームは続ける */
          }
          return updated;
        });
      } else {
        const left = total - next.size;
        setMessage(
          left === 1
            ? "やったね！ あと 1こだよ。がんばれ！"
            : `やったね！ あと ${left}こ みつけてね！`,
        );
      }
      return;
    }

    // まちがいタップ：軽く反応するだけ（罰なし）
    setMessage("そこは おなじだよ。よく みて もういちど さがしてね！");
    setMissKey(`${side}-${idx}`);
    if (missTimer.current !== null) {
      window.clearTimeout(missTimer.current);
    }
    missTimer.current = window.setTimeout(() => setMissKey(null), 500);
  };

  /* みぎの え のマスに出す絵文字と大きさを決める */
  const rightCell = (
    idx: number,
  ): { emoji: string | null; sizeClass: string } => {
    if (!round) return { emoji: null, sizeClass: "" };
    const base = round.scene.cells[idx];
    const diff = round.diffs.get(idx);
    if (!diff) return { emoji: base, sizeClass: "" };
    switch (diff.type) {
      case "remove":
        return { emoji: null, sizeClass: "" };
      case "change":
      case "add":
        return { emoji: diff.emoji ?? base, sizeClass: "" };
      case "size":
        return {
          emoji: base,
          sizeClass: diff.size === "big" ? "emoji-big" : "emoji-small",
        };
    }
  };

  const renderPanel = (side: Side) => {
    if (!round) return null;
    const isLeft = side === "left";
    return (
      <section className="picture">
        <h2>{isLeft ? "ひだりの え" : "みぎの え"}</h2>
        <div className="grid">
          {round.scene.cells.map((base, idx) => {
            const content = isLeft
              ? { emoji: base, sizeClass: "" }
              : rightCell(idx);
            const isFound = found.has(idx);
            const isMiss = missKey === `${side}-${idx}`;
            const className = [
              "cell",
              content.emoji === null ? "cell-empty" : "",
              isFound ? "cell-found" : "",
              isMiss ? "cell-miss" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={idx}
                type="button"
                className={className}
                onClick={() => handleTap(side, idx)}
                aria-label={`${isLeft ? "ひだり" : "みぎ"}の え ${idx + 1}ばんめの マス`}
              >
                {content.emoji !== null && (
                  <span className={`emoji ${content.sizeClass}`}>
                    {content.emoji}
                  </span>
                )}
                {isFound && <span className="found-badge">✓</span>}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const total = round ? round.diffs.size : 0;
  const bestForMode = mode === "easy" ? save.bestEasy : save.bestNormal;

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎃 ハロウィンまちがいさがし 👻</h1>
        <div className="stats">
          <span>クリア：{save.clears}かい</span>
          <span>
            かんたん ベスト：
            {save.bestEasy === null ? "まだ" : formatTime(save.bestEasy)}
          </span>
          <span>
            ふつう ベスト：
            {save.bestNormal === null ? "まだ" : formatTime(save.bestNormal)}
          </span>
        </div>
      </header>

      {phase === "select" && (
        <main className="panel">
          <p className="lead">
            ひだりと みぎの えを くらべて、ちがうところを さがす ゲームです。
            ちがうところを みつけたら、その マスを タップしてね。
            ひだりの えでも みぎの えでも、どっちを タップしても いいよ。
          </p>
          <p className="lead-sub">モードを えらんで スタート！</p>
          <div className="mode-buttons">
            <button
              type="button"
              className="big-btn btn-easy"
              onClick={() => start("easy")}
            >
              😊 かんたん
              <span className="btn-sub">まちがい 3つ</span>
            </button>
            <button
              type="button"
              className="big-btn btn-normal"
              onClick={() => start("normal")}
            >
              🤔 ふつう
              <span className="btn-sub">まちがい 5つ</span>
            </button>
          </div>
        </main>
      )}

      {phase !== "select" && round && (
        <main>
          <div className="status-bar">
            <span className="status-item">
              みつけた：{found.size} / {total}
            </span>
            <span className="status-item">⏱️ {formatTime(elapsed)}</span>
            <span className="status-item">
              {MODE_LABEL[mode]}（{round.scene.name}）
            </span>
          </div>

          <p className="message" aria-live="polite">
            {phase === "clear"
              ? "🎉 ぜんぶ みつけたね！すごい！"
              : message}
          </p>

          <div className="pictures">
            {renderPanel("left")}
            {renderPanel("right")}
          </div>

          {phase === "clear" ? (
            <div className="panel clear-panel">
              <h2>🎉 クリア！</h2>
              <p className="clear-time">
                かかった じかん：{formatTime(elapsed)}
              </p>
              <p className="clear-best">
                {MODE_LABEL[mode]}の ベストタイム：
                {bestForMode === null ? "ー" : formatTime(bestForMode)}
              </p>
              <div className="mode-buttons">
                <button
                  type="button"
                  className="big-btn btn-again"
                  onClick={() => start(mode)}
                >
                  🔁 もういちど
                  <span className="btn-sub">
                    {MODE_LABEL[mode]}で あたらしい え
                  </span>
                </button>
                <button
                  type="button"
                  className="big-btn btn-back"
                  onClick={backToSelect}
                >
                  🏠 モードを えらぶ
                </button>
              </div>
            </div>
          ) : (
            <div className="under-buttons">
              <button
                type="button"
                className="small-btn"
                onClick={backToSelect}
              >
                モードを えらびなおす
              </button>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
