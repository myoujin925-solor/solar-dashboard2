import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceDot, Brush
} from "recharts";
import Papa from "papaparse";

// ─────────────────────────────────────────────
// デザイントークン（iOS純正アプリ風）
// Apple Wallet・Stocks・Health を参照。資産管理アプリとしての落ち着きを重視。
//
// [Phase 1] ダークモード対応：
// アーティファクト実行環境は単一ファイルで完結する必要があり、CSS variables化して
// 全箇所（276箇所のC.xxx参照）をvar(--c-xxx)に書き換えるのは大規模で壊れやすいため、
// 「Cオブジェクト自体をライト/ダークの2セット用意し、現在のモードに応じて
// Cの中身をその場で書き換える」方式を採用する。既存コードのC.xxxという書き方は
// 一切変更不要で、applyTheme()を呼ぶだけで全画面に反映される。
// ─────────────────────────────────────────────
const LIGHT_PALETTE = {
  bg:       "#F2F2F7", // システム背景
  surface:  "#FFFFFF", // カード背景
  panel:    "#F7F7FA", // カード内の薄いブロック
  border:   "#E5E5EA", // セパレーター
  sun:      "#FF9F0A", // アクセントオレンジ（売電・注意系）
  sunLight: "#FFD60A",
  green:    "#34C759", // アクセントグリーン（メリット・正の値）
  greenDim: "#E8F8EC", // グリーンの薄い背景
  blue:     "#0A84FF", // システムブルー（情報・リンク）
  red:      "#FF3B30", // アクセントレッド（コスト・警告）
  // iOSのUILabel.label相当：完全な#000000ではなく、わずかに調整された黒。
  textPrimary:   "#1C1C1E",
  textSecondary: "#3C3C43",
  textMuted:     "#8E8E93",
};

const DARK_PALETTE = {
  bg:       "#000000", // iOSダークモードのシステム背景（純黒）
  surface:  "#1C1C1E", // カード背景（iOS secondarySystemBackground相当）
  panel:    "#2C2C2E", // カード内の薄いブロック
  border:   "#38383A", // セパレーター
  sun:      "#FF9F0A",
  sunLight: "#FFD60A",
  green:    "#30D158", // ダークモード用に少し明るいグリーン
  greenDim: "#16321F",
  blue:     "#0A84FF",
  red:      "#FF453A",
  textPrimary:   "#FFFFFF",
  textSecondary: "#EBEBF5",
  textMuted:     "#8E8E93",
};

// Cはモジュールレベルの可変オブジェクト。中身をライト/ダークで書き換える。
// （参照そのものは固定なので、既存のC.bg等のJSX内参照は変更不要）
const C = { ...LIGHT_PALETTE };

function applyTheme(mode) {
  const palette = mode === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  Object.assign(C, palette);
}

// [Phase 1] STYLESは以前は固定のテンプレートリテラルだったが、ダークモード対応のため
// 関数化し、テーマ変更（Cの中身が変わるたび）に再評価できるようにする。
function getStyles() {
  return `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* [Phase 3] OS側で「視差効果を減らす」設定が有効な場合、トップバーの縮小アニメなど
     すべてのtransition/animationを実質無効化する（アクセシビリティ対応）。 */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.001ms !important;
    }
  }

  /* [Phase 4] キーボードナビゲーション対応。
     :focus-visible はマウス/タップでのフォーカスでは発火せず、Tabキー等の
     キーボード操作時のみ発火するため、iPadのタッチ操作中に意図しないリングが
     常時表示される問題を避けつつ、外部キーボード接続時のナビゲーションを補助できる。
     ボタン・リンク・タブ等、ブラウザ既定のoutlineが効きにくい要素を中心にカバーする。 */
  :focus-visible {
    outline: 2px solid ${C.blue};
    outline-offset: 2px;
    border-radius: 6px;
  }

  /* form-input/form-selectは独自のフォーカス表現（box-shadowの輪郭）を既に持つため、
     :focus-visibleの太いoutlineが二重に乗らないよう打ち消す */
  .form-input:focus-visible, .form-select:focus-visible {
    outline: none;
  }

  body, #root {
    min-height: 100vh;
    background: ${C.bg};
    color: ${C.textPrimary};
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
    font-size: 15px;
    line-height: 1.45;
  }

  .mono { font-feature-settings: "tnum"; font-variant-numeric: tabular-nums; }

  /* ── スクロールバー ── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }

  /* ── レイアウト ── */
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* ── トップバー（大見出し型。iOS純正アプリの大型ナビゲーションタイトルを参照） ── */
  .topbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: ${C.bg}EE;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-bottom: 1px solid ${C.border};
    display: flex;
    align-items: center;
    gap: 12px;
    /* [Phase 3] 横向き利用時にノッチ側の余白を確保 */
    padding: 0 max(20px, env(safe-area-inset-right)) 0 max(20px, env(safe-area-inset-left));
    height: 52px;
    /* [Phase 3] sticky縮小アニメ：高さ・影の変化を滑らかにする */
    transition: height 0.2s ease, box-shadow 0.2s ease;
  }

  /* [Phase 3] スクロール時：少しだけ縮めて、影を足すことで「ページの下に
     沈み込んだ」感を出す（iOSの大見出しナビゲーションタイトルの収縮を参照） */
  .topbar.scrolled {
    height: 44px;
    box-shadow: 0 1px 8px rgba(0,0,0,0.06);
  }

  .topbar-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  .topbar-logo-text {
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.4px;
    color: ${C.textPrimary};
    line-height: 1.2;
    /* [Phase 3] サブタイトルが消える分、縦位置がガタつかないようtransitionを揃える */
    transition: font-size 0.2s ease;
  }

  .topbar.scrolled .topbar-logo-text { font-size: 15px; }

  .topbar-logo-sub {
    font-size: 11px;
    color: ${C.textMuted};
    font-weight: 400;
    /* [Phase 3] スクロール時はサブタイトルをフェード＋折り畳んで縮小に寄与させる */
    max-height: 14px;
    opacity: 1;
    overflow: hidden;
    transition: opacity 0.15s ease, max-height 0.2s ease;
  }

  .topbar.scrolled .topbar-logo-sub {
    opacity: 0;
    max-height: 0;
  }

  .topbar-divider {
    width: 1px;
    height: 24px;
    background: ${C.border};
    margin: 0 4px;
  }

  /* ── デスクトップ用 上部タブ ── */
  .nav-tabs-top {
    display: flex;
    gap: 2px;
    flex: 1;
    overflow-x: auto;
  }

  .nav-tab-top {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: ${C.textSecondary};
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, color 0.15s;
  }

  .nav-tab-top:hover { background: ${C.panel}; color: ${C.textPrimary}; }

  .nav-tab-top.active {
    background: ${C.blue}14;
    color: ${C.blue};
  }

  /* ── モバイル用 ボトムナビ（iOS純正TabBar） ── */
  .bottom-nav {
    display: none;
    position: fixed;
    bottom: 0; left: 0; right: 0;
    z-index: 200;
    background: ${C.bg}F2;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-top: 0.5px solid ${C.border};
    padding-bottom: max(2px, env(safe-area-inset-bottom));
  }

  .bottom-nav-inner {
    display: flex;
    justify-content: space-around;
    align-items: stretch;
    /* [Phase 3] 横向き利用時にノッチ側のタブが隠れないよう余白を確保 */
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }

  .bottom-nav-tab {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 6px 2px 4px;
    border: none;
    background: transparent;
    color: ${C.textMuted};
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    flex: 1;
    min-height: 48px; /* [Phase 3] タッチターゲット確保 */
    transition: color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .bottom-nav-tab.active { color: ${C.blue}; font-weight: 600; }

  .bottom-nav-icon { font-size: 22px; line-height: 1; }
  .bottom-nav-label { line-height: 1; }

  @media (max-width: 700px) {
    .nav-tabs-top, .topbar-divider, .topbar-status { display: none !important; }
    .bottom-nav { display: block; }
    /* [Phase 3] ボトムナビ自体がSafe Area分の高さを内部paddingで確保しているため、
       app-shell側の避け分もSafe Area込みの可変値にする（固定74pxだとホームインジケーターの
       大きい端末でコンテンツ末尾がナビに隠れる可能性があった） */
    .app-shell { padding-bottom: calc(74px + env(safe-area-inset-bottom)); }
    /* [Phase 3] iPhone横向き時、ノッチ側のコンテンツが隠れないよう左右にSafe Areaを加算 */
    .main-content {
      padding: 12px max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
    }
  }

  /* ── [Phase 3] iPad幅（1024px以上）：左サイドバーレイアウト ──
     iPadの横向き・Split View全画面など、十分な横幅がある場合は
     スマホ的なボトムナビ／PC的な上部タブではなく、左サイドバー常駐に切り替える。
     これによりiPadらしい「アプリらしさ」が出る。 */
  .app-shell-with-sidebar {
    display: flex;
    flex-direction: row;
    min-height: 100vh;
  }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    background: ${C.surface};
    border-right: 1px solid ${C.border};
    display: flex;
    flex-direction: column;
    /* [Phase 3] 上端（ノッチ/カメラ）・下端（ホームインジケーター）・左端（画面左端に
       接しているため、横向き時のノッチ/丸み）の3方向に対応 */
    padding: max(20px, env(safe-area-inset-top)) 12px max(20px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 20px;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sidebar-tab {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 12px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: ${C.textSecondary};
    font-family: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, color 0.15s;
    min-height: 44px; /* [Phase 3] タッチターゲット44pt確保 */
  }

  .sidebar-tab:hover { background: ${C.panel}; }

  .sidebar-tab.active {
    background: ${C.blue}14;
    color: ${C.blue};
    font-weight: 600;
  }

  .sidebar-tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sidebar-status {
    margin-top: auto;
    padding: 12px 10px 4px;
    font-size: 11px;
    color: ${C.textMuted};
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .content-with-sidebar {
    flex: 1;
    min-width: 0;
    padding: 32px 40px max(32px, env(safe-area-inset-bottom));
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
    /* [Phase 4] タブ切替クロスフェードのため基準を作る（main-contentと同様） */
    position: relative;
  }

  /* [Phase 3] 5段階ブレークポイントのうち最大幅帯（iPad Pro 12.9"横向きなど）。
     左サイドバー＋中央コンテンツの2ペイン構成は維持しつつ、コンテンツ幅の
     上限だけを広げて余白を有効活用する（3ペイン化は別タスクとして扱う）。 */
  @media (min-width: 1366px) {
    .content-with-sidebar {
      max-width: 1180px;
      padding: 40px 48px max(40px, env(safe-area-inset-bottom));
    }
    .kpi-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* レイアウト自体の切替はJS側のisPad（useMediaQuery）判定で行うため、
     ここではCSSによる表示/非表示の自動切替は行わない。
     （両方を同時にレンダーするとフォーム入力中のstateが二重化する事故につながるため） */

  /* ── メインコンテンツ ── */
  .main-content {
    flex: 1;
    padding: 20px 24px;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    /* [Phase 4] タブ切替クロスフェードのため、非アクティブパネルをabsolute配置できるよう基準を作る */
    position: relative;
  }

  /* [Phase 4] タブ切替クロスフェード。
     既存方針（全タブ常時マウントしフォーム入力を保持）はそのまま維持し、
     display:none ⇄ block の代わりに opacity だけをアニメーションさせる。
     非アクティブ時は pointer-events:none で誤操作を防ぎ、position:absolute で
     レイアウトに高さを残さない（複数パネルが同時に高さを持つと縦に伸びてしまうため）。 */
  .tab-panel {
    transition: opacity 0.18s ease;
  }

  .tab-panel.tab-panel-inactive {
    /* position:absoluteの時点でレイアウトフローから外れるため、.main-content の
       高さには影響しない（height指定は不要、かつinset:0と衝突するため使わない） */
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .tab-panel.tab-panel-active {
    opacity: 1;
    position: relative;
  }

  @media (prefers-reduced-motion: reduce) {
    .tab-panel { transition: none; }
  }

  /* ── ページヘッダー（大見出し） ── */
  .page-header {
    margin-bottom: 28px;
    padding-top: 8px;
  }

  .page-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: clamp(26px, 7vw, 32px); /* [Phase 1] Dynamic Type対応：文字サイズ設定が大きい環境でも崩れにくい */
    font-weight: 700;
    color: ${C.textPrimary};
    letter-spacing: -0.2px;
    line-height: 1.2;
  }

  .page-title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: ${C.blue};
    flex-shrink: 0;
    box-shadow: 0 2px 6px ${C.blue}55;
  }

  .page-subtitle {
    font-size: 14px;
    color: ${C.textMuted};
    margin-top: 6px;
    font-weight: 500;
  }

  /* ── カード（Apple Wallet風：影は極めて弱く） ── */
  .card {
    background: ${C.surface};
    border-radius: 16px;
    padding: 18px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: ${C.textMuted};
    letter-spacing: 0.02em;
  }

  /* ── KPIカード ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }

  @media (max-width: 700px) {
    .kpi-grid {
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
  }

  /* [Phase 3] 5段階ブレークポイントの最小帯（iPhone SEなど≤480px）。
     2列グリッド自体は700px幅の規則を継承しつつ、カード内側の余白だけを
     さらに詰めて、狭い列幅でも数値・ラベルが詰まらないようにする。 */
  @media (max-width: 480px) {
    .kpi-grid { gap: 8px; }
    .kpi-card { padding: 11px; }
  }

  .kpi-card {
    background: ${C.surface};
    border-radius: 14px;
    padding: 14px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }

  .kpi-label {
    font-size: 11px;
    font-weight: 500;
    color: ${C.textMuted};
    margin-bottom: 6px;
  }

  .kpi-value {
    font-size: clamp(18px, 5vw, 22px); /* [Phase 1] Dynamic Type対応 */
    font-weight: 700;
    color: ${C.textPrimary};
    letter-spacing: -0.4px;
    line-height: 1.1;
    font-feature-settings: "tnum";
  }

  .kpi-unit {
    font-size: 12px;
    color: ${C.textMuted};
    margin-left: 3px;
    font-weight: 500;
  }

  .kpi-sub {
    font-size: 11px;
    color: ${C.textMuted};
    margin-top: 6px;
  }

  .kpi-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    margin-top: 6px;
  }

  .badge-green { background: ${C.greenDim}; color: ${C.green}; }
  .badge-sun   { background: #FFF3E0; color: ${C.sun}; }
  .badge-red   { background: #FFEBEE; color: ${C.red}; }

  /* ── 大きなヒーロー数値（投資回収率など最重要指標） ── */
  .hero-stat {
    text-align: left;
  }

  .hero-stat-label {
    font-size: 13px;
    color: ${C.textMuted};
    font-weight: 500;
    margin-bottom: 4px;
  }

  .hero-stat-value {
    font-size: clamp(40px, 12vw, 52px); /* [Phase 1] Dynamic Type対応 */
    font-weight: 700;
    letter-spacing: -1.5px;
    line-height: 1;
    font-feature-settings: "tnum";
  }

  .hero-stat-unit {
    font-size: 22px;
    font-weight: 600;
    margin-left: 4px;
    color: ${C.textMuted};
  }

  /* ── グリッドレイアウト ── */
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  @media (max-width: 700px) {
    .grid-2 { grid-template-columns: 1fr; }
  }

  /* ── プログレスバー（iOS風：細く控えめ） ── */
  .progress-track {
    height: 6px;
    background: ${C.border};
    border-radius: 99px;
    overflow: hidden;
    margin: 10px 0;
  }

  .progress-fill {
    height: 100%;
    border-radius: 99px;
    transition: width 0.6s cubic-bezier(.4,0,.2,1);
  }

  /* ── 空状態 ── */
  .empty-state {
    text-align: center;
    padding: 56px 20px;
    color: ${C.textMuted};
  }

  .empty-icon {
    font-size: 36px;
    margin-bottom: 12px;
    opacity: 0.4;
  }

  .empty-title {
    font-size: 15px;
    font-weight: 600;
    color: ${C.textSecondary};
    margin-bottom: 6px;
  }

  .empty-desc {
    font-size: 13px;
    line-height: 1.6;
    color: ${C.textMuted};
  }

  /* ── ボタン（iOS純正風：角丸大きめ、塗り or テキストのみ） ── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 16px;
    border-radius: 12px;
    border: none;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s, transform 0.1s;
    white-space: nowrap;
    min-height: 44px; /* [Phase 3] Appleのタッチターゲット推奨サイズ(44x44pt)を確保 */
  }

  .btn:active { transform: scale(0.97); opacity: 0.8; }
  .btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .btn-primary {
    background: ${C.blue};
    color: #FFFFFF;
  }

  .btn-secondary {
    background: ${C.panel};
    color: ${C.blue};
  }

  .btn-danger {
    background: transparent;
    color: ${C.red};
  }

  /* [Phase 3] btn-smは見た目（パディング・文字サイズ）は小さくするが、
     タップ判定領域は疑似要素で44x44ptまで透明に拡張する（見た目を崩さず誤操作を防ぐ） */
  .btn-sm {
    padding: 6px 12px;
    font-size: 13px;
    border-radius: 10px;
    min-height: 32px;
    position: relative;
  }

  .btn-sm::before {
    content: "";
    position: absolute;
    top: 50%; left: 50%;
    width: max(44px, 100%);
    height: 44px;
    transform: translate(-50%, -50%);
  }

  /* ── フォーム ── */
  .form-group {
    margin-bottom: 14px;
  }

  .form-label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: ${C.textMuted};
    margin-bottom: 6px;
  }

  .form-input, .form-select {
    width: 100%;
    padding: 11px 14px;
    background: ${C.panel};
    border: none;
    border-radius: 10px;
    color: ${C.textPrimary};
    font-family: inherit;
    font-size: 15px;
    outline: none;
    transition: background 0.15s;
  }

  .form-input:focus, .form-select:focus {
    background: ${C.blue}0D;
    box-shadow: 0 0 0 2px ${C.blue}44;
  }

  .form-select option { background: ${C.surface}; }

  .form-hint {
    font-size: 11px;
    color: ${C.textMuted};
    margin-top: 4px;
  }

  /* ── リストセル（Apple設定アプリ風：これがメインの情報表示形式） ── */
  .list-group {
    background: ${C.surface};
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }

  .list-cell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 0.5px solid ${C.border};
    cursor: pointer;
    transition: background 0.1s;
    -webkit-tap-highlight-color: transparent;
  }

  .list-cell:last-child { border-bottom: none; }
  .list-cell:active { background: ${C.panel}; }
  .list-cell.no-tap { cursor: default; }
  .list-cell.no-tap:active { background: transparent; }

  .list-cell-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .list-cell-title {
    font-size: 15px;
    color: ${C.textPrimary};
    font-weight: 500;
  }

  .list-cell-subtitle {
    font-size: 12px;
    color: ${C.textMuted};
  }

  .list-cell-value {
    font-size: 16px;
    font-weight: 600;
    color: ${C.textPrimary};
    font-feature-settings: "tnum";
    text-align: right;
    flex-shrink: 0;
  }

  .list-cell-chevron {
    color: ${C.border};
    font-size: 13px;
    margin-left: 8px;
    transition: transform 0.2s;
    flex-shrink: 0;
  }

  .list-cell-chevron.expanded { transform: rotate(90deg); color: ${C.textMuted}; }

  .list-cell-detail {
    padding: 0 16px 16px 16px;
    background: ${C.panel};
  }

  .list-cell-detail-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 13px;
    border-bottom: 0.5px solid ${C.border};
  }

  .list-cell-detail-row:last-child { border-bottom: none; }

  /* ── テーブル（一部の詳細データのみ。基本はリスト形式に置き換え） ── */
  .data-table {
    width: 100%;
    border-collapse: collapse;
  }

  .data-table th {
    font-size: 11px;
    font-weight: 600;
    color: ${C.textMuted};
    padding: 8px 10px;
    text-align: left;
    border-bottom: 0.5px solid ${C.border};
  }

  .data-table td {
    padding: 10px 10px;
    border-bottom: 0.5px solid ${C.border};
    font-size: 13px;
    color: ${C.textSecondary};
  }

  .data-table tr:last-child td { border-bottom: none; }

  .data-table .num {
    color: ${C.textPrimary};
    text-align: right;
    font-feature-settings: "tnum";
  }

  /* ── 太陽アイコン（控えめなパルス。デザイン仕様により発電監視感は排除するため使用頻度を下げる） ── */
  .sun-icon { display: inline-block; }

  /* ── トースト通知 ── */
  .toast-container {
    position: fixed;
    /* [Phase 3] ホームインジケーター分のSafe Areaをボトムナビの高さに加算。
       固定90pxのままだとSafe Area分だけボトムナビと重なる端末があるため、
       env(safe-area-inset-bottom)を考慮した可変値にする。 */
    bottom: calc(90px + env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    width: calc(100% - 32px);
    max-width: 380px;
    /* [Phase 3] 横向き時にノッチ側へ寄りすぎないよう左右の最小余白を確保 */
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }

  .toast {
    background: #1C1C1EE6;
    backdrop-filter: blur(10px);
    border-radius: 14px;
    padding: 12px 18px;
    font-size: 13px;
    color: #FFFFFF;
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: toastIn 0.25s ease;
  }

  @keyframes toastIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* [Phase 4] Undo Snackbar：通常トーストと同じ位置・スタックに積むが、
     右側に「取り消す」ボタンを持つバリアント。確認モーダルの代わりに
     「実行してから取り消せる」形にすることで、削除のたびにモーダルで
     ブロックされない軽快な操作感にする（iOS純正アプリのSnackbar挙動を参照）。 */
  .toast.undo {
    justify-content: space-between;
    gap: 14px;
    /* 自動消滅までの残り時間をプログレスバーで可視化 */
    position: relative;
    overflow: hidden;
  }

  .toast-undo-btn {
    flex-shrink: 0;
    background: transparent;
    border: none;
    color: ${C.blue};
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 4px 8px;
    /* [Phase 3方針を継続] タップ判定を実寸より広げる */
    margin: -4px -8px;
  }

  .toast-undo-progress {
    position: absolute;
    bottom: 0; left: 0;
    height: 2px;
    background: ${C.blue}99;
    animation: toastUndoShrink linear forwards;
  }

  @keyframes toastUndoShrink {
    from { width: 100%; }
    to   { width: 0%; }
  }

  /* ── タグ/ステータス ── */
  .status-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 5px;
  }

  .status-dot.green { background: ${C.green}; }
  .status-dot.sun   { background: ${C.sun}; }
  .status-dot.red   { background: ${C.red}; }

  /* ── 設定画面・リスト内の行 ── */
  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 0.5px solid ${C.border};
    gap: 12px;
  }

  .settings-row:last-child { border-bottom: none; }

  .settings-row-label {
    font-size: 14px;
    color: ${C.textPrimary};
  }

  .settings-row-hint {
    font-size: 11px;
    color: ${C.textMuted};
    margin-top: 2px;
  }

  /* ── セクションラベル（リストグループの上に出す小見出し） ── */
  .section-label {
    font-size: 12px;
    font-weight: 600;
    color: ${C.textMuted};
    text-transform: uppercase;
    letter-spacing: 0.02em;
    margin: 20px 4px 8px;
  }

  .section-label:first-child { margin-top: 0; }

  /* ── タップで展開する説明文（仕様③：長文はすべてこの形式） ── */
  .disclosure {
    background: ${C.surface};
    border-radius: 14px;
    overflow: hidden;
  }

  .disclosure-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .disclosure-title {
    font-size: 14px;
    font-weight: 600;
    color: ${C.textPrimary};
  }

  .disclosure-icon {
    color: ${C.blue};
    font-size: 12px;
    transition: transform 0.2s;
  }

  .disclosure-icon.open { transform: rotate(180deg); }

  .disclosure-body {
    padding: 0 16px 16px;
    font-size: 12px;
    color: ${C.textMuted};
    line-height: 1.7;
  }
`;
}

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

// [Phase 1] 画面幅やprefers-color-scheme等のメディアクエリを購読する汎用フック。
// iPad判定（isPad, isPadLandscape）やダークモード判定に使う。
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler); // 古いSafari向けフォールバック
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [query]);

  return matches;
}

// [Phase 4] 左右スワイプでタブ移動。
// onSwipeLeft/onSwipeRightを受け取り、対象要素のtouchイベントから渡す前提のハンドラ群を返す。
// 注意点：
// - グラフ（Recharts）やフォーム入力中のテキスト選択を妨げないよう、横移動が縦移動より
//   十分大きい場合のみスワイプとみなす（縦スクロール・グラフのドラッグ操作は素通りさせる）。
// - 距離としきい値はiPad/iPhoneの一般的なスワイプ操作感（約60px）を想定。
// - enabled=false の場合は何もしないハンドラを返す（呼び出し側でiPad横向き=サイドバー構成時に無効化する）。
function useSwipeNav(onSwipeLeft, onSwipeRight, enabled = true) {
  const startRef = useRef(null);

  const onTouchStart = useCallback((e) => {
    if (!enabled || e.touches.length !== 1) { startRef.current = null; return; }
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, [enabled]);

  const onTouchEnd = useCallback((e) => {
    if (!enabled || !startRef.current) return;
    const start = startRef.current;
    startRef.current = null;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const elapsed = Date.now() - start.time;
    const SWIPE_THRESHOLD = 60; // px
    const DIRECTION_RATIO = 1.8; // 横移動が縦移動の何倍以上ならスワイプとみなすか
    if (elapsed > 600) return; // ゆっくりした操作（長押し等）はスワイプとみなさない
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return; // 縦方向の動きが大きい＝スクロール操作
    if (dx < 0) onSwipeLeft?.(); else onSwipeRight?.();
  }, [enabled, onSwipeLeft, onSwipeRight]);

  return { onTouchStart, onTouchEnd };
}

// [Phase 3] Top barのsticky縮小アニメ用フック。
// scrollイベントの代わりにIntersectionObserverで「ページ最上部のsentinel要素が
// 画面外に出たか」を監視する（設計書の指示通りIntersectionObserverを使用。
// scrollイベント＋debounceよりメインスレッド負荷が低く、passive登録の手間もない）。
function useScrolled(sentinelRef) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [sentinelRef]);

  return scrolled;
}

// タップで開閉する説明文コンポーネント（仕様③：長い説明文はすべてこの形式に統一）
function Disclosure({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="disclosure">
      <div className="disclosure-header" onClick={() => setOpen(v => !v)}>
        <span className="disclosure-title">{icon ? `${icon} ` : ""}{title}</span>
        <span className={`disclosure-icon${open ? " open" : ""}`}>▼</span>
      </div>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  );
}

const fmt = {
  yen:  (v) => `¥${Math.round(v ?? 0).toLocaleString()}`,
  kwh:  (v) => `${(v ?? 0).toFixed(1)} kWh`,
  pct:  (v) => `${(v ?? 0).toFixed(1)}%`,
  num:  (v) => (v ?? 0).toLocaleString(),
  month:(ym) => {
    if (!ym) return "—";
    const [y, m] = ym.split("-");
    return `${y}年${parseInt(m)}月`;
  },
  // グラフのX軸ラベル用：年は下2桁、月とスラッシュで短く表記（例: "25/1"）。
  // 1月だけ年を強調表示し、年の切り替わりが視認しやすいようにする。
  monthAxis: (ym) => {
    if (!ym) return "";
    const [y, m] = ym.split("-");
    const shortYear = y.slice(2);
    return `'${shortYear}/${parseInt(m)}`;
  },
  // [導入経過期間] "YYYY-MM"形式の導入月から、基準月（省略時は実行時点の今月）までの
  // 経過期間を「N年Mヶ月」形式の文字列で返す。基準月を渡せば、グラフ上の任意の月時点での
  // 経過期間（タップした月が導入から何年何ヶ月かなど）も算出できる。
  elapsedSince: (startYm, asOfYm) => {
    if (!startYm) return null;
    const [sy, sm] = startYm.split("-").map(Number);
    let ey, em;
    if (asOfYm) {
      [ey, em] = asOfYm.split("-").map(Number);
    } else {
      const now = new Date();
      ey = now.getFullYear();
      em = now.getMonth() + 1;
    }
    let totalMonths = (ey - sy) * 12 + (em - sm);
    if (totalMonths < 0) return null; // 導入前の月を指定された場合は計算しない
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    if (years === 0) return `${months}ヶ月`;
    if (months === 0) return `${years}年`;
    return `${years}年${months}ヶ月`;
  },
};

// ローカル開発環境向け: claude.ai専用のwindow.storage APIではなく
// 標準のlocalStorageを使用する（同期APIだがPromiseでラップして互換性を保つ）
async function storageGet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw != null ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

async function storageDelete(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────
// クラウド同期（jsonbin.io）
//
// localStorageは端末・ブラウザ単位でしか保存されず、Safariの自動データ削除や
// ホーム画面追加時の保存領域の違いなどでデータが消えるリスクがある。
// そのため、jsonbin.io（無料のクラウドJSON保存サービス）を「本体」として追加し、
// localStorageは通信できない時のための「オフラインキャッシュ」として引き続き使う。
//
// [セキュリティ] このアプリはGitHub Pages（Publicリポジトリ）で公開されるため、
// Bin ID・X-Master-Keyをソースコードに直接埋め込むと誰でも読み書きできてしまう。
// そのため、これらはソースコードには含めず、「設定」タブでユーザー自身が入力し、
// この端末のlocalStorageにのみ保存する（クラウド側のBinの中身には含めない）。
// ─────────────────────────────────────────────
const CLOUD_CONFIG_KEY = "cloud-sync-config"; // { binId, masterKey } をlocalStorageにのみ保存
const CLOUD_DEBOUNCE_MS = 1800;

function getCloudConfig() {
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function setCloudConfig(config) {
  try {
    if (config) localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CLOUD_CONFIG_KEY);
    return true;
  } catch { return false; }
}

// クラウド上のBinを読み込む。失敗時（未接続・ネットワークブロック・認証エラー等）はnullを返し、
// 呼び出し側でlocalStorageへのフォールバックを行う。
async function cloudFetch(config) {
  if (!config?.binId || !config?.masterKey) return null;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}/latest`, {
      method: "GET",
      headers: { "X-Master-Key": config.masterKey },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.record ?? null;
  } catch {
    return null;
  }
}

// クラウド上のBinを丸ごと上書き保存する。失敗しても例外は投げず、成否をbooleanで返す。
// keepalive=trueの場合、タブを閉じる瞬間でもリクエストが完了しやすくなる（visibilitychange用）。
async function cloudPush(config, payload, keepalive) {
  if (!config?.binId || !config?.masterKey) return false;
  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${config.binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": config.masterKey,
      },
      body: JSON.stringify(payload),
      ...(keepalive ? { keepalive: true } : {}),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// 共通計算ヘルパー
// ─────────────────────────────────────────────

// 売電収入を取得: 実際の振込額(soldIncome)があれば最優先、なければ kWh×FIT単価で推定
function getSellIncome(record, fitRate) {
  if (record.soldIncome != null && record.soldIncome !== "") {
    return { value: record.soldIncome, isActual: true };
  }
  return { value: (record.sold ?? 0) * (fitRate ?? 16), isActual: false };
}

// 指定した月(YYYY-MM)に適用される単価を、単価履歴から検索する
// historyは effectiveFrom 昇順でなくても良い（内部でソートする）
function findApplicableTariff(history, month) {
  if (!history || history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  // month以前で最も新しいeffectiveFromを探す
  let applicable = sorted[0];
  for (const h of sorted) {
    if (h.effectiveFrom <= month) applicable = h;
    else break;
  }
  return applicable;
}

// 月別の燃料調整費・再エネ賦課金を検索する（addonHistory: { "2025-01": {fuel, levy}, ... }）
// 完全一致する月が無い場合は、month以前で最も新しい記録にフォールバックする
function findApplicableAddon(addonHistory, month) {
  if (!addonHistory) return { fuel: 0, levy: 0 };
  if (addonHistory[month]) return addonHistory[month];
  const keys = Object.keys(addonHistory).filter(k => k <= month).sort();
  if (keys.length === 0) {
    const allKeys = Object.keys(addonHistory).sort();
    return allKeys.length ? addonHistory[allKeys[0]] : { fuel: 0, levy: 0 };
  }
  return addonHistory[keys[keys.length - 1]];
}

// 出光でんき（現契約）は北陸電力プランを踏襲し、基本料金のみEV割引を適用する連動構造。
// tariffCompareの値をベースに、現契約用のtariffオブジェクトを動的に生成する。
function deriveCurrentTariffFromCompare(compareTariff, evDiscount) {
  return {
    ...compareTariff,
    name: "出光でんき（北陸プラン踏襲・EV割）",
    basicFee: Math.max(0, (compareTariff.basicFee ?? 0) - (evDiscount ?? 0)),
    note: `北陸電力プランをベースに基本料金からEV割${evDiscount ?? 0}円を割引（時間帯単価・燃料調整費・賦課金は北陸電力と同額）`,
  };
}

// ─────────────────────────────────────────────
// CSV解析（北陸電力 30分値実績フォーマット）
// ─────────────────────────────────────────────
//
// 期待するヘッダー列: 年月日, 0:00-0:30, 0:30-1:00, ... 23:30-24:00, 合計使用量,
//                     ≪夏季昼間≫, ≪その他季昼間≫, ≪ウィークエンド≫, ≪夜間≫
// 各日について「夏季昼間/その他季昼間/ウィークエンド/夜間」のいずれか1列に
// その日の該当時間帯使用量が入る（排他的）構造。
//
// この関数は、CSVのテキスト内容を受け取り、月別・時間帯区分別の使用量(kWh)を集計する。
function parseHokurikuCSV(csvText) {
  const parsed = Papa.parse(csvText, { skipEmptyLines: true });
  const rows = parsed.data;

  // ヘッダー行（"年月日"を含む行）を探す
  let headerIdx = rows.findIndex(r => r[0] && r[0].replace(/"/g, "").trim() === "年月日");
  if (headerIdx === -1) {
    throw new Error("CSVの形式を認識できませんでした（「年月日」列が見つかりません）");
  }
  const header = rows[headerIdx].map(h => (h ?? "").replace(/"/g, "").trim());

  const idxDate    = header.indexOf("年月日");
  const idxTotal   = header.indexOf("合計使用量");
  const idxSummer  = header.indexOf("≪夏季昼間≫");
  const idxOther   = header.indexOf("≪その他季昼間≫");
  const idxWeekend = header.indexOf("≪ウィークエンド≫");
  const idxNight   = header.indexOf("≪夜間≫");

  if (idxDate === -1) throw new Error("「年月日」列が見つかりません");

  // 30分値の列インデックス（0:00-0:30 〜 23:30-24:00）を収集
  const halfHourCols = [];
  header.forEach((h, i) => {
    if (/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/.test(h)) halfHourCols.push(i);
  });

  const dataRows = rows.slice(headerIdx + 1).filter(r => r[idxDate] && r[idxDate].replace(/"/g, "").trim());

  const num = (v) => {
    const n = parseFloat((v ?? "").toString().replace(/"/g, ""));
    return isNaN(n) ? 0 : n;
  };

  // 月別 × 時間帯区分別の集計
  const monthly = {}; // { "2025-01": { summer, other, weekend, night, total, days } }
  const dailyRecords = [];

  for (const row of dataRows) {
    const dateStr = (row[idxDate] ?? "").replace(/"/g, "").trim(); // "2024/12/26"
    const m = dateStr.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!m) continue;
    const monthKey = `${m[1]}-${m[2]}`;

    const summer  = idxSummer  !== -1 ? num(row[idxSummer])  : 0;
    const other   = idxOther   !== -1 ? num(row[idxOther])   : 0;
    const weekend = idxWeekend !== -1 ? num(row[idxWeekend]) : 0;
    const night   = idxNight   !== -1 ? num(row[idxNight])   : 0;
    const total   = idxTotal   !== -1 ? num(row[idxTotal])   : (summer + other + weekend + night);

    if (!monthly[monthKey]) {
      monthly[monthKey] = { summer: 0, other: 0, weekend: 0, night: 0, total: 0, days: 0 };
    }
    monthly[monthKey].summer  += summer;
    monthly[monthKey].other   += other;
    monthly[monthKey].weekend += weekend;
    monthly[monthKey].night   += night;
    monthly[monthKey].total   += total;
    monthly[monthKey].days    += 1;

    dailyRecords.push({ date: dateStr, monthKey, summer, other, weekend, night, total });
  }

  const months = Object.keys(monthly).sort();
  if (months.length === 0) {
    throw new Error("CSVから有効な日付データを読み取れませんでした");
  }

  return {
    fileName: null,
    parsedAt: new Date().toISOString(),
    dateRange: { from: dailyRecords[0]?.date, to: dailyRecords[dailyRecords.length - 1]?.date },
    totalDays: dailyRecords.length,
    monthly,    // 月別の時間帯区分別合計
    months,     // 月キー一覧（昇順）
  };
}

// CSV分析結果を使って「くつろぎナイト12」継続時の月別料金を精密計算する
// tariffCompareHistory: 単価履歴配列。各月のtiersは[夏季昼間, その他季昼間, ウィークエンド, 夜間]の順を期待
// CSVの時間帯別データから「比率」だけを抽出し、実際の総消費量（太陽光ありの記録 = 本来必要だった総使用量）に
// その比率を当てはめて「導入なしの場合の電気代」を計算する。
//
// 重要な前提：CSVの使用量自体（kWh）は太陽光稼働後の「買電のみ」の実績であり、自家消費分は含まれていない。
// そのため、CSVの絶対量をそのまま使うと「太陽光がなかった場合」の電気代が過小評価されてしまう。
// CSVは「夜間・昼間・夏季・ウィークエンドの生活パターン（時間帯別の使用比率）」を知るためだけに使い、
// 実際の計算には records 側の総消費量（太陽光の有無に関わらず生活で必要だった総使用量）を用いる。
function calcCompareePlanFromCSV(csvAnalysis, tariffCompareHistory, records, addonHistory) {
  if (!csvAnalysis) return [];

  // recordsから月→総消費量のマップを作成
  const consumedByMonth = {};
  (records ?? []).forEach(r => { consumedByMonth[r.month] = r.consumed ?? 0; });

  return csvAnalysis.months.map(monthKey => {
    const usage = csvAnalysis.monthly[monthKey];
    const tariff = findApplicableTariff(tariffCompareHistory, monthKey);
    if (!tariff) return null;

    // CSVの実績から「時間帯別の使用比率」を算出（絶対量ではなく比率のみ採用）
    const csvTotal = usage.summer + usage.other + usage.weekend + usage.night;
    if (csvTotal <= 0) return null;
    const ratioSummer  = usage.summer  / csvTotal;
    const ratioOther   = usage.other   / csvTotal;
    const ratioWeekend = usage.weekend / csvTotal;
    const ratioNight   = usage.night   / csvTotal;

    // 実際の総消費量（records側。太陽光の有無に関わらず生活で必要だった使用量）に比率を当てはめる
    const actualConsumed = consumedByMonth[monthKey] ?? csvTotal;
    const allocSummer  = actualConsumed * ratioSummer;
    const allocOther   = actualConsumed * ratioOther;
    const allocWeekend = actualConsumed * ratioWeekend;
    const allocNight   = actualConsumed * ratioNight;

    // tiers配列から該当ラベルの単価を取得（ラベルに部分一致で対応）
    const findRate = (keyword) => {
      const tier = tariff.tiers.find(t => t.label.includes(keyword));
      return tier ? tier.rate : 0;
    };
    const rateSummer  = findRate("夏季");
    const rateOther   = findRate("その他季");
    const rateWeekend = findRate("ウィークエンド");
    const rateNight   = findRate("夜間");

    const levy = addonHistory ? (findApplicableAddon(addonHistory, monthKey)?.levy ?? 0) : 0;
    const fuel = addonHistory ? (findApplicableAddon(addonHistory, monthKey)?.fuel ?? 0) : 0;
    const addOn = levy + fuel; // 全時間帯共通で加算

    const energyCost =
      allocSummer  * (rateSummer  + addOn) +
      allocOther   * (rateOther   + addOn) +
      allocWeekend * (rateWeekend + addOn) +
      allocNight   * (rateNight   + addOn);

    const billTotal = tariff.basicFee + energyCost;

    return {
      month: monthKey,
      label: fmt.monthAxis(monthKey),
      usage,
      actualConsumed,
      csvTotal,
      basicFee: tariff.basicFee,
      energyCost: Math.round(energyCost),
      billTotal: Math.round(billTotal),
      tariffUsed: tariff.effectiveFrom,
      // CSV精密版の内訳（タップ詳細表示用）：比率をactualConsumedに当てはめた配分量を表示
      breakdown4: {
        basicFee: tariff.basicFee,
        summerKwh: Math.round(allocSummer * 10) / 10,
        otherKwh:  Math.round(allocOther  * 10) / 10,
        weekendKwh:Math.round(allocWeekend* 10) / 10,
        nightKwh:  Math.round(allocNight  * 10) / 10,
        summerRate: Math.round((rateSummer + addOn) * 100) / 100,
        otherRate:  Math.round((rateOther  + addOn) * 100) / 100,
        weekendRate:Math.round((rateWeekend+ addOn) * 100) / 100,
        nightRate:  Math.round((rateNight  + addOn) * 100) / 100,
        summerCost: Math.round(allocSummer  * (rateSummer  + addOn)),
        otherCost:  Math.round(allocOther   * (rateOther   + addOn)),
        weekendCost:Math.round(allocWeekend * (rateWeekend + addOn)),
        nightCost:  Math.round(allocNight   * (rateNight   + addOn)),
        // 参考情報：CSV実測の比率（生活パターンの根拠として表示）
        csvRatioSummer:  Math.round(ratioSummer  * 1000) / 10,
        csvRatioOther:   Math.round(ratioOther   * 1000) / 10,
        csvRatioWeekend: Math.round(ratioWeekend * 1000) / 10,
        csvRatioNight:   Math.round(ratioNight   * 1000) / 10,
      },
    };
  }).filter(Boolean);
}

// ─────────────────────────────────────────────
// デフォルトデータ
// ─────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  installCost:    2404000,  // 導入費用（円）※補助金はすでに反映済みの実質負担額
  subsidy:               0,  // 補助金（導入費用に含まれているため0扱い）
  fitRate:             8,   // 売電単価（円/kWh）※実績検証済み: 全期間8円/kWhで一致
  fitEndYear:       2033,   // FIT終了年
  installedAt:   "2025-01", // 導入月（実績データの開始月と一致）
  systemCapacity:    8.010, // 太陽光容量（kW）
  batteryCapacity:   15.0,  // 蓄電池容量（kWh）
  co2Factor:        0.439,  // CO2係数（kg/kWh）
  evDiscount:        200,   // 出光でんきのEV割引（円/月・基本料金から減額）
  // [Phase 5] 機器交換イベント（パワコン交換・将来の蓄電池交換等を想定した汎用形式）。
  // 各要素: { id, label, month("YYYY-MM"), cost }
  // 交換月に一括で累積メリットから減算され、回収グラフ上で段差として表示される。
  maintenanceEvents: [],
};

// 比較プラン: 北陸電力「くつろぎナイト12」。2025年1〜6月に実際に契約していたプラン。
// 2025年7月に出光でんきへ切替したため、これ以降は「継続していた場合の仮想シナリオ」として使用する。
// EV割は適用されない（くつろぎナイト12はEV割対象外のプラン）。
const DEFAULT_TARIFF_COMPARE = {
  effectiveFrom: "2025-01",
  name: "北陸電力「くつろぎナイト12」",
  basicFee: 2255,   // 実績通り（EV割なし）
  // tiersのlabelはCSV分析ロジックの列名と紐付けるため固定文字列を使用
  tiers: [
    { label: "夏季昼間",     rate: 39.87 },
    { label: "その他季昼間", rate: 39.87 },
    { label: "ウィークエンド", rate: 33.80 },
    { label: "夜間",         rate: 26.98 },
  ],
  // [料金タブ再編成] renewableLevy/fuelAdjustmentはここでは保持しない。
  // 燃料費調整単価・再エネ賦課金は月によって変動するため、addonHistory（月別実績）に一本化し、
  // 単価プラン（このオブジェクト）は時間帯別単価・基本料金という「契約条件」のみを持つ。
  note: "実績Excel（太陽光記録）の単価推移シートに基づく。2025年1〜6月に実際に契約していたプラン。",
  updatedAt: "2026-06",
};

// 現契約: 出光でんき。2025年7月に北陸電力から切替。
// 時間帯単価・燃料調整費・賦課金は北陸電力と同一だが、基本料金のみEV割(200円)が適用される独立したプラン。
const DEFAULT_TARIFF_CURRENT = {
  effectiveFrom: "2025-07",
  name: "出光でんき（EV割適用）",
  basicFee: 1945,   // 基本料金2145円 - EV割200円
  tiers: [
    { label: "夏季昼間",     rate: 39.87 },
    { label: "その他季昼間", rate: 39.87 },
    { label: "ウィークエンド", rate: 33.80 },
    { label: "夜間",         rate: 26.98 },
  ],
  // [料金タブ再編成] renewableLevy/fuelAdjustmentは保持しない（addonHistoryに一本化）
  note: "2025年7月に北陸電力から切替。基本料金2,145円からEV割200円を割引し1,945円。時間帯単価・燃料調整費・賦課金は北陸電力と同額。",
  updatedAt: "2026-06",
};

// 現契約の2025年1〜6月期間用エントリ：この期間は北陸電力と直接契約していたため、
// 比較プランと同一条件（基本料金2,255円・EV割なし）。
const DEFAULT_TARIFF_CURRENT_BEFORE_SWITCH = {
  effectiveFrom: "2025-01",
  name: "北陸電力（直接契約・出光切替前）",
  basicFee: 2255,
  tiers: [
    { label: "夏季昼間",     rate: 39.87 },
    { label: "その他季昼間", rate: 39.87 },
    { label: "ウィークエンド", rate: 33.80 },
    { label: "夜間",         rate: 26.98 },
  ],
  // [料金タブ再編成] renewableLevy/fuelAdjustmentは保持しない（addonHistoryに一本化）
  note: "2025年1〜6月は北陸電力「くつろぎナイト12」と直接契約（EV割なし）。2025年7月に出光でんきへ切替。",
  updatedAt: "2026-06",
};

// 月別の燃料調整費・再エネ賦課金の実績履歴（円/kWh）
// 出光でんき・北陸電力で共通（時間帯単価・付加的単価は両社で同一のため）
const DEFAULT_ADDON_HISTORY = {
  "2025-01": { fuel: -6.85,  levy: 3.49 },
  "2025-02": { fuel: -9.35,  levy: 3.49 },
  "2025-03": { fuel: -9.23,  levy: 3.49 },
  "2025-04": { fuel: -7.95,  levy: 3.49 },
  "2025-05": { fuel: -6.77,  levy: 3.98 },
  "2025-06": { fuel: -7.00,  levy: 3.98 },
  "2025-07": { fuel: -7.43,  levy: 3.98 },
  "2025-08": { fuel: -9.77,  levy: 3.98 },
  "2025-09": { fuel: -10.42, levy: 3.98 },
  "2025-10": { fuel: -10.15, levy: 3.98 },
  "2025-11": { fuel: -8.10,  levy: 3.98 },
  "2025-12": { fuel: -8.05,  levy: 3.98 },
  "2026-01": { fuel: -7.95,  levy: 3.98 },
  "2026-02": { fuel: -12.45, levy: 3.98 },
  "2026-03": { fuel: -12.37, levy: 3.98 },
  "2026-04": { fuel: -9.29,  levy: 3.98 },
  "2026-05": { fuel: -7.74,  levy: 4.18 },
};

// 月（01〜12）ごとの時間帯別使用比率（夏季昼間／その他季昼間／ウィークエンド／夜間）。
// 実測CSV（北陸電力30分値、2024年12月〜2025年6月）から算出した比率を採用し、
// 実測のない7〜11月は季節の連続性を考慮して補完している。
//
// 北陸電力「くつろぎナイト12」の時間帯定義（公式情報に基づく）：
//   ・夜間時間　　　　：20:00〜翌8:00（平日・休日問わず、年間共通の12時間）
//   ・昼間時間(夏季)　：7/1〜9/30 の 平日 8:00〜20:00
//   ・昼間時間(その他季)：10/1〜翌6/30 の 平日 8:00〜20:00
//   ・ウィークエンド　：土・日・祝日等の 8:00〜20:00（季節問わず共通）
//
// 「太陽光・蓄電池なしの場合の電気代」を推定する際、総消費量のうちどの時間帯にどれだけ
// 使用していたかを見積もるために使用する。蓄電池により冬季は夜間使用比率が高くなる傾向が実測されている。
const SEASONAL_USAGE_RATIO = {
  "01": { summer: 0.000, other: 0.126, weekend: 0.181, night: 0.693 }, // 実測
  "02": { summer: 0.000, other: 0.053, weekend: 0.076, night: 0.871 }, // 実測
  "03": { summer: 0.000, other: 0.036, weekend: 0.068, night: 0.895 }, // 実測
  "04": { summer: 0.000, other: 0.131, weekend: 0.088, night: 0.781 }, // 実測
  "05": { summer: 0.000, other: 0.144, weekend: 0.121, night: 0.735 }, // 実測
  "06": { summer: 0.000, other: 0.164, weekend: 0.075, night: 0.761 }, // 実測
  "07": { summer: 0.164, other: 0.000, weekend: 0.075, night: 0.761 }, // 補完：7月から夏季区分に切替（その他季比率を夏季へ付け替え）
  "08": { summer: 0.150, other: 0.000, weekend: 0.090, night: 0.760 }, // 補完：盛夏期の傾向で補完
  "09": { summer: 0.130, other: 0.000, weekend: 0.110, night: 0.760 }, // 補完：残暑〜初秋の傾向で補完
  "10": { summer: 0.000, other: 0.140, weekend: 0.150, night: 0.710 }, // 補完：その他季に復帰、12月へ向け漸移
  "11": { summer: 0.000, other: 0.090, weekend: 0.250, night: 0.660 }, // 補完：12月の傾向へ近づける
  "12": { summer: 0.000, other: 0.036, weekend: 0.368, night: 0.596 }, // 実測（2024年12月分）
};

function getSeasonalUsageRatio(month) {
  const mm = month.slice(5, 7);
  return SEASONAL_USAGE_RATIO[mm] ?? { summer: 0, other: 0.25, weekend: 0.15, night: 0.60 };
}

// 後方互換：夜間比率のみが必要な箇所向け
function getNightRatio(month) {
  return getSeasonalUsageRatio(month).night;
}

// 実績Excel（太陽光記録）からインポートした月次実績データ（2025-01〜2026-05）
const IMPORTED_RECORDS = [
  { month: "2025-01", generated: 129.79, sold: 27,  soldIncome: 216,  consumed: 1225.00, electricBill: 32202.20, boughtKwh: 1121 },
  { month: "2025-02", generated: 20.30,  sold: 9,   soldIncome: 72,   consumed: 1415.00, electricBill: 33839.00, boughtKwh: 1415 },
  { month: "2025-03", generated: 703.73, sold: 133, soldIncome: 1064, consumed: 882.13,  electricBill: 10757.00, boughtKwh: 386 },
  { month: "2025-04", generated: 848.03, sold: 280, soldIncome: 2240, consumed: 606.73,  electricBill: 4296.00,  boughtKwh: 82 },
  { month: "2025-05", generated: 977.75, sold: 529, soldIncome: 4232, consumed: 464.91,  electricBill: 3045.00,  boughtKwh: 30 },
  { month: "2025-06", generated: 919.59, sold: 463, soldIncome: 3704, consumed: 532.68,  electricBill: 3087.00,  boughtKwh: 31 },
  { month: "2025-07", generated: 1196.68,sold: 534, soldIncome: 4272, consumed: 734.41,  electricBill: 3012.22, boughtKwh: 41 },
  { month: "2025-08", generated: 1011.28,sold: 357, soldIncome: 2856, consumed: 733.19,  electricBill: 3502.09, boughtKwh: 68 },
  { month: "2025-09", generated: 786.28, sold: 295, soldIncome: 2360, consumed: 573.84,  electricBill: 3120.70, boughtKwh: 49 },
  { month: "2025-10", generated: 494.99, sold: 127, soldIncome: 1016, consumed: 488.51,  electricBill: 3560.87, boughtKwh: 73 },
  { month: "2025-11", generated: 452.22, sold: 32,  soldIncome: 256,  consumed: 725.10,  electricBill: 8586.00,  boughtKwh: 276 },
  { month: "2025-12", generated: 282.90, sold: 22,  soldIncome: 176,  consumed: 993.75,  electricBill: 15281.00, boughtKwh: 558 },
  { month: "2026-01", generated: 99.62,  sold: 14,  soldIncome: 112,  consumed: 1262.24, electricBill: 33625.00, boughtKwh: 1303 },
  { month: "2026-02", generated: 238.94, sold: 23,  soldIncome: 184,  consumed: 1053.04, electricBill: 22354.00, boughtKwh: 1048 },
  { month: "2026-03", generated: 781.16, sold: 125, soldIncome: 1000, consumed: 935.64,  electricBill: 9083.00,  boughtKwh: 366 },
  { month: "2026-04", generated: 847.39, sold: 364, soldIncome: 2912, consumed: 609.91,  electricBill: 5298.00,  boughtKwh: 135 },
  { month: "2026-05", generated: 1067.31,sold: 536, soldIncome: 4288, consumed: 519.42,  electricBill: 2702.00,  boughtKwh: 29 },
];

// ─────────────────────────────────────────────
// ハプティクス（[Phase 4]）
// ─────────────────────────────────────────────
// 注意：navigator.vibrate（Vibration API）はiOS Safari／iPadOS Safariでは
// 一切サポートされていない（Appleが実装していない）。そのためこのアプリの主要
// 利用環境であるiPad Air上では、この関数を呼んでも実際には振動しない。
// 将来 Android Chrome や PWA 化後の挙動に備えて安全に呼べる形にしておくが、
// 「iPadで振動しないのは実装ミスではなく、Web Vibration APIがiOSにない」という
// プラットフォーム制約であることをここに明記しておく。
function fireHaptic(intensity = "light") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  const pattern = { light: 8, medium: 16, error: [12, 40, 12] }[intensity] ?? 8;
  try { navigator.vibrate(pattern); } catch { /* 一部端末で例外を投げることがあるため握りつぶす */ }
}

// ─────────────────────────────────────────────
// Toast システム
// ─────────────────────────────────────────────
let _toastId = 0;
let _setToasts = null;
const UNDO_TOAST_MS = 4000; // [Phase 4] Undo可能な時間。長すぎると次の操作の邪魔、短すぎるとタップし損ねる。

function toast(msg, type = "info") {
  if (!_setToasts) return;
  // [Phase 4] 設計書の「保存成功・エラー」ハプティクスは、トースト呼び出しの大半が
  // すでに success/error を意味のあるタイミングで使い分けているため、ここに一元化する
  // （各呼び出し元を1つずつ書き換えるより一貫性が保てる）。
  if (type === "success") fireHaptic("medium");
  else if (type === "error") fireHaptic("error");
  const id = ++_toastId;
  _setToasts(prev => [...prev, { id, msg, type }]);
  setTimeout(() => {
    _setToasts(prev => prev.filter(t => t.id !== id));
  }, 3000);
}

// [Phase 4] Undo Snackbar。
// 確認モーダル（事前にブロックして聞く）の代わりに、
// 「先に実行 → 一定時間だけ取り消せる」方式にすることで、削除のたびにモーダルが
// 割り込まない軽快な操作感にする。onUndo は呼び出し側が「削除前の状態に戻す」処理を渡す。
function undoToast(msg, onUndo) {
  if (!_setToasts) return;
  const id = ++_toastId;
  let undone = false;
  const handleUndo = () => {
    if (undone) return;
    undone = true;
    _setToasts(prev => prev.filter(t => t.id !== id));
    onUndo?.();
    fireHaptic("light");
  };
  _setToasts(prev => [...prev, { id, msg, type: "undo", onUndo: handleUndo }]);
  setTimeout(() => {
    _setToasts(prev => prev.filter(t => t.id !== id));
  }, UNDO_TOAST_MS);
}

function ToastContainer() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => { _setToasts = setToasts; }, []);
  const icons = { success: "✓", error: "✕", info: "☀", undo: "🗑" };
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.type === "undo" ? (
            <>
              <span style={{display:"flex", alignItems:"center", gap:10, minWidth:0}}>
                <span>{icons.undo}</span>
                <span style={{overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap"}}>{t.msg}</span>
              </span>
              <button className="toast-undo-btn" onClick={t.onUndo}>取り消す</button>
              <span className="toast-undo-progress" style={{ animationDuration: `${UNDO_TOAST_MS}ms` }} />
            </>
          ) : (
            <>
              <span>{icons[t.type] ?? "•"}</span>
              <span>{t.msg}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// 確認モーダル（window.confirmはアーティファクト内で機能しないため自作）
// ─────────────────────────────────────────────
let _setConfirmState = null;

function askConfirm(message, { danger = false, confirmLabel = "削除する" } = {}) {
  return new Promise((resolve) => {
    if (!_setConfirmState) { resolve(window.confirm ? false : false); return; }
    _setConfirmState({
      open: true, message, danger, confirmLabel,
      onResolve: resolve,
    });
  });
}

function ConfirmDialog() {
  const [state, setState] = useState({ open: false, message: "", danger: false, confirmLabel: "削除する", onResolve: null });
  useEffect(() => { _setConfirmState = setState; }, []);

  if (!state.open) return null;

  const close = (result) => {
    state.onResolve?.(result);
    setState(s => ({ ...s, open: false }));
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9998,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
      /* [Phase 3] inline styleのモーダルにもSafe Area対応を適用 */
      padding: "max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
    }} onClick={() => close(false)}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: 22, maxWidth: 360, width: "100%",
        boxShadow: "0 16px 48px #000000aa",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.6, marginBottom: 20, whiteSpace: "pre-line" }}>
          {state.message}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={() => close(false)}>キャンセル</button>
          <button className={state.danger ? "btn btn-danger" : "btn btn-primary"}
            style={state.danger ? { background: C.red, color: "#fff", border: "none" } : {}}
            onClick={() => close(true)}>
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ナビゲーション定義
// ─────────────────────────────────────────────
const TABS = [
  { id: "dashboard",   label: "ホーム",   icon: "house" },
  { id: "records",     label: "実績",     icon: "list.bullet" },
  { id: "recovery",    label: "回収",     icon: "target" },
  { id: "simulation",  label: "分析",     icon: "chart.bar" },
  { id: "tariff",      label: "料金",     icon: "yen" },
  { id: "settings",    label: "設定",     icon: "gear" },
];

// SF Symbols風アウトラインアイコン（絵文字を避け、線画ベースの統一感あるアイコンに置き換え）
function TabIcon({ name, active, color: colorOverride, size = 24 }) {
  const color = colorOverride ?? (active ? C.blue : C.textMuted);
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "house":
      return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" /></svg>;
    case "list.bullet":
      return <svg {...common}><circle cx="4.5" cy="6" r="1" fill={color} /><circle cx="4.5" cy="12" r="1" fill={color} /><circle cx="4.5" cy="18" r="1" fill={color} /><path d="M9 6h11M9 12h11M9 18h11" /></svg>;
    case "yen":
      return <svg {...common}><path d="M7 4l5 8 5-8" /><path d="M12 12v8" /><path d="M8 13h8M8 16h8" /></svg>;
    case "chart.bar":
      return <svg {...common}><path d="M5 19V10M12 19V5M19 19v-6" /><path d="M3 19h18" /></svg>;
    case "target":
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" fill={color} /></svg>;
    case "gear":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.3M12 18.2v2.3M5.4 6.6l1.7 1.6M16.9 15.8l1.7 1.6M3.5 12h2.3M18.2 12h2.3M5.4 17.4l1.7-1.6M16.9 8.2l1.7-1.6" /></svg>;
    default:
      return null;
  }
}

// ─────────────────────────────────────────────
// 画面コンポーネント（Step1はプレースホルダー）
// ─────────────────────────────────────────────

// --- ダッシュボード ---
// ─────────────────────────────────────────────
// Excel実績データのインポート案内バナー
// ─────────────────────────────────────────────
function ImportBanner({ onImport, onDismiss }) {
  const [importing, setImporting] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  return (
    <div className="card" style={{
      marginBottom: 20, borderLeft: `3px solid ${C.sun}`,
      background: `linear-gradient(135deg, ${C.surface}, ${C.panel})`
    }}>
      <div className="card-header" style={{ marginBottom: 10, cursor: "pointer" }}
        onClick={() => setShowDetail(v => !v)}>
        <span className="card-title">📥 実績Excelのデータを取り込めます</span>
        <span style={{ fontSize: 11, color: C.textMuted }}>{showDetail ? "▲ 閉じる" : "▼ 詳しく"}</span>
      </div>
      {showDetail && (
        <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.7, marginBottom: 14 }}>
          アップロードされた「太陽光記録」Excelから、2025年1月〜2026年5月の17ヶ月分の実績（発電量・売電量・売電金額・電気代・買電量）と、
          北陸電力「くつろぎナイト12」の単価改定履歴・燃料調整費・再エネ賦課金の実績値を取り込めます。
          現契約（出光でんき）は北陸電力プランをベースに基本料金からEV割200円を割引した連動設定になります。
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" disabled={importing} onClick={async () => {
          setImporting(true);
          await onImport(true);
          setImporting(false);
        }}>
          {importing ? "取り込み中…" : "📥 データを取り込む"}
        </button>
        <button className="btn btn-secondary" onClick={onDismiss}>今はしない</button>
      </div>
    </div>
  );
}

function DashboardScreen({ records, settings, monthlyComparison }) {
  // 経済メリットは calcMonthlyComparison（シミュレーション・回収管理と共通）の結果を集計する
  const totalBenefit = monthlyComparison.reduce((sum, m) => sum + m.月次メリット, 0);
  const totalSellIncome = monthlyComparison.reduce((sum, m) => sum + m.売電収入, 0);
  const totalNetCost = monthlyComparison.reduce((sum, m) => sum + m.実質コスト, 0);

  const netCost = (settings.installCost ?? 0) - (settings.subsidy ?? 0);
  const recovered = Math.min(totalBenefit, netCost);
  const remaining = Math.max(netCost - recovered, 0);
  const recoveryPct = netCost > 0 ? (recovered / netCost) * 100 : 0;

  const lastRecord = records.length > 0 ? records[records.length - 1] : null;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <span className="page-title-icon" style={{ background: C.blue }}><TabIcon name="house" color="#fff" size={20} /></span>
          ホーム
        </div>
        <div className="page-subtitle">
          {fmt.month(settings.installedAt)}導入（導入から{fmt.elapsedSince(settings.installedAt) ?? "—"}） ／ 太陽光 {settings.systemCapacity ?? "—"} kW ／ 蓄電池 {settings.batteryCapacity ?? "—"} kWh
        </div>
      </div>

      {/* ── 投資回収率（最重要指標：ヒーロー表示） ── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div className="hero-stat">
            <div className="hero-stat-label">投資回収率</div>
            <div>
              <span className="hero-stat-value" style={{ color: C.green }}>{recoveryPct.toFixed(1)}</span>
              <span className="hero-stat-unit">%</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="hero-stat-label">残り回収額</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>{fmt.yen(remaining)}</div>
            </div>
          </div>
          <div style={{ position: "relative", width: 88, height: 88, flexShrink: 0 }}>
            <svg width="88" height="88" viewBox="0 0 88 88">
              <circle cx="44" cy="44" r="38" fill="none" stroke={C.border} strokeWidth="8" />
              <circle cx="44" cy="44" r="38" fill="none" stroke={C.green} strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 38}`}
                strokeDashoffset={`${2 * Math.PI * 38 * (1 - Math.min(recoveryPct, 100) / 100)}`}
                transform="rotate(-90 44 44)" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── KPIエリア ── */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">累計メリット</div>
          <div className="kpi-value" style={{ color: C.green }}>{(totalBenefit / 10000).toFixed(1)}<span className="kpi-unit">万円</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">累計売電収入</div>
          <div className="kpi-value" style={{ color: C.sun }}>{(totalSellIncome / 10000).toFixed(1)}<span className="kpi-unit">万円</span></div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">累計実質コスト</div>
          <div className="kpi-value">{(totalNetCost / 10000).toFixed(1)}<span className="kpi-unit">万円</span></div>
        </div>
      </div>

      {/* ── 最新月の実績 ── */}
      <div className="section-label">最新の実績</div>
      <div className="list-group">
        {lastRecord ? (
          <>
            <div className="list-cell no-tap">
              <div className="list-cell-main">
                <span className="list-cell-title">対象月</span>
              </div>
              <span className="list-cell-value">{fmt.month(lastRecord.month)}</span>
            </div>
            <div className="list-cell no-tap">
              <div className="list-cell-main"><span className="list-cell-title">発電量</span></div>
              <span className="list-cell-value">{fmt.kwh(lastRecord.generated)}</span>
            </div>
            <div className="list-cell no-tap">
              <div className="list-cell-main"><span className="list-cell-title">売電量</span></div>
              <span className="list-cell-value">{fmt.kwh(lastRecord.sold)}</span>
            </div>
            <div className="list-cell no-tap">
              <div className="list-cell-main"><span className="list-cell-title">売電収入</span></div>
              <span className="list-cell-value" style={{ color: C.sun }}>
                {fmt.yen(getSellIncome(lastRecord, settings.fitRate).value)}
              </span>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-desc">実績データがありません<br/>「実績」タブから入力してください</div>
          </div>
        )}
      </div>

      {records.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <div className="empty-title">データを入力して投資回収状況を確認しましょう</div>
            <div className="empty-desc">
              「実績」タブから月次の発電量・売電量・消費量を入力すると、<br/>
              投資回収率と回収予測が表示されます。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 2: 実績管理画面
// ─────────────────────────────────────────────

// ── カスタム Tooltip ──
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 14px", fontSize: 12,
    }}>
      <div style={{ color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}：<span style={{ fontFamily: "JetBrains Mono, monospace" }}>
            {typeof p.value === "number" ? p.value.toFixed(1) : p.value} kWh
          </span>
        </div>
      ))}
    </div>
  );
}

// ── 空フォームの初期値 ──
const EMPTY_RECORD_FORM = {
  month: "", generated: "", sold: "", soldIncome: "", consumed: "", boughtKwh: "",
  electricBill: "", memo: "",
  // [OCR機能] 燃料費調整単価・再エネ賦課金（円/kWh）。レコード自体には保存しないが、
  // OCR読み取り結果を一時的にフォームへ保持し、保存時にaddonHistoryへ反映するための専用フィールド。
  fuelAdjustment: "",
  renewableLevy: "",
};

// ─────────────────────────────────────────────
// 画像メモ機能 ＋ OCR自動入力（Claude API画像解析）
//
// 過去に画像自動読み取り機能を試した際は「Invalid response format」で失敗し撤回した
// という経緯がコード内に残っていたが、本セッションで現行のAPI仕様
// （fetch("https://api.anthropic.com/v1/messages")、画像をbase64でmessages内に
// document/image content blockとして送る方式）で再実装し、実際にこのアーティファクト上で
// 動作することを確認した（下記 callClaudeForOcr 参照）。
//
// 対応フォーマット（添付2種類のスクリーンショットで確認済み）：
//  ① 太陽光モニタリング画面（運転状況・発電量/消費電力の月次サマリー）
//     → 発電量・売電量・総消費電力量・買電量(電力系統から)を抽出
//  ② 出光でんき「でんきMYページ」料金情報詳細画面
//     → ご請求金額・使用電力量(買電量)を抽出
//
// 設計：OCR結果は「フォームに自動入力するだけ」とし、保存ボタンを押すまでは
// 既存のレコードには反映されない。誤読の可能性があるため、抽出した値は
// 必ずユーザーが目視確認できる状態（フォームの入力欄）に留め、入力欄は通常通り
// 編集可能なままにする。
// ─────────────────────────────────────────────

// 画像ファイルをClaude APIのcontent blockに必要な {mediaType, base64} に変換する
function fileToBase64Payload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result; // "data:image/png;base64,xxxx..."
      const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
      if (!match) { reject(new Error("画像データの形式が不正です")); return; }
      resolve({ mediaType: match[1], base64: match[2] });
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

// 複数枚の画像（モニタリング画面・請求書など混在可）をClaude APIに送り、
// 月次実績フォームに対応する数値項目をJSONで抽出する。
// 抽出対象はEMPTY_RECORD_FORMのうち数値項目のみ（month/memoはOCR対象外。
// 年月は請求書の「ご使用期間」等から複数の解釈がありうるため自動入力せず、
// ユーザー自身が年月セレクタで選ぶ運用とする）。
async function callClaudeForOcr(images, callbacks) {
  const onProgress = callbacks?.onProgress;
  // [デバッグ表示] iPad単体ではブラウザのコンソールログを直接見る手段が無いため、
  // console.log/warn/error と同じ内容を画面内のデバッグパネルにも表示できるよう、
  // ログが出るたびにonLogコールバックでも通知する。
  const onLog = callbacks?.onLog || (() => {});
  const log = (level, ...args) => {
    const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (level === "error") console.error(msg); else if (level === "warn") console.warn(msg); else console.log(msg);
    onLog({ level, message: msg, time: new Date() });
  };
  const imageBlocks = await Promise.all(
    images.map(async ({ file }) => {
      const { mediaType, base64 } = await fileToBase64Payload(file);
      return { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } };
    })
  );

  const instruction = [
    "添付の画像は、太陽光発電モニタリング画面、または電力会社の請求書詳細画面のスクリーンショットです。",
    "次の項目を画像から読み取り、判明したものだけをJSONで返してください。読み取れない項目はキー自体を省略してください。",
    "各項目は { \"value\": 数値または文字列, \"calculation\": \"値の出どころを説明する短い日本語の文章\" } という形式にしてください。",
    "calculationには、画面のどのラベルの値をそのまま採用したかを具体的に書いてください（例：「画面左側の自家消費85.43kWhをそのまま採用」）。",
    "",
    "【最重要・厳守】あなたが行うのは画面に書かれている数値の「書き写し」だけです。",
    "割合（%）から元の数値を逆算する、複数の数値を足し算・引き算・掛け算・割算して別の値を作る、MWhをkWhに変換するといった",
    "計算は一切行わないでください。四則演算は全て後工程のプログラムが行うため、あなたが計算すると不要な誤りが生じます。",
    "画面に表示されている数値を、表示されている単位のまま、そのまま書き写してください（MWh表示はMWh表示のまま、kWh表示はkWh表示のまま）。",
    "",
    "【太陽光モニタリング画面の発電量・消費電力量について】",
    "画面には「発電量」「消費電力量」として、中心に大きく表示された合計値と、その左右に内訳の数値・割合%が表示されています。",
    "中心の合計値は読み取り対象外です（丸められていることが多いため使用しません）。次の4つの内訳の数値と割合%を、表示されている単位のまま、そのまま読み取ってください。",
    "  ・自家消費の数値（例：85.43kWh）と、その横の割合%（例：85.76%）",
    "  ・売電量の数値（例：14.19kWh）と、その横の割合%（例：14.24%）",
    "  ・「PVから」の数値（例：12.37kWh）と、その横の割合%（例：0.98%）",
    "  ・「電力系統から」の数値（例：1.25MWh）と、その横の割合%（例：99.02%）",
    "数値はMWh表記のままでもkWh表記のままでも構いません。表示されている通りに、単位変換せず書き写してください。",
    "",
    "項目一覧：",
    "- month: 対象の年月。請求書画面のタイトル（例：「2026年5月分料金情報詳細」）に記載の年月を採用し、\"2026-05\"のようなYYYY-MM形式の文字列にしてください（モニタリング画面のみで請求書が無い場合はキーを省略してください）。",
    "- selfConsumedKwh: 自家消費の数値。画面に表示されている単位の数値そのまま（MWh表示ならMWhの数値、kWh表示ならkWhの数値）。",
    "- selfConsumedUnit: 直前のselfConsumedKwhの単位。画面の表示が\"kWh\"なら\"kWh\"、\"MWh\"なら\"MWh\"という文字列。",
    "- selfConsumedPct: 自家消費の横に表示されている割合（%の数値のみ。例：85.76）。",
    "- soldKwh: 売電量の数値。画面に表示されている単位の数値そのまま。",
    "- soldUnit: 直前のsoldKwhの単位（\"kWh\"または\"MWh\"）。",
    "- soldPct: 売電量の横に表示されている割合（%の数値のみ）。",
    "- pvKwh: 「PVから」の数値。画面に表示されている単位の数値そのまま。",
    "- pvUnit: 直前のpvKwhの単位（\"kWh\"または\"MWh\"）。",
    "- pvPct: 「PVから」の横に表示されている割合（%の数値のみ）。",
    "- gridKwh: 「電力系統から」の数値。画面に表示されている単位の数値そのまま。",
    "- gridUnit: 直前のgridKwhの単位（\"kWh\"または\"MWh\"）。",
    "- gridPct: 「電力系統から」の横に表示されている割合（%の数値のみ）。",
    "- boughtKwh: 買電量（kWh）。請求書画面の「使用電力量」の値があれば、その数値をそのまま採用してください（請求書がある場合はこちらを優先し、上記gridKwh等は使いません）。請求書が無くモニタリング画面のみの場合はキーを省略してください。",
    "- electricBill: 電気代（円）。請求書の「ご請求金額」の値（税込の最終金額）をそのまま採用してください。",
    "- fuelAdjustment: 燃料費調整単価（円/kWh）。請求書の「料金単価」表にある「燃料費調整単価」の「当月分」の値をそのまま採用してください。マイナスの値であればマイナスのまま返してください（例：-7円74銭/kWhは-7.74）。表に単価が直接記載されていない場合はキーを省略してください。",
    "",
    "売電収入（売電による振込金額）は読み取り・算出の対象外です。売電収入は電力会社からの実際の振込額をユーザーが別途手入力するため、絶対に含めないでください。",
    "value欄について：◯◯Kwh・◯◯Pctの数値は画面表示の小数点桁数のまま、electricBill等の金額はカンマや単位記号を除いた数値のみとしてください。",
    "出力はJSONオブジェクトのみとし、説明文やMarkdownのコードブロック記号(```)は一切含めないでください。",
    "出力の最初の文字は必ず「{」、最後の文字は必ず「}」にしてください。前置きの文章（「読み取りました：」等）や、後書きの文章は一切付けないでください。",
    "JSONの配列・オブジェクトの最後の要素の後にカンマを付けないでください（例：{\"a\": 1, \"b\": 2,} は誤りです。{\"a\": 1, \"b\": 2} が正しい形式です）。",
    "",
    "出力例：",
    '{"selfConsumedKwh": {"value": 85.43, "calculation": "画面左側の自家消費85.43kWhをそのまま採用"}, "selfConsumedUnit": {"value": "kWh", "calculation": "自家消費の表示単位"}, "selfConsumedPct": {"value": 85.76, "calculation": "自家消費の横の割合85.76%をそのまま採用"}, "soldKwh": {"value": 14.19, "calculation": "画面右側の売電量14.19kWhをそのまま採用"}, "soldUnit": {"value": "kWh", "calculation": "売電量の表示単位"}, "soldPct": {"value": 14.24, "calculation": "売電量の横の割合14.24%をそのまま採用"}, "pvKwh": {"value": 12.37, "calculation": "PVからの数値12.37kWhをそのまま採用"}, "pvUnit": {"value": "kWh", "calculation": "PVからの表示単位"}, "pvPct": {"value": 0.98, "calculation": "PVからの横の割合0.98%をそのまま採用"}, "gridKwh": {"value": 1.25, "calculation": "電力系統からの数値1.25MWhをそのまま採用（MWh表示のまま）"}, "gridUnit": {"value": "MWh", "calculation": "電力系統からの表示単位"}, "gridPct": {"value": 99.02, "calculation": "電力系統からの横の割合99.02%をそのまま採用"}, "electricBill": {"value": 2702, "calculation": "請求書のご請求金額2,702円をそのまま採用"}}',
  ].join("\n");

  // [リトライ自動化] APIの一時的な失敗（レート制限・タイムアウト等）や、
  // モデルが説明文を混入させてJSONパースに失敗するケースは、再試行すれば
  // 成功することが多いため、成功するまでリトライを継続する。
  // ただし無限ループを避けるため、経過時間が2分を超えたら自動リトライを停止し、
  // ユーザーに手動での再実行を促す。
  const TIMEOUT_MS = 2 * 60 * 1000; // 2分
  const startTime = Date.now();
  let attempt = 0;
  let lastError;
  while (Date.now() - startTime < TIMEOUT_MS) {
    attempt++;
    if (onProgress) onProgress(attempt);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [...imageBlocks, { type: "text", text: instruction }],
            },
          ],
        }),
      });

      if (!response.ok) {
        const apiErr = new Error(`APIエラー（status: ${response.status}）`);
        apiErr.status = response.status;
        throw apiErr;
      }
      const data = await response.json();
      const textBlock = (data.content || []).find(b => b.type === "text");
      if (!textBlock || !textBlock.text) {
        throw new Error("APIからの応答にテキストが含まれていません");
      }
      // [安定性改善] モデルがコードブロック記号(```)だけでなく、JSON本体の前後に
      // 「読み取りました：」のような説明文や、配列・オブジェクトの末尾に余分なカンマを
      // 混入させることがある。これらはJSON.parseの厳格な仕様では即座にパース失敗となり、
      // 「JSONとして解釈できない」というエラーで毎回リトライを消費する原因になっていた。
      // そこで、最初の「{」から最後の「}」までを抜き出し、末尾カンマを除去してから
      // パースすることで、軽微な体裁の崩れを吸収する。
      let cleaned = textBlock.text.replace(/```json|```/g, "").trim();
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
      cleaned = cleaned.replace(/,\s*([}\]])/g, "$1"); // 末尾カンマ除去（例：{"a":1,} → {"a":1}）
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        log("error", `[試行${attempt}] JSONパース失敗。生のレスポンス（先頭200文字）: ${textBlock.text.slice(0, 200)}`);
        throw new Error("応答をJSONとして解釈できませんでした");
      }
      // [安定性改善] JSONとして解釈できても、画像認識自体が失敗して項目がほとんど
      // 読み取れていない（例：{}や1項目だけ）場合、これまではそのまま「成功」扱いに
      // なってしまい、不完全な結果がそのままフォームに反映されていた。
      // モニタリング画面・請求書画面のどちらであっても、最低限の主要項目が複数読み取れて
      // いなければ「読み取り失敗」とみなしてリトライする。
      const readableKeys = Object.keys(parsed).filter(k => {
        const v = parsed[k];
        const val = v && typeof v === "object" ? v.value : v;
        return val !== undefined && val !== null && val !== "";
      });
      if (readableKeys.length < 2) {
        log("warn", `[試行${attempt}] 読み取れた項目が少なすぎます（再試行）。項目: ${readableKeys.join(", ") || "なし"}`);
        throw new Error("画像から十分な項目を読み取れませんでした");
      }
      // [デバッグ] 読み取れた項目数が極端に少ない場合、後段の項目チェックで弾かれずに
      // 「成功」扱いとなってしまうケースを切り分けるため、内容を必ずログに出す。
      log("log", `[試行${attempt}] 読み取り成功。項目数: ${readableKeys.length}（${readableKeys.join(", ")}）`);
      return parsed; // 成功したらここで返す（リトライループを抜ける）
    } catch (err) {
      lastError = err;
      log("warn", `[試行${attempt}] 失敗: ${err.message}`);
      const elapsed = Date.now() - startTime;
      if (elapsed >= TIMEOUT_MS) break;
      // 指数バックオフだが、2分の上限を超えないようキャップする
      // 指数バックオフだが、2分の上限を超えないようキャップする。
      // レート制限（429）の場合は、通常のAPIエラーより回復に時間がかかることが多いため、
      // より長めに待機してから再試行する。
      const baseWaitMs = err.status === 429 ? 5000 * attempt : 1000 * attempt;
      const waitMs = Math.min(baseWaitMs, TIMEOUT_MS - elapsed);
      if (waitMs > 0) await new Promise(r => setTimeout(r, waitMs));
    }
  }
  // 2分以内に成功しなかった場合は、ユーザーに手動再試行を促すエラーを投げる
  throw new Error("2分以内に読み取りが完了しませんでした。もう一度お試しください。");
}

function fileToPreviewUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

function ScreenshotMemoPanel({ setForm, addonHistory }) {
  const [images, setImages] = useState([]); // [{file, preview}]
  const [activeIndex, setActiveIndex] = useState(null); // 全画面表示中の画像インデックス
  const [ocrStatus, setOcrStatus] = useState("idle"); // "idle" | "loading" | "done" | "error"
  const [ocrFields, setOcrFields] = useState(null); // OCRで抽出されたフィールド（確認表示用）
  const [ocrAttempt, setOcrAttempt] = useState(0); // リトライ中の試行回数（ローディング表示用）
  const [ocrLogs, setOcrLogs] = useState([]); // [{level, message, time}] iPad単体でも確認できるデバッグログ表示用
  const [showOcrLogs, setShowOcrLogs] = useState(false); // デバッグログパネルの開閉状態
  const fileInputRef = useRef(null);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    try {
      const loaded = await Promise.all(
        files.map(async (file) => ({ file, preview: await fileToPreviewUrl(file) }))
      );
      setImages(prev => [...prev, ...loaded]);
      setOcrStatus("idle");
      setOcrFields(null);
    } catch (err) {
      toast("画像の読み込みに失敗しました。別の画像でお試しください。", "error");
    }
    // 同じファイルを連続で選択した場合も再度changeイベントが発火するようリセット
    e.target.value = "";
  };

  const handleRemove = (idx) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
    setOcrStatus("idle");
    setOcrFields(null);
  };

  const handleClear = () => {
    setImages([]);
    setOcrStatus("idle");
    setOcrFields(null);
  };

  const FIELD_LABELS = {
    month:          "年月",
    generated:      "発電量 (kWh)",
    sold:           "売電量 (kWh)",
    consumed:       "総消費電力量 (kWh)",
    boughtKwh:      "買電量 (kWh)",
    electricBill:   "電気代 (円)",
    fuelAdjustment: "燃料費調整単価 (円/kWh)",
    renewableLevy:  "再エネ賦課金 (円/kWh)",
  };
  // [根本対応] OCRには内訳の生数値（自家消費・売電量・PVから・電力系統からの数値・単位・割合、
  // および賦課金の金額と対応する使用量）だけを読み取らせ、合計や逆算といった四則演算は
  // 一切LLMにやらせない。generated・consumed・renewableLevyはOCR結果からJS側で計算して導出する
  // （導出ロジックはhandleRunOcr内のderiveFromRawOcrを参照）。
  const RAW_OCR_FIELDS = [
    "selfConsumedKwh", "soldKwh", "pvKwh", "gridKwh",
    "selfConsumedPct", "soldPct", "pvPct", "gridPct",
    "boughtKwh", "electricBill", "fuelAdjustment",
  ];
  const RAW_OCR_UNIT_FIELDS = ["selfConsumedUnit", "soldUnit", "pvUnit", "gridUnit"]; // 文字列("kWh"|"MWh")
  const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM形式のみ受理（input type="month"の値と一致させる）

  const handleRunOcr = async () => {
    if (images.length === 0) return;
    setOcrStatus("loading");
    setOcrFields(null);
    setOcrAttempt(1);
    setOcrLogs([]);
    try {
      const result = await callClaudeForOcr(images, {
        onProgress: (n) => setOcrAttempt(n),
        onLog: (entry) => setOcrLogs(prev => [...prev, entry]),
      });
      const extracted = {};      // フォームに反映する値
      const calculations = {};   // 表示用の計算過程テキスト

      // 数値項目（fuelAdjustmentは負値もあるためNumber()のまま許容）
      // [根本対応] OCRには内訳の生数値（自家消費・売電量・PVから・電力系統からの数値・単位・割合、
      // 賦課金の金額と使用量）だけを読み取らせている。合計・逆算・単位変換は全てここでJS側が行う。
      // これにより、LLMが四則演算を誤る（式は正しく書きながら答えだけ間違える等）という、
      // 事後検出でしか対処できなかった問題そのものを起こりえなくする。
      const raw = {};
      RAW_OCR_FIELDS.forEach(key => {
        const entry = result?.[key];
        const v = entry && typeof entry === "object" ? entry.value : entry;
        if (v !== undefined && v !== null && !Number.isNaN(Number(v))) {
          raw[key] = Number(v);
          if (entry && typeof entry === "object" && entry.calculation) {
            calculations[key] = String(entry.calculation);
          }
        }
      });
      RAW_OCR_UNIT_FIELDS.forEach(key => {
        const entry = result?.[key];
        const v = entry && typeof entry === "object" ? entry.value : entry;
        if (typeof v === "string" && (v.trim() === "kWh" || v.trim() === "MWh")) {
          raw[key] = v.trim();
        }
      });

      // MWh表記の数値をkWhに統一する（1MWh = 1000kWh）。単位フィールドが読み取れなかった場合は
      // 値の大きさから推測せず、kWhとして扱う（誤判定のリスクを避けるため）。
      const toKwh = (val, unit) => (unit === "MWh" ? val * 1000 : val);

      // 内訳ペア（自家消費/売電量、PVから/電力系統から）について、片方が精密な小数値で
      // もう片方が割合%のみ（≒大きい単位で丸められている）場合に、精密な値自身の割合%を使って
      // 合計と相手側の値を導出する。両方が同程度に精密な場合は単純に合計する。
      const deriveTotal = (aKwh, aPct, bKwh, bPct) => {
        if (typeof aKwh !== "number" && typeof bKwh !== "number") return null;
        if (typeof aKwh === "number" && typeof bKwh === "number") {
          // 両方の数値が読み取れている場合は、それぞれの小数点以下の精度を比較し、
          // より精密な方（小数点以下の桁数が多い方）の値とその割合%を使って合計を逆算する。
          // 同程度の精度であれば単純合計する。
          const aDecimals = (String(aKwh).split(".")[1] || "").length;
          const bDecimals = (String(bKwh).split(".")[1] || "").length;
          if (aDecimals > bDecimals && typeof aPct === "number" && aPct > 0) {
            const total = aKwh / (aPct / 100);
            return { total, a: aKwh, b: total - aKwh };
          }
          if (bDecimals > aDecimals && typeof bPct === "number" && bPct > 0) {
            const total = bKwh / (bPct / 100);
            return { total, a: total - bKwh, b: bKwh };
          }
          return { total: aKwh + bKwh, a: aKwh, b: bKwh };
        }
        // 片方しか値が無い場合は、その値自身の割合%から合計を逆算する
        if (typeof aKwh === "number" && typeof aPct === "number" && aPct > 0) {
          const total = aKwh / (aPct / 100);
          return { total, a: aKwh, b: total - aKwh };
        }
        if (typeof bKwh === "number" && typeof bPct === "number" && bPct > 0) {
          const total = bKwh / (bPct / 100);
          return { total, a: total - bKwh, b: bKwh };
        }
        return null;
      };

      // 発電量＝自家消費＋売電量
      if (raw.selfConsumedKwh !== undefined || raw.soldKwh !== undefined) {
        const selfKwh = raw.selfConsumedKwh !== undefined ? toKwh(raw.selfConsumedKwh, raw.selfConsumedUnit) : undefined;
        const soldKwhVal = raw.soldKwh !== undefined ? toKwh(raw.soldKwh, raw.soldUnit) : undefined;
        const derived = deriveTotal(selfKwh, raw.selfConsumedPct, soldKwhVal, raw.soldPct);
        if (derived) {
          extracted.generated = Math.round(derived.total * 100) / 100;
          extracted.sold = Math.round(derived.b * 100) / 100;
          calculations.generated = `自家消費${derived.a.toFixed(2)}kWh+売電量${derived.b.toFixed(2)}kWh=${derived.total.toFixed(2)}kWh（OCR生数値からJS側で算出）`;
          calculations.sold = `発電量の内訳から算出：${derived.b.toFixed(2)}kWh（OCR生数値からJS側で算出）`;
        }
      }

      // 消費電力量＝PVから＋電力系統から
      if (raw.pvKwh !== undefined || raw.gridKwh !== undefined) {
        const pvKwhVal = raw.pvKwh !== undefined ? toKwh(raw.pvKwh, raw.pvUnit) : undefined;
        const gridKwhVal = raw.gridKwh !== undefined ? toKwh(raw.gridKwh, raw.gridUnit) : undefined;
        const derived = deriveTotal(pvKwhVal, raw.pvPct, gridKwhVal, raw.gridPct);
        if (derived) {
          extracted.consumed = Math.round(derived.total * 100) / 100;
          calculations.consumed = `PVから${derived.a.toFixed(2)}kWh+電力系統から${derived.b.toFixed(2)}kWh=${derived.total.toFixed(2)}kWh（OCR生数値からJS側で算出）`;
        }
      }

      // 買電量・電気代・燃料費調整単価は生数値のまま採用
      ["boughtKwh", "electricBill", "fuelAdjustment"].forEach(key => {
        if (raw[key] !== undefined) {
          extracted[key] = raw[key];
          if (calculations[key] === undefined && result?.[key]?.calculation) {
            calculations[key] = String(result[key].calculation);
          }
        }
      });
      // 請求書が無い場合のフォールバック：電力系統からの値を買電量として採用
      if (extracted.boughtKwh === undefined && raw.gridKwh !== undefined) {
        const gridKwhVal = toKwh(raw.gridKwh, raw.gridUnit);
        // 上のconsumed算出で精密な相手側の値が求まっていればそれを使う。無ければ生のgridKwhをそのまま使う。
        extracted.boughtKwh = Math.round((extracted.consumed !== undefined && raw.pvKwh !== undefined
          ? extracted.consumed - toKwh(raw.pvKwh, raw.pvUnit)
          : gridKwhVal) * 100) / 100;
        calculations.boughtKwh = "請求書画面なし。モニタリング画面の「電力系統から」をJS側で算出して採用";
      }

      // [再エネ賦課金] OCRからの逆算廃止。月が確定した後、addonHistory（DEFAULT_ADDON_HISTORY）の
      // テーブルから正確な公定単価を引用する。月がまだ確定していない場合はOCR結果設定後に
      // フォームの年月セレクタで月を選ぶ際に自動セットされる（下記のmonth設定後の参照を参照）。

      // 年月（YYYY-MM形式のみ受理。請求書タイトルの「2026年5月分」等から変換された文字列を想定）
      const monthEntry = result?.month;
      const monthValue = monthEntry && typeof monthEntry === "object" ? monthEntry.value : monthEntry;
      if (typeof monthValue === "string" && MONTH_PATTERN.test(monthValue)) {
        extracted.month = monthValue;
        if (monthEntry && typeof monthEntry === "object" && monthEntry.calculation) {
          calculations.month = String(monthEntry.calculation);
        }
        // 月が確定した段階で、addonHistoryから正確な再エネ賦課金単価を自動セット。
        // 請求書の丸めによる誤差（4.17→4.18等）を防ぐため、OCR逆算ではなくテーブル値を採用。
        const addonForMonth = findApplicableAddon(addonHistory, monthValue);
        if (addonForMonth?.levy != null) {
          extracted.renewableLevy = addonForMonth.levy;
          calculations.renewableLevy = `再エネ賦課金単価テーブルより${monthValue}分に適用の公定単価${addonForMonth.levy}円/kWhを採用`;
        }
      }
      if (Object.keys(extracted).length === 0) {
        setOcrStatus("error");
        toast("画像から数値を読み取れませんでした。手入力をお試しください。", "error");
        return;
      }

      const mismatchWarnings = {};

      // [燃料費調整単価・再エネ賦課金の差分警告]
      // 請求書からの逆算値と、コード内に保持している既存値（addonHistory。完全一致が
      // 無ければ直近月へのフォールバックを含む＝実質的に「現在適用されるべき値」）を比較し、
      // 一定以上ズレていれば警告を出す。これにより、請求書側の読み取りミスと、
      // コード側の年度更新忘れの両方を早期に発見できるようにする。
      // 比較対象の月はOCRが読み取れた場合はその月、読み取れなかった場合は比較自体を行わない
      // （どの月の値と比べるべきか確定できないため、誤検知を避ける）。
      const ADDON_WARN_THRESHOLD = 0.1; // 円/kWh。請求書の円単位丸め等による誤差は許容する
      const addonWarnings = {};
      if (extracted.month) {
        const existingAddon = findApplicableAddon(addonHistory, extracted.month);
        // 燃料費調整単価のみ差分警告の対象（OCRで請求書から読み取った値なので、テーブルと比較する意味がある）
        const newFuel = extracted.fuelAdjustment;
        const existingFuel = existingAddon?.fuel;
        if (newFuel !== undefined && existingFuel !== undefined) {
          const diff = Math.abs(newFuel - existingFuel);
          if (diff >= ADDON_WARN_THRESHOLD) {
            addonWarnings.fuelAdjustment =
              `⚠ コード内の既存値（${existingFuel}円/kWh）と${diff.toFixed(2)}円差があります。請求書の読み取りミスか、コード側の更新忘れの可能性があります`;
          }
        }
        // 再エネ賦課金はテーブルから引用しているため差分警告は不要。
        // ただしテーブルに当該月の値が登録されていない場合のみ警告する。
        if (extracted.renewableLevy === undefined) {
          addonWarnings.renewableLevy =
            `⚠ ${extracted.month}に対応する再エネ賦課金単価がテーブルに見つかりませんでした。料金タブの「再エネ賦課金」欄に手動で入力してください（経産省発表値: 2026年5月〜は4.18円/kWh）`;
        }
      }

      // mismatchWarnings（value/calculation不一致）とaddonWarnings（既存値との差分）を
      // 項目ごとにマージする（両方該当する場合は併記）。
      const warnings = {};
      Object.keys(mismatchWarnings).forEach(key => { warnings[key] = mismatchWarnings[key]; });
      Object.keys(addonWarnings).forEach(key => {
        warnings[key] = warnings[key] ? `${warnings[key]} / ${addonWarnings[key]}` : addonWarnings[key];
      });

      setOcrFields({ values: extracted, calculations, warnings });
      setForm(prev => ({
        ...prev,
        ...Object.fromEntries(Object.entries(extracted).map(([k, v]) => [k, String(v)])),
      }));
      setOcrStatus("done");
      toast("画像から数値を読み取り、フォームに入力しました（内容をご確認ください）", "success");
    } catch (err) {
      setOcrStatus("error");
      toast(`読み取りに失敗しました：${err.message}`, "error");
    }
  };

  return (
    <div style={{
      background: C.panel, borderRadius: 10, padding: 14, marginBottom: 18,
      border: `1px dashed ${C.border}`
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>
          📸 請求書・モニタリング画面から自動入力
        </span>
      </div>
      <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
        出光でんきの請求書や太陽光モニタリング画面のスクリーンショットを追加すると、年月・発電量・売電量・消費電力量・買電量・電気代・燃料費調整単価・再エネ賦課金を読み取ってフォームに自動入力します（読み取り後も内容は手動で修正できます）。
      </div>

      <input type="file" accept="image/*" multiple ref={fileInputRef}
        onChange={handleFiles} style={{ display: "none" }} />

      {images.length === 0 ? (
        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
          🖼 画像を追加（複数可）
        </button>
      ) : (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            {images.map((img, i) => (
              <div key={i} style={{ position: "relative" }}>
                <img src={img.preview} alt={`screenshot-${i}`}
                  onClick={() => setActiveIndex(i)}
                  style={{
                    width: 76, height: 76, objectFit: "cover", borderRadius: 8,
                    border: `1px solid ${C.border}`, cursor: "pointer"
                  }} />
                {/* [Phase 3] 見た目は20pxの小さいバッジのまま、タップ判定だけ44ptまで拡張 */}
                <button onClick={() => handleRemove(i)} style={{
                  position: "absolute", top: -6, right: -6,
                  width: 20, height: 20, borderRadius: "50%",
                  background: C.red, color: "#fff", border: "none",
                  fontSize: 12, lineHeight: 1, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{
                    position: "absolute", width: 44, height: 44,
                    top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                  }} />
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
              + 追加する
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleClear}>すべて削除</button>
            <button className="btn btn-primary btn-sm" disabled={ocrStatus === "loading"}
              onClick={handleRunOcr}>
              {ocrStatus === "loading"
                ? (ocrAttempt > 1 ? `読み取り中…（${ocrAttempt}回目の試行）` : "読み取り中…")
                : "🔍 画像から自動入力"}
            </button>
          </div>

          {/* [デバッグ表示] iPad単体ではブラウザのコンソールログを直接確認できないため、
              OCR実行時の試行ごとの状況を画面内に表示する。何度も失敗が続く場合の原因調査に使う。 */}
          {ocrLogs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowOcrLogs(v => !v)}
                style={{ fontSize: 12 }}
              >
                {showOcrLogs ? "▲ 詳細ログを隠す" : `▼ 詳細ログを見る（${ocrLogs.length}件）`}
              </button>
              {showOcrLogs && (
                <div style={{
                  marginTop: 6, padding: "8px 10px", borderRadius: 8,
                  background: "#1a1a1a", maxHeight: 220, overflowY: "auto",
                  fontFamily: "monospace", fontSize: 11, lineHeight: 1.6,
                }}>
                  {ocrLogs.map((entry, i) => (
                    <div key={i} style={{
                      color: entry.level === "error" ? "#ff6b6b" : entry.level === "warn" ? "#ffd93d" : "#9be89b",
                      whiteSpace: "pre-wrap", wordBreak: "break-all", marginBottom: 4,
                    }}>
                      [{entry.time.toLocaleTimeString("ja-JP")}] {entry.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {ocrStatus === "done" && ocrFields && (
            <div style={{
              marginTop: 10, padding: "10px 12px", borderRadius: 8,
              background: C.greenDim, border: `1px solid ${C.green}`,
              fontSize: 11, color: C.textSecondary, lineHeight: 1.6,
            }}>
              <div style={{ marginBottom: 4, fontWeight: 600 }}>
                読み取り結果（フォームに反映済み・内容をご確認ください）：
              </div>
              {Object.entries(ocrFields.values).map(([k, v]) => (
                <div key={k} style={{ marginBottom: 6 }}>
                  <div>・{FIELD_LABELS[k] ?? k}：<strong>{v}</strong></div>
                  {/* 算出・変換を伴った項目は、その計算過程を一緒に表示する。
                      画面の値をそのまま採用しただけの項目にも、その旨の説明文が入る想定。 */}
                  {ocrFields.calculations?.[k] && (
                    <div style={{ marginLeft: 14, fontSize: 10, color: C.textMuted }}>
                      → {ocrFields.calculations[k]}
                    </div>
                  )}
                  {ocrFields.warnings?.[k] && (
                    <div style={{ marginLeft: 14, fontSize: 10, color: C.sun, marginTop: 2 }}>
                      {ocrFields.warnings[k]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {ocrStatus === "error" && (
            <div style={{ marginTop: 10, fontSize: 11, color: C.red }}>
              読み取りに失敗しました。画像を変えるか、手入力をお試しください。
            </div>
          )}
        </div>
      )}

      {/* 全画面表示モーダル（タップで拡大確認） */}
      {activeIndex != null && images[activeIndex] && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9996,
          background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "center", justifyContent: "center",
          /* [Phase 3] inline styleのモーダルにもSafe Area対応を適用 */
          padding: "max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
        }} onClick={() => setActiveIndex(null)}>
          <img src={images[activeIndex].preview} alt="拡大表示"
            style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 10, objectFit: "contain" }}
            onClick={e => e.stopPropagation()} />
          <button onClick={() => setActiveIndex(null)} style={{
            position: "absolute",
            /* [Phase 3] 横向き時にノッチ/カメラの陰に隠れないよう、固定24pxにSafe Area分を加算 */
            top: "max(24px, env(safe-area-inset-top))",
            right: "max(24px, env(safe-area-inset-right))",
            width: 44, height: 44, borderRadius: "50%", /* [Phase 3] タッチターゲット44pt確保 */
            background: "rgba(255,255,255,0.15)", color: "#fff", border: "none",
            fontSize: 18, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>
      )}
    </div>
  );
}

function RecordsScreen({
  records, setRecords, settings, tariffCurrentHistory,
  form, setForm, editId, setEditId, showForm, setShowForm,
  addonHistory, setAddonHistory,
}) {
  const [chartMode,  setChartMode]  = useState("kwh");  // "kwh" | "yen"
  const [sortOrder,  setSortOrder]  = useState("desc");
  const [yearFilter, setYearFilter] = useState("all"); // "all" または "2025" のような年文字列
  const [expandedRecordId, setExpandedRecordId] = useState(null); // タップで展開中のレコードID

  // ── フォームリセット ──
  const resetForm = () => {
    setForm({ ...EMPTY_RECORD_FORM });
    setEditId(null);
    setShowForm(false);
  };

  // ── 編集開始 ──
  const startEdit = (rec) => {
    // [OCR機能] 燃料費調整単価・再エネ賦課金はレコード自体には保存されないため、addonHistoryから
    // フォームにプリフィルする。
    // ・燃料費調整単価は毎月変動するため、その月にちょうど登録されている値のみを使う（完全一致）。
    //   登録が無い月まで遡って別の月の値を表示すると実態と異なる単価を見せてしまうため。
    // ・再エネ賦課金は年1回しか改定されない公定単価のため、findApplicableAddon（その月以前で
    //   最も新しいテーブル値を遡って適用）を使い、毎月のテーブル登録を不要にする。
    const exactAddon = addonHistory?.[rec.month];
    const applicableAddon = findApplicableAddon(addonHistory, rec.month);
    setForm({
      month:           rec.month           ?? "",
      generated:       rec.generated       ?? "",
      sold:            rec.sold            ?? "",
      soldIncome:      rec.soldIncome      ?? "",
      consumed:        rec.consumed        ?? "",
      boughtKwh:       rec.boughtKwh       ?? "",
      electricBill:    rec.electricBill    ?? "",
      memo:            rec.memo            ?? "",
      fuelAdjustment:  exactAddon?.fuel       ?? "",
      renewableLevy:   applicableAddon?.levy  ?? "",
    });
    setEditId(rec.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── 保存 ──
  // [OCR機能] レコード本体の保存に加えて、フォームに燃料費調整単価（fuelAdjustment）が
  // 入力されている場合は、その月のaddonHistoryエントリも同時に更新する（常に上書き）。
  // 再エネ賦課金（levy）はOCR対象外のため、既存値があれば維持し、無ければ直近月の値を引き継ぐ。
  const handleSave = () => {
    if (!form.month) { toast("年月を入力してください", "error"); return; }
    const num = (v) => v === "" || v === undefined ? null : parseFloat(v) || 0;

    // 重複チェック（編集時は自身を除外）
    const dup = records.find(r => r.month === form.month && r.id !== editId);
    if (dup) { toast(`${fmt.month(form.month)} はすでに登録されています`, "error"); return; }

    const rec = {
      id:              editId ?? `rec-${Date.now()}`,
      month:           form.month,
      generated:       num(form.generated),
      sold:            num(form.sold),
      soldIncome:      num(form.soldIncome),   // 実際の振込額（円）。あれば最優先で使用
      consumed:        num(form.consumed),
      boughtKwh:       num(form.boughtKwh),    // 買電量（実績Excelとの整合・精密計算に使用）
      electricBill:    num(form.electricBill),
      memo:            form.memo,
      updatedAt:       new Date().toISOString(),
    };

    let next;
    if (editId) {
      next = records.map(r => r.id === editId ? rec : r);
      toast(`${fmt.month(form.month)} の実績を更新しました`, "success");
    } else {
      next = [...records, rec];
      toast(`${fmt.month(form.month)} の実績を追加しました`, "success");
    }
    setRecords(next);

    // [OCR機能] 燃料費調整単価・再エネ賦課金のいずれかが入力されていれば、
    // addonHistoryのその月のエントリを上書きする（入力された方のみ上書き、もう一方は
    // 既存値があれば維持、無ければ直近月の値を継承する）。
    // ただし再エネ賦課金は、年月選択時にテーブル値が自動入力される仕様のため、
    // その自動入力値のまま（テーブルの遡及適用値と一致したまま）保存すると、
    // 単価が変わっていない月にまで新規エントリが量産されテーブルの一元管理が崩れてしまう。
    // そのため、フォームの値がテーブルの遡及適用値と完全一致する場合は「変更なし」とみなし、
    // 新規エントリを作らない（ユーザーが値を書き換えた場合のみ新規エントリとして記録する）。
    const fuelEntered = form.fuelAdjustment !== "" && form.fuelAdjustment !== undefined;
    const fallbackForCompare = findApplicableAddon(addonHistory, form.month);
    const levyRawEntered = form.renewableLevy !== "" && form.renewableLevy !== undefined;
    const levyUnchangedFromTable = levyRawEntered
      && fallbackForCompare?.levy != null
      && Math.abs(parseFloat(form.renewableLevy) - fallbackForCompare.levy) < 0.001;
    const levyEntered = levyRawEntered && !levyUnchangedFromTable;
    if ((fuelEntered || levyEntered) && setAddonHistory) {
      const existing = addonHistory?.[form.month];
      const fallback = fallbackForCompare; // 既にform.month基準で計算済みのため再利用

      const fuelValue = fuelEntered ? parseFloat(form.fuelAdjustment) : undefined;
      const levyValue = levyEntered ? parseFloat(form.renewableLevy)  : undefined;

      const nextFuel = !Number.isNaN(fuelValue) && fuelValue !== undefined
        ? fuelValue
        : (existing?.fuel ?? fallback?.fuel ?? 0);
      const nextLevy = !Number.isNaN(levyValue) && levyValue !== undefined
        ? levyValue
        : (existing?.levy ?? fallback?.levy ?? 0);

      const nextAddon = {
        ...(addonHistory ?? {}),
        [form.month]: { fuel: nextFuel, levy: nextLevy },
      };
      setAddonHistory(nextAddon);
      const updatedLabel = fuelEntered && levyEntered
        ? "燃料費調整単価・再エネ賦課金"
        : fuelEntered ? "燃料費調整単価" : "再エネ賦課金";
      toast(`${fmt.month(form.month)} の${updatedLabel}も更新しました`, "success");
    }

    resetForm();
  };

  // ── 削除（[Phase 4] 確認モーダルではなくUndo Snackbar方式に変更。
  //     「この操作は取り消せません」と先に聞くより、即削除→数秒だけ取り消し可能にする
  //     方が一覧編集中の操作感として軽快なため） ──
  const handleDelete = (id) => {
    const rec = records.find(r => r.id === id);
    if (!rec) return;
    const prevRecords = records;
    setRecords(records.filter(r => r.id !== id));
    undoToast(`${fmt.month(rec.month)} のデータを削除しました`, () => setRecords(prevRecords));
  };

  // ── 利用可能な年の一覧（フィルタ用） ──
  const availableYears = [...new Set(records.map(r => r.month.slice(0, 4)))].sort((a, b) => b.localeCompare(a));

  // ── フィルタ＋ソート済みレコード ──
  const sorted = [...records]
    .filter(r => yearFilter === "all" || r.month.slice(0, 4) === yearFilter)
    .sort((a, b) =>
      sortOrder === "desc"
        ? b.month.localeCompare(a.month)
        : a.month.localeCompare(b.month)
    );

  // ── グラフ用データ（時系列昇順） ──
  const chartData = [...records]
    .filter(r => yearFilter === "all" || r.month.slice(0, 4) === yearFilter)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => {
      const selfUse   = (r.generated ?? 0) - (r.sold ?? 0);
      const { value: sellIncome } = getSellIncome(r, settings?.fitRate);
      const savingEst  = Math.max(0, selfUse) * 30;
      return {
        month:    fmt.monthAxis(r.month),
        発電量:   r.generated ?? 0,
        売電量:   r.sold       ?? 0,
        自家消費: selfUse      < 0 ? 0 : selfUse,
        総消費:   r.consumed   ?? 0,
        売電収入: Math.round(sellIncome),
        節電効果: Math.round(savingEst),
        経済効果: Math.round(sellIncome + savingEst),
        実電気代: r.electricBill ?? 0,
      };
    });

  // ── 集計サマリー ──
  const totalGen  = records.reduce((s, r) => s + (r.generated ?? 0), 0);
  const totalSold = records.reduce((s, r) => s + (r.sold ?? 0), 0);
  const totalCons = records.reduce((s, r) => s + (r.consumed ?? 0), 0);
  const totalSelf = totalGen - totalSold;
  const totalSellIncome = records.reduce((s, r) => s + getSellIncome(r, settings?.fitRate).value, 0);
  const actualIncomeCount = records.filter(r => r.soldIncome != null).length;

  // フォーム入力中の月に適用される現契約単価をプレビュー表示
  const previewTariff = form.month ? findApplicableTariff(tariffCurrentHistory, form.month) : null;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div className="page-title">
              <span className="page-title-icon" style={{ background: C.textMuted }}><TabIcon name="list.bullet" color="#fff" size={20} /></span>
              実績
            </div>
            <div className="page-subtitle">月ごとの発電量・売電量・総消費電力量を記録します</div>
          </div>
          <button className="btn btn-primary" onClick={() => {
            if (showForm && !editId) { resetForm(); return; }
            setForm({ ...EMPTY_RECORD_FORM });
            setEditId(null);
            setShowForm(true);
          }}>
            {showForm && !editId ? "✕ 閉じる" : "+ 月次データを追加"}
          </button>
        </div>
      </div>

      {/* ── 入力フォーム ── */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">
              {editId ? `✏ 編集: ${fmt.month(form.month)}` : "新規データ入力"}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={resetForm}>キャンセル</button>
          </div>

          {/* 請求書・モニタリング画面のスクリーンショットを見ながら入力するためのメモ機能 */}
          <ScreenshotMemoPanel setForm={setForm} addonHistory={addonHistory} />

          {/* 年月（独立行：グリッドのフィット計算でinput[type=month]のネイティブUIがはみ出すのを防ぐ） */}
          <div className="form-group" style={{ marginBottom: 12, maxWidth: 220 }}>
            <label className="form-label">年月 *</label>
            <input type="month" className="form-input"
              style={{ width: "100%", boxSizing: "border-box" }}
              value={form.month}
              onChange={e => {
                const newMonth = e.target.value;
                setForm(p => {
                  const next = { ...p, month: newMonth };
                  // [自動入力] 再エネ賦課金は年1回しか変わらない公定単価のため、年月が確定したら
                  // addonHistory（月以前で最も新しいテーブル値を遡って適用）から自動セットする。
                  // 既にユーザーが手入力している値は上書きしない（編集中の上書き保存等を保護するため）。
                  if (newMonth && (p.renewableLevy === "" || p.renewableLevy === undefined)) {
                    const addon = findApplicableAddon(addonHistory, newMonth);
                    if (addon?.levy != null) next.renewableLevy = String(addon.levy);
                  }
                  return next;
                });
              }}
            />
            {form.month && (() => {
              const addon = findApplicableAddon(addonHistory, form.month);
              return addon?.levy != null ? (
                <div className="form-hint">
                  再エネ賦課金は{form.month}分としてテーブル値 {addon.levy}円/kWh を自動入力しています（下の「燃料費調整単価・再エネ賦課金」欄で修正可能）。
                </div>
              ) : null;
            })()}
          </div>

          {/* 行1: 発電量・売電量・消費量 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">発電量 (kWh)</label>
              <input type="number" min="0" step="0.1" className="form-input"
                placeholder="例: 850.0"
                value={form.generated}
                onChange={e => setForm(p => ({ ...p, generated: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">売電量 (kWh)</label>
              <input type="number" min="0" step="0.1" className="form-input"
                placeholder="例: 420.0"
                value={form.sold}
                onChange={e => setForm(p => ({ ...p, sold: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">総消費電力量 (kWh)</label>
              <input type="number" min="0" step="0.1" className="form-input"
                placeholder="例: 600.0"
                value={form.consumed}
                onChange={e => setForm(p => ({ ...p, consumed: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">買電量 (kWh)</label>
              <input type="number" min="0" step="0.1" className="form-input"
                placeholder="検針票の買電量"
                value={form.boughtKwh}
                onChange={e => setForm(p => ({ ...p, boughtKwh: e.target.value }))}
              />
            </div>
          </div>

          {/* 売電収入（実額）の入力 — 改善① */}
          <div style={{
            background: C.greenDim, borderRadius: 8, padding: 12, marginBottom: 12,
            border: `1px solid ${C.green}44`
          }}>
            <label className="form-label" style={{ color: C.green }}>
              ⚡ 売電収入（電力会社からの実際の振込額・円） — 推奨入力
            </label>
            <input type="number" min="0" step="1" className="form-input" style={{ maxWidth: 240 }}
              placeholder="例: 6720（検針票・振込通知の金額）"
              value={form.soldIncome}
              onChange={e => setForm(p => ({ ...p, soldIncome: e.target.value }))}
            />
            <div className="form-hint">
              入力すると、こちらの実額を経済メリット計算に最優先で使用します。未入力の場合は売電量×FIT単価({settings?.fitRate ?? 16}円)で推定します。
            </div>
          </div>

          {/* 行2: 電気代・メモ */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">実際の電気代 (円)</label>
              <input type="number" min="0" step="1" className="form-input"
                placeholder="検針票の請求額"
                value={form.electricBill}
                onChange={e => setForm(p => ({ ...p, electricBill: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">メモ</label>
              <input type="text" className="form-input"
                placeholder="例: 天候不良で低め"
                value={form.memo}
                onChange={e => setForm(p => ({ ...p, memo: e.target.value }))}
              />
            </div>
          </div>

          {/* 燃料費調整単価・再エネ賦課金（addonHistoryへの反映項目）
              [改善①] 以前はOCR結果が入っている時だけ自動で開くDisclosureだったため、
              OCRを使わなくなってからは存在に気付きにくくなっていた。
              燃料費調整単価は毎月変わり必ず入力してほしい項目のため、常時表示に変更する。 */}
          <div style={{
            background: `${C.sun}15`, borderRadius: 8, padding: 12, marginBottom: 16,
            border: `1px solid ${C.sun}44`
          }}>
            <label className="form-label" style={{ color: C.sun }}>
              ⛽ 燃料費調整単価・再エネ賦課金（検針票より・料金タブに反映）
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginTop: 6 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">燃料費調整単価 (円/kWh)</label>
                <input type="number" step="0.01" className="form-input"
                  placeholder="検針票の当月分。例: -7.74"
                  value={form.fuelAdjustment}
                  onChange={e => setForm(p => ({ ...p, fuelAdjustment: e.target.value }))}
                />
                <div className="form-hint">
                  毎月変わります。検針票の「燃料費調整単価」をそのまま入力してください。保存時に料金タブの月別履歴にも反映されます。
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">再エネ賦課金 (円/kWh)</label>
                <input type="number" step="0.01" className="form-input"
                  placeholder="年1回の改定時のみ変更"
                  value={form.renewableLevy}
                  onChange={e => setForm(p => ({ ...p, renewableLevy: e.target.value }))}
                />
                <div className="form-hint">
                  年1回程度しか変わりません。上の年月欄でテーブル値が自動入力されるので、改定があった月だけ書き換えれば、以降の月にも自動的に反映されます。
                </div>
              </div>
            </div>
          </div>

          {/* 自家消費・適用単価プレビュー */}
          {(form.generated !== "" || form.sold !== "" || form.month) && (
            <div style={{
              background: C.panel, borderRadius: 8, padding: "10px 14px",
              fontSize: 12, color: C.textSecondary, marginBottom: 14,
              display: "flex", gap: 24, flexWrap: "wrap"
            }}>
              {form.generated !== "" && form.sold !== "" && (
                <span>自家消費量（自動計算）:&ensp;
                  <strong style={{ color: C.green, fontFamily: "JetBrains Mono" }}>
                    {Math.max(0, parseFloat(form.generated || 0) - parseFloat(form.sold || 0)).toFixed(1)} kWh
                  </strong>
                </span>
              )}
              {previewTariff && (
                <span>この月に適用される単価:&ensp;
                  <strong style={{ color: C.sun, fontFamily: "JetBrains Mono" }}>
                    {previewTariff.name}（{previewTariff.effectiveFrom}〜）
                  </strong>
                </span>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" onClick={resetForm}>キャンセル</button>
            <button className="btn btn-primary" onClick={handleSave}>
              {editId ? "更新する" : "保存する"}
            </button>
          </div>
        </div>
      )}

      {/* ── サマリーKPI ── */}
      {records.length > 0 && (
        <div className="kpi-grid" style={{ marginBottom: 20 }}>
          {[
            { label: "累計 発電量",   value: `${(totalGen/1000).toFixed(2)}`,  unit: "MWh",  color: C.sun },
            { label: "累計 売電量",   value: `${(totalSold/1000).toFixed(2)}`, unit: "MWh",  color: C.blue },
            { label: "累計 自家消費", value: `${(totalSelf/1000).toFixed(2)}`, unit: "MWh",  color: C.green },
            { label: "累計 売電収入", value: `${Math.round(totalSellIncome/10000)}`, unit: "万円", color: C.green },
          ].map(k => (
            <div key={k.label} className="kpi-card">
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-value" style={{ color: k.color }}>{k.value}<span className="kpi-unit">{k.unit}</span></div>
              <div className="kpi-sub">
                {k.label === "累計 売電収入"
                  ? `実額${actualIncomeCount}件 / 推定${records.length - actualIncomeCount}件`
                  : `${records.length} ヶ月分`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── グラフ ── */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">月別グラフ</span>
            <div style={{ display: "flex", gap: 6 }}>
              {[["kwh","電力量 (kWh)"],["yen","経済効果 (円)"]].map(([m, label]) => (
                <button key={m}
                  className={`btn btn-sm ${chartMode === m ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setChartMode(m)}
                >{label}</button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            {chartMode === "kwh" ? (
              <BarChart data={chartData} barGap={2} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" height={50} interval="preserveStartEnd" />
                <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, color: C.textSecondary }} />
                <Bar dataKey="発電量"   fill={C.sun}   radius={[4,4,0,0]} name="発電量" />
                <Bar dataKey="売電量"   fill={C.blue}  radius={[4,4,0,0]} name="売電量" />
                <Bar dataKey="自家消費" fill={C.green} radius={[4,4,0,0]} name="自家消費" />
                <Bar dataKey="総消費"   fill={C.textMuted} radius={[4,4,0,0]} name="総消費" opacity={0.6} />
              </BarChart>
            ) : (
              <BarChart data={chartData} barGap={2} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" height={50} interval="preserveStartEnd" />
                <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={v => `¥${(v/1000).toFixed(0)}k`} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 8, padding: "10px 14px", fontSize: 12,
                    }}>
                      <div style={{ color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
                      {payload.map(p => (
                        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
                          {p.name}：<span style={{ fontFamily: "JetBrains Mono" }}>
                            {fmt.yen(p.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 12, color: C.textSecondary }} />
                <Bar dataKey="売電収入" fill={C.sun}   radius={[4,4,0,0]} name="売電収入" />
                <Bar dataKey="節電効果" fill={C.green} radius={[4,4,0,0]} name="節電効果（推定）" />
                <Bar dataKey="実電気代" fill={C.blue}  radius={[4,4,0,0]} name="実際の電気代" opacity={0.7} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 実績一覧（リスト形式：カードタップで詳細展開） ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
        <div className="section-label" style={{ margin: 0 }}>月次実績一覧</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {availableYears.length > 1 && (
            <select className="form-select" style={{ width: "auto", padding: "5px 10px", fontSize: 12 }}
              value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
              <option value="all">全年度</option>
              {availableYears.map(y => (
                <option key={y} value={y}>{y}年</option>
              ))}
            </select>
          )}
          <button className={`btn btn-sm ${sortOrder==="desc"?"btn-primary":"btn-secondary"}`}
            onClick={() => setSortOrder("desc")}>新しい順</button>
          <button className={`btn btn-sm ${sortOrder==="asc"?"btn-primary":"btn-secondary"}`}
            onClick={() => setSortOrder("asc")}>古い順</button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">
              {records.length === 0 ? "実績データがありません" : `${yearFilter}年の実績データがありません`}
            </div>
            <div className="empty-desc">
              {records.length === 0 ? (
                <>上の「月次データを追加」ボタンから、<br />月ごとの発電量・売電量・消費量を入力してください。</>
              ) : (
                <>別の年度を選択するか、<button className="btn btn-secondary btn-sm" style={{marginTop:8}} onClick={() => setYearFilter("all")}>全年度を表示</button></>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* 合計カード */}
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>合計（{sorted.length}ヶ月）</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted }}>発電量</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  {fmt.kwh(sorted.reduce((s, r) => s + (r.generated ?? 0), 0))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted }}>売電収入</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.sun }}>
                  {fmt.yen(sorted.reduce((s, r) => s + getSellIncome(r, settings?.fitRate).value, 0))}
                </div>
              </div>
            </div>
          </div>

          {/* 月別リスト */}
          <div className="list-group">
            {sorted.map((r, idx) => {
              const selfUse = (r.generated ?? 0) - (r.sold ?? 0);
              const { value: sellIncome, isActual } = getSellIncome(r, settings?.fitRate);
              const isOpen = expandedRecordId === r.id;
              return (
                <div key={r.id}>
                  <div className="list-cell" onClick={() => setExpandedRecordId(isOpen ? null : r.id)}>
                    <div className="list-cell-main">
                      <span className="list-cell-title">{fmt.month(r.month)}</span>
                      <span className="list-cell-subtitle">発電 {fmt.kwh(r.generated)} ／ 売電 {fmt.kwh(r.sold)}</span>
                    </div>
                    <span className="list-cell-value" style={{ color: C.sun }}>{fmt.yen(sellIncome)}</span>
                    <span className={`list-cell-chevron${isOpen ? " expanded" : ""}`}>▸</span>
                  </div>
                  {isOpen && (
                    <div className="list-cell-detail">
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>自家消費</span>
                        <span style={{ fontWeight: 600 }}>{fmt.kwh(Math.max(0, selfUse))}</span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>総消費</span>
                        <span style={{ fontWeight: 600 }}>{r.consumed != null ? fmt.kwh(r.consumed) : "—"}</span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>買電量</span>
                        <span style={{ fontWeight: 600 }}>{r.boughtKwh != null ? fmt.kwh(r.boughtKwh) : "—"}</span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>
                          売電収入{isActual ? "（実績）" : "（推定）"}
                        </span>
                        <span style={{ fontWeight: 600, color: C.sun }}>{fmt.yen(sellIncome)}</span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>実際の電気代</span>
                        <span style={{ fontWeight: 600 }}>{r.electricBill != null ? fmt.yen(r.electricBill) : "—"}</span>
                      </div>
                      {r.memo && (
                        <div className="list-cell-detail-row">
                          <span style={{ color: C.textMuted }}>メモ</span>
                          <span style={{ fontWeight: 500, textAlign: "right" }}>{r.memo}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                          onClick={() => startEdit(r)}>編集</button>
                        <button className="btn btn-danger btn-sm" style={{ flex: 1 }}
                          onClick={() => handleDelete(r.id)}>削除</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 3: 料金単価設定画面
// ─────────────────────────────────────────────
// [料金タブ再編成] TariffEditorは契約プラン（時間帯別単価・基本料金）の管理に専念する。
// 燃料費調整単価・再エネ賦課金は月によって変動する実績値のため、ここでは扱わず、
// TariffScreen側の「燃料費調整単価」「再エネ賦課金」セクション（addonHistoryベース）に
// 一本化した。latestAddonは「実質単価プレビュー」の参考表示のみに使う（保存対象ではない）。
function TariffEditor({ tariff, onUpdate, accentColor, label, isNew, onCancelNew, onDelete, canDelete, latestAddon }) {
  const [local, setLocal] = useState(() => ({
    ...tariff,
    tiers: tariff.tiers.map(t => ({ ...t })),
  }));
  const [dirty, setDirty] = useState(isNew);

  // 親から自動取得などで値が更新された場合に追従（未編集時のみ）
  useEffect(() => {
    if (!dirty) {
      setLocal({ ...tariff, tiers: tariff.tiers.map(t => ({ ...t })) });
    }
  }, [tariff.updatedAt, tariff.effectiveFrom]);

  const update = (fn) => { setLocal(prev => { const n = fn(prev); return n; }); setDirty(true); };

  const handleSave = () => {
    if (!local.effectiveFrom) { toast("適用開始月を入力してください", "error"); return; }
    const parsed = {
      ...local,
      basicFee:       parseFloat(local.basicFee)       || 0,
      tiers: local.tiers.map(t => ({ ...t, rate: parseFloat(t.rate) || 0 })),
      updatedAt: new Date().toISOString().slice(0, 7),
    };
    onUpdate(parsed);
    setDirty(false);
    toast(`${label}（${local.effectiveFrom}〜）の単価を保存しました`, "success");
  };

  const addTier = () => {
    update(p => ({ ...p, tiers: [...p.tiers, { label: "新しい時間帯", rate: 0 }] }));
  };

  const removeTier = (i) => {
    update(p => ({ ...p, tiers: p.tiers.filter((_, idx) => idx !== i) }));
  };

  // 実質単価プレビュー用（参考表示のみ・保存対象ではない）
  const addOnRef = (latestAddon?.fuel ?? 0) + (latestAddon?.levy ?? 0);

  return (
    <div className="card" style={{ borderTop: `3px solid ${accentColor}` }}>
      <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
        <span className="card-title" style={{ color: accentColor, minWidth: 0, flex: "1 1 100%" }}>
          {label}{isNew ? "（新規）" : ""}
        </span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
          {isNew && onCancelNew && (
            <button className="btn btn-secondary btn-sm" onClick={onCancelNew}>キャンセル</button>
          )}
          {dirty && (
            <button className="btn btn-primary btn-sm" onClick={handleSave}>保存する</button>
          )}
          {!isNew && canDelete && onDelete && (
            <button className="btn btn-danger btn-sm" onClick={onDelete}>この単価を削除</button>
          )}
        </div>
      </div>

      {/* 適用開始月 */}
      <div className="form-group">
        <label className="form-label">適用開始月（この月以降の実績に適用）</label>
        <input type="month" className="form-input" style={{ maxWidth: 200 }}
          value={local.effectiveFrom ?? ""}
          onChange={e => update(p => ({ ...p, effectiveFrom: e.target.value }))} />
        <div className="form-hint">単価改定があった月を入力すると、その月以降の実績に自動で適用されます</div>
      </div>

      {/* プラン名 */}
      <div className="form-group">
        <label className="form-label">プラン名</label>
        <input className="form-input" value={local.name}
          onChange={e => update(p => ({ ...p, name: e.target.value }))} />
      </div>

      {/* 基本料金 */}
      <div className="form-group">
        <label className="form-label">基本料金（円/月）</label>
        <input type="number" className="form-input" style={{ maxWidth: 200 }}
          value={local.basicFee}
          onChange={e => update(p => ({ ...p, basicFee: e.target.value }))} />
      </div>

      {/* 時間帯別単価（従量料金） */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <label className="form-label" style={{ margin: 0 }}>時間帯別 従量単価（円/kWh）</label>
          <button className="btn btn-secondary btn-sm" onClick={addTier}>+ 追加</button>
        </div>
        {local.tiers.map((tier, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr 120px 36px",
            gap: 8, marginBottom: 8, alignItems: "center"
          }}>
            <input className="form-input" placeholder="時間帯の説明"
              value={tier.label}
              onChange={e => update(p => {
                const tiers = p.tiers.map((t, idx) => idx === i ? { ...t, label: e.target.value } : t);
                return { ...p, tiers };
              })} />
            <input type="number" step="0.01" className="form-input" style={{ textAlign: "right" }}
              value={tier.rate}
              onChange={e => update(p => {
                const tiers = p.tiers.map((t, idx) => idx === i ? { ...t, rate: e.target.value } : t);
                return { ...p, tiers };
              })} />
            <button className="btn btn-danger btn-sm" onClick={() => removeTier(i)}
              style={{ padding: "5px 8px" }}>✕</button>
          </div>
        ))}
      </div>

      {/* 実質単価プレビュー（参考表示。燃料費調整単価・再エネ賦課金は下のセクションの最新実績を使用） */}
      {latestAddon && (
        <div style={{
          display: "flex", gap: 16, flexWrap: "wrap",
          fontSize: 12, color: C.textSecondary, marginBottom: 14,
          borderTop: `1px solid ${C.border}`, paddingTop: 10
        }}>
          <span>実質単価（参考・直近実績の燃料調整費+賦課金を加算）:</span>
          {local.tiers.slice(0, 1).map((t, i) => (
            <strong key={i} style={{ color: accentColor, fontFamily: "JetBrains Mono" }}>
              {t.label.split("（")[0]} {((parseFloat(t.rate) || 0) + addOnRef).toFixed(2)} 円/kWh
            </strong>
          ))}
        </div>
      )}

      {/* メモ */}
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">備考</label>
        <input className="form-input" value={local.note}
          onChange={e => update(p => ({ ...p, note: e.target.value }))} />
        <div className="form-hint">最終更新: {local.updatedAt ?? "—"}</div>
      </div>
    </div>
  );
}


// [料金タブ再編成] 月別実績（addonHistory）の1行を編集するための小さなフォーム。
// 燃料費調整単価セクション・再エネ賦課金セクションの両方から、対象フィールド（"fuel" or "levy"）を
// 指定して共有で使う。保存時は対象フィールドのみ更新し、もう一方の値は維持する
// （addonHistoryは {month: {fuel, levy}} という1つのオブジェクトのため）。
function AddonMonthForm({ field, fieldLabel, unit, addonHistory, setAddonHistory, editingMonth, onDone }) {
  const isNew = editingMonth === "__new__";
  const existing = !isNew ? addonHistory?.[editingMonth] : null;
  const [month, setMonth] = useState(isNew ? "" : editingMonth);
  const [value, setValue] = useState(existing ? String(existing[field] ?? "") : "");

  const handleSave = () => {
    if (!month) { toast("年月を入力してください", "error"); return; }
    const v = parseFloat(value);
    if (Number.isNaN(v)) { toast(`${fieldLabel}を入力してください`, "error"); return; }

    // 新規追加で既に同じ月が存在する場合は、上書き保存として扱う（年月入力欄で重複させないための注意書きは下に表示）
    const current = addonHistory?.[month] ?? {};
    const next = {
      ...(addonHistory ?? {}),
      [month]: { ...current, [field]: v },
    };
    setAddonHistory(next);
    toast(`${fmt.month(month)} の${fieldLabel}を保存しました`, "success");
    onDone();
  };

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="card-header">
        <span className="card-title">{isNew ? `${fieldLabel}を追加` : `${fmt.month(editingMonth)} の${fieldLabel}を編集`}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">年月</label>
          <input type="month" className="form-input" value={month}
            disabled={!isNew}
            onChange={e => setMonth(e.target.value)} />
          {isNew && <div className="form-hint">既に登録済みの月を選ぶと上書きされます</div>}
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">{fieldLabel}（{unit}）</label>
          <input type="number" step="0.01" className="form-input"
            value={value} onChange={e => setValue(e.target.value)} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>保存する</button>
        <button className="btn btn-secondary btn-sm" onClick={onDone}>キャンセル</button>
      </div>
    </div>
  );
}

// [料金タブ再編成] 燃料費調整単価・再エネ賦課金、共通の月別実績テーブル＋追加/編集/削除UI。
// fieldで対象列("fuel" or "levy")を切り替える。削除は「即削除＋Undo」方式（Phase 4の方針を継続）。
function AddonMonthSection({ field, fieldLabel, unit, icon, color, addonHistory, setAddonHistory, helpNote }) {
  const [editingMonth, setEditingMonth] = useState(null); // null | "__new__" | "YYYY-MM"
  const months = addonHistory ? Object.keys(addonHistory).sort().reverse() : [];

  // [タップ展開化] 月別実績が増えるほど一覧が縦に長くなるため、年ごとにグループ化し、
  // 各年をDisclosureで折りたたむ。最新の年（データがある中で一番新しい年）だけ
  // デフォルトで展開し、過去年は折りたたんだ状態にする。
  const monthsByYear = {};
  months.forEach(m => {
    const year = m.slice(0, 4);
    if (!monthsByYear[year]) monthsByYear[year] = [];
    monthsByYear[year].push(m);
  });
  const years = Object.keys(monthsByYear).sort().reverse(); // 新しい年が上
  const latestYear = years[0];

  const handleDelete = (month) => {
    const entry = addonHistory[month];
    // このフィールドだけを消す（他方のフィールドが残っていればその月のエントリ自体は維持、
    // 両方無くなる場合のみ月エントリそのものを削除する）
    const restField = field === "fuel" ? "levy" : "fuel";
    const next = { ...addonHistory };
    if (entry[restField] !== undefined && entry[restField] !== null) {
      next[month] = { ...entry, [field]: undefined };
    } else {
      delete next[month];
    }
    setAddonHistory(next);
    undoToast(`${fmt.month(month)} の${fieldLabel}を削除しました`, () => {
      setAddonHistory({ ...next, [month]: entry });
    });
  };

  const renderMonthTable = (monthList) => (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>年月</th>
            <th style={{ textAlign: "right" }}>{fieldLabel}</th>
            <th style={{ width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {monthList.map(m => {
            const v = addonHistory[m]?.[field];
            if (v === undefined || v === null) return null;
            return (
              <tr key={m}>
                <td style={{ color: C.textPrimary, fontWeight: 600 }}>{fmt.month(m)}</td>
                <td className="num" style={{ color: field === "fuel" && v < 0 ? C.green : C.textPrimary }}>
                  {v >= 0 ? "+" : ""}{v.toFixed(2)} {unit}
                </td>
                <td style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    <button className="btn btn-secondary btn-sm" style={{ padding: "4px 8px" }}
                      onClick={() => setEditingMonth(m)}>編集</button>
                    <button className="btn btn-danger btn-sm" style={{ padding: "4px 8px" }}
                      onClick={() => handleDelete(m)}>✕</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="card" style={{ marginBottom: 20, borderTop: `3px solid ${color}` }}>
      <div className="card-header">
        <span className="card-title" style={{ color }}>{icon} {fieldLabel}（月別実績）</span>
        {editingMonth === null && (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditingMonth("__new__")}>
            + 追加
          </button>
        )}
      </div>
      {helpNote && (
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>{helpNote}</div>
      )}

      {editingMonth !== null && (
        <AddonMonthForm
          field={field} fieldLabel={fieldLabel} unit={unit}
          addonHistory={addonHistory} setAddonHistory={setAddonHistory}
          editingMonth={editingMonth}
          onDone={() => setEditingMonth(null)}
        />
      )}

      {months.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted }}>まだ登録がありません。「+ 追加」から登録してください。</div>
      ) : (
        <div>
          {years.map(year => {
            // 編集中の月、または新規追加（__new__）の対象年は強制的に開いた状態にする。
            // Disclosureは非制御コンポーネント（内部にopen stateを持つ）なので、
            // 強制的に開かせたい場合はkeyを変えて再マウントさせる。
            const editingYear = editingMonth === "__new__" ? null : editingMonth?.slice(0, 4);
            const forceOpen = year === editingYear;
            return (
              <Disclosure
                key={forceOpen ? `${year}-open` : year}
                title={`${year}年（${monthsByYear[year].length}件）`}
                defaultOpen={forceOpen || year === latestYear}
              >
                {renderMonthTable(monthsByYear[year])}
              </Disclosure>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TariffScreen({ tariffCurrentHistory, tariffCompareHistory, updateTariffHistory, deleteTariffHistoryEntry, addonHistory, setAddonHistory, settings }) {
  const [addingNew, setAddingNew] = useState(null); // "current" | "compare" | null

  const sortedCurrent  = [...tariffCurrentHistory].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const sortedCompare  = [...tariffCompareHistory].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const latestCurrent  = sortedCurrent[0];
  const latestCompare  = sortedCompare[0];
  const isLinked = latestCurrent?.linkedToCompare;
  const hasSwitchHistory = tariffCurrentHistory.length > 1;

  // 実質単価プレビュー用に、直近月の燃料調整費・賦課金を参考値として渡す
  // （TariffEditor自体はaddonHistoryに依存しないが、表示用の参考情報として渡す）
  const addonMonthsSorted = addonHistory ? Object.keys(addonHistory).sort() : [];
  const latestAddon = addonMonthsSorted.length > 0 ? addonHistory[addonMonthsSorted[addonMonthsSorted.length - 1]] : null;

  const startAddNew = (which) => setAddingNew(which);
  const cancelAddNew = () => setAddingNew(null);

  const makeNewEntry = (base) => ({
    ...base,
    tiers: base.tiers.map(t => ({ ...t })),
    effectiveFrom: new Date().toISOString().slice(0, 7),
    updatedAt: new Date().toISOString().slice(0, 7),
  });

  // [Phase 4] こちらも確認モーダル→Undo Snackbar方式に統一。
  // ただし「最低1件は必要」というデータ整合性のガードは事前チェックとして残す
  // （これはUndoで救えない種類の制約なので、確認モーダルではなくtoast("error")で即時拒否）。
  // Undo時は、削除前のエントリをここで保持しておき updateTariffHistory（既存のupsert関数）で
  // そのまま再投入する。deleteTariffHistoryEntry側に戻り値や dryRun は無いため、
  // 「削除される本体」は呼び出し元（このスコープ）で確保してからAppの関数を呼ぶ。
  const handleDeleteEntry = (which, effectiveFrom, historyLen) => {
    if (historyLen <= 1) { toast("最低1件の単価設定が必要です", "error"); return; }
    const history = which === "current" ? tariffCurrentHistory : tariffCompareHistory;
    const entryToDelete = history.find(h => h.effectiveFrom === effectiveFrom);
    if (!entryToDelete) return;
    deleteTariffHistoryEntry(which, effectiveFrom);
    undoToast(`単価設定（${effectiveFrom}〜）を削除しました`, () => updateTariffHistory(which, entryToDelete));
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <span className="page-title-icon" style={{ background: C.sun }}><TabIcon name="yen" color="#fff" size={20} /></span>
          料金
        </div>
        <div className="page-subtitle">時間帯別単価・燃料費調整単価・再エネ賦課金をそれぞれ独立して管理します</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {/* 契約切替の説明 */}
        {hasSwitchHistory && !isLinked && (
          <Disclosure title="2025年7月に北陸電力から出光でんきへ切替" icon="🔄">
            2025年1〜6月は北陸電力「くつろぎナイト12」と直接契約（基本料金2,255円・EV割なし）。
            2025年7月に出光でんきへ切替し、同プランの時間帯単価を踏襲しつつ、
            基本料金からEV割200円を割引した1,945円になりました。
            「分析」タブの比較プランは、切替後も北陸電力と契約し続けていた場合（基本料金2,255円のまま）を仮定して算出しています。
          </Disclosure>
        )}

        {/* 連動構造の説明（linkedToCompareフラグを使う場合のみ表示） */}
        {isLinked && (
          <Disclosure title="現契約は北陸電力プランに連動しています" icon="🔗">
            出光でんき（現契約）は北陸電力「くつろぎナイト12」の時間帯単価をそのまま踏襲し、
            基本料金のみEV割（現在 {settings?.evDiscount ?? 200}円/月）を割引した契約です。
            そのため、下の「① 時間帯別単価」で北陸電力側の単価を更新すると、現契約側にも自動的に反映されます
            （現契約の基本料金は常に「北陸電力の基本料金 − EV割」で計算されます）。
            EV割の金額は「設定」タブで変更できます。
            なお、燃料費調整単価・再エネ賦課金は下の②③のセクションで、出光でんき・北陸電力共通の実績値として一本管理しています。
          </Disclosure>
        )}

        {/* 最新情報の取得方法ガイド
            [改善②] 北陸電力の燃料費調整単価ページへのリンクは繋がらなくなっており、
            検針票から毎月手入力する運用に統一したため不要（削除）。 */}
        <Disclosure title="再エネ賦課金・燃料費調整単価の確認方法" icon="🔍">
          <div style={{
            background: C.surface, borderRadius: 8, padding: 12, marginBottom: 12
          }}>
            <strong style={{ color: C.textPrimary }}>現在判明している最新値（参考）</strong>
            <div style={{ marginTop: 6 }}>
              ・再エネ発電促進賦課金：<strong style={{ color: C.textPrimary }}>4.18円/kWh</strong>　（2026年度・経済産業省発表／全国一律・2026年5月検針分〜2027年4月検針分）
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div>📄 <strong>再エネ賦課金</strong>：経済産業省・資源エネルギー庁が毎年3月頃に翌年度単価を公表（全電力会社共通）。年1回、③のテーブルに追記するだけで以降の月にも自動的に反映されます。</div>
            <div>💬 このチャットで「再エネ賦課金の最新値を調べて」と聞くと、Claudeがその場でWeb検索して最新値をお伝えします。確認した値は下の③のフォームに直接入力してください。</div>
            <div>⛽ <strong>燃料費調整単価</strong>は毎月変わるため、検針票の値を実績タブの入力フォームでそのまま入力してください（保存すると自動的に下の②にも反映されます）。</div>
          </div>
        </Disclosure>
      </div>

      {/* ① 時間帯別単価（契約プラン） */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>① 時間帯別単価（契約プラン）</span>
      </div>
      <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 14 }}>
        基本料金・時間帯ごとの従量単価など、契約プランそのものの条件を管理します。燃料費調整単価・再エネ賦課金はここには含まれません（②③で管理）。
      </div>

      {/* 現契約：履歴一覧 + 新規追加 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.sun }}>
            ☀ 現契約：出光でんき（北陸・オール電化10kVA）— 単価履歴 {sortedCurrent.length}件
          </span>
          {!addingNew && (
            <button className="btn btn-secondary btn-sm" onClick={() => startAddNew("current")}>
              + 新しい単価を追加
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {addingNew === "current" && (
            <Disclosure title="現契約：出光でんき（新規）" icon="☀" defaultOpen>
              <TariffEditor
                tariff={makeNewEntry(latestCurrent)}
                onUpdate={(v) => { updateTariffHistory("current", v); setAddingNew(null); }}
                accentColor={C.sun}
                label="現契約：出光でんき"
                isNew
                onCancelNew={cancelAddNew}
                latestAddon={latestAddon}
              />
            </Disclosure>
          )}
          {sortedCurrent.map((t, idx) => (
            <Disclosure
              key={t.effectiveFrom}
              title={`${t.effectiveFrom}〜${idx === 0 ? "現在" : sortedCurrent[idx - 1]?.effectiveFrom ?? ""}　基本料金${fmt.yen(t.basicFee)}`}
              icon="☀"
              defaultOpen={false}
            >
              <TariffEditor
                tariff={t}
                onUpdate={(v) => updateTariffHistory("current", v)}
                accentColor={C.sun}
                label={`現契約：出光でんき（${t.effectiveFrom}〜${idx === 0 ? "現在" : sortedCurrent[idx - 1]?.effectiveFrom ?? ""}）`}
                canDelete={sortedCurrent.length > 1}
                onDelete={() => handleDeleteEntry("current", t.effectiveFrom, sortedCurrent.length)}
                latestAddon={latestAddon}
              />
            </Disclosure>
          ))}
        </div>
      </div>

      {/* 比較プラン：履歴一覧 + 新規追加 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>
            🌙 比較：北陸電力「くつろぎナイト12」— 単価履歴 {sortedCompare.length}件
          </span>
          {!addingNew && (
            <button className="btn btn-secondary btn-sm" onClick={() => startAddNew("compare")}>
              + 新しい単価を追加
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {addingNew === "compare" && (
            <Disclosure title="比較：くつろぎナイト12（新規）" icon="🌙" defaultOpen>
              <TariffEditor
                tariff={makeNewEntry(latestCompare)}
                onUpdate={(v) => { updateTariffHistory("compare", v); setAddingNew(null); }}
                accentColor={C.blue}
                label="比較：くつろぎナイト12"
                isNew
                onCancelNew={cancelAddNew}
                latestAddon={latestAddon}
              />
            </Disclosure>
          )}
          {sortedCompare.map((t, idx) => (
            <Disclosure
              key={t.effectiveFrom}
              title={`${t.effectiveFrom}〜${idx === 0 ? "現在" : sortedCompare[idx - 1]?.effectiveFrom ?? ""}　基本料金${fmt.yen(t.basicFee)}`}
              icon="🌙"
              defaultOpen={false}
            >
              <TariffEditor
                tariff={t}
                onUpdate={(v) => updateTariffHistory("compare", v)}
                accentColor={C.blue}
                label={`比較：くつろぎナイト12（${t.effectiveFrom}〜${idx === 0 ? "現在" : sortedCompare[idx - 1]?.effectiveFrom ?? ""}）`}
                canDelete={sortedCompare.length > 1}
                onDelete={() => handleDeleteEntry("compare", t.effectiveFrom, sortedCompare.length)}
                latestAddon={latestAddon}
              />
            </Disclosure>
          ))}
        </div>
      </div>

      {/* 単価比較テーブル（最新設定同士） */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div className="card-header">
          <span className="card-title">単価クイック比較（最新設定・従量単価のみ）</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>項目</th>
                <th style={{ textAlign: "right", color: C.sun }}>出光でんき</th>
                <th style={{ textAlign: "right", color: C.blue }}>くつろぎナイト12</th>
                <th style={{ textAlign: "right" }}>差額</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: C.textSecondary }}>基本料金（月）</td>
                <td className="num">{fmt.yen(latestCurrent.basicFee)}</td>
                <td className="num">{fmt.yen(latestCompare.basicFee)}</td>
                <td className="num" style={{
                  color: (latestCurrent.basicFee - latestCompare.basicFee) <= 0 ? C.green : C.red
                }}>
                  {fmt.yen(latestCurrent.basicFee - latestCompare.basicFee)}
                </td>
              </tr>
              {latestCurrent.tiers.map((tier, i) => {
                const compTier = latestCompare.tiers[i];
                const diff = tier.rate - (compTier?.rate ?? 0);
                return (
                  <tr key={i}>
                    <td style={{ color: C.textSecondary }}>{tier.label}</td>
                    <td className="num">{tier.rate.toFixed(2)} 円/kWh</td>
                    <td className="num">{compTier ? `${compTier.rate.toFixed(2)} 円/kWh` : "—"}</td>
                    <td className="num" style={{ color: diff <= 0 ? C.green : C.red }}>
                      {compTier ? `${diff >= 0 ? "+" : ""}${diff.toFixed(2)} 円` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ② 燃料費調整単価（月別実績） */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>② 燃料費調整単価（月別実績）</span>
      </div>
      <AddonMonthSection
        field="fuel" fieldLabel="燃料費調整単価" unit="円/kWh"
        icon="⛽" color={C.red}
        addonHistory={addonHistory} setAddonHistory={setAddonHistory}
        helpNote="電力会社が毎月公表する値です。出光でんき・北陸電力で共通の実績値として、月次比較計算に自動適用されます。実績タブで検針票の値を入力すると、ここにも反映されます。"
      />

      {/* ③ 再エネ賦課金（月別実績） */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>③ 再エネ賦課金（月別実績）</span>
      </div>
      <AddonMonthSection
        field="levy" fieldLabel="再エネ賦課金" unit="円/kWh"
        icon="🌱" color={C.green}
        addonHistory={addonHistory} setAddonHistory={setAddonHistory}
        helpNote="経済産業省が毎年度公表する全国一律の値です（年に1回程度の更新で十分です）。出光でんき・北陸電力で共通の実績値として、月次比較計算に自動適用されます。"
      />
    </div>
  );
}


// ─────────────────────────────────────────────
// Step 4: 回収管理画面
// ─────────────────────────────────────────────
function RecoveryScreen({ records, settings, addonHistory, monthlyComparison }) {
  const fitRate      = settings.fitRate     ?? 8;
  const netCost       = (settings.installCost ?? 0) - (settings.subsidy ?? 0);
  const installedAt  = settings.installedAt ?? "2024-01";
  const fitEndYear   = settings.fitEndYear  ?? 2033;

  // [Phase 5] 予測モード切替（設計書の指示：既存の「直近12ヶ月単純平均」を
  // 「保守的推定」として残し、トグルで「季節調整」と比較できるようにする）。
  // デフォルトは季節調整（より実態に近いため）。
  const [forecastMode, setForecastMode] = useState("seasonal"); // "seasonal" | "conservative"

  // [月別メリット内訳] 月別／年別の表示粒度切替
  const [benefitBreakdownGranularity, setBenefitBreakdownGranularity] = useState("monthly"); // "monthly" | "yearly"

  // ── 月次経済メリット ──
  // calcMonthlyComparison（シミュレーション・ダッシュボードと共通のロジック）の結果をそのまま使う。
  // 月次メリット = 導入なし推定電気代 − 実質コスト（電気代 − 売電収入）
  //
  // [修正] グラフ用の内訳（売電収入＋節約効果）の合計が、必ず月次メリットと一致するように
  // 「節約効果」を「導入なし推定電気代 − 現在の電気代」（電気代の差分そのもの）として再定義する。
  // 以前はm.節電効果（自家消費量×実効単価の推定値）を使っていたが、これは別経路で算出された
  // 近似値であり、actualBillが実測値（電気代の請求額そのもの）の月は両者が一致しない
  // ＝グラフの合計が月次メリットの実際の数値と食い違う、という不整合があったため修正した。
  //   月次メリット = 導入なし推定電気代 − (現在の電気代 − 売電収入)
  //              = (導入なし推定電気代 − 現在の電気代) + 売電収入
  //              = savingExact + sellIncome　← この2項目の合計が必ず月次メリットと一致する
  const monthlyBenefits = [...monthlyComparison]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      month: m.month,
      benefit: m.月次メリット,
      sellIncome: m.売電収入,
      savingEst: m.導入なし推定電気代 - m.現在の電気代, // 節約効果（電気代の差分・厳密値）
      savingEstApprox: m.節電効果, // 参考：自家消費量×実効単価による推定値（厳密値とは別経路）
    }));

  // [月別メリット内訳の年別表示] monthlyBenefitsを年（YYYY）単位で合算する。
  // 「月別メリット内訳」グラフの粒度切替（月別／年別）用のデータソース。
  // 年の途中までしかデータが無い年（今年など）も、その年の実績分だけで集計する
  // （満年換算などの補正は行わない＝実績の素直な合計）。
  const yearlyBenefits = (() => {
    const byYear = {};
    monthlyBenefits.forEach(m => {
      const year = m.month.slice(0, 4);
      if (!byYear[year]) byYear[year] = { year, sellIncome: 0, savingEst: 0 };
      byYear[year].sellIncome += m.sellIncome;
      byYear[year].savingEst  += m.savingEst;
    });
    return Object.values(byYear).sort((a, b) => a.year.localeCompare(b.year));
  })();

  // [Phase 5] 機器交換イベント（パワコン交換・将来の蓄電池交換等）
  const maintenanceEvents = settings.maintenanceEvents ?? [];

  // 累積メリット
  // [Phase 5] 機器交換イベントがある月に到達したら、その月の費用を一括で減算する
  // （累積メリットがグラフ上でガクッと下がる「段差」として表現される）。
  let cumulative = 0;
  const cumulData = monthlyBenefits.map(m => {
    cumulative += m.benefit;
    cumulative -= calcMaintenanceDeduction(maintenanceEvents, m.month);
    return {
      month: fmt.monthAxis(m.month),
      rawMonth: m.month, // "YYYY-MM"形式（ツールチップでの経過期間算出用）
      累積メリット: Math.round(cumulative),
      実質負担額:   Math.round(netCost),
    };
  });

  // 月平均メリット（将来予測用：保守的推定＝直近12ヶ月平均、季節調整の基準値としても使う）
  // 全期間の単純平均ではなく、直近12ヶ月（データが12ヶ月未満なら全期間）の平均を使う。
  // 導入直後の数ヶ月（特に厳冬期）はシステムがまだ本来の性能を発揮しておらず、
  // この期間を将来予測にそのまま引き延ばすと回収期間を不当に長く見積もってしまうため。
  const recentMonths = monthlyBenefits.slice(-12);
  const avgMonthlyBenefit = recentMonths.length > 0
    ? recentMonths.reduce((s, m) => s + m.benefit, 0) / recentMonths.length
    : 0;
  // 参考: 全期間の単純平均（比較表示用）
  const avgMonthlyBenefitAllTime = monthlyBenefits.length > 0
    ? monthlyBenefits.reduce((s, m) => s + m.benefit, 0) / monthlyBenefits.length
    : 0;

  // [Phase 5] What-Ifシミュレーション用：直近12ヶ月の実績から、月次メリットのうち
  // 「節電効果（電気料金の変動に連動する部分）」と「売電収入（FIT単価の変動に連動する部分）」
  // の比率を求める。将来予測のbenefit（合成値）は分離されていないため、直近実績の比率を
  // 将来にも引き継ぐ近似として扱う。比率が求まらない場合（実績が無い等）はsaving比率100%
  // にフォールバックする（FIT単価変更の影響を過大評価しないための安全側の初期値）。
  // savingEstを「導入なし推定電気代-現在の電気代」（厳密値）に修正したことで、
  // recentBenefitBaseTotal（=recentSavingTotal+recentSellTotal）は近似ではなく
  // 実際の月次メリット合計と厳密に一致する（比率算出自体の精度も向上している）。
  const recentSavingTotal = recentMonths.reduce((s, m) => s + (m.savingEst || 0), 0);
  const recentSellTotal   = recentMonths.reduce((s, m) => s + (m.sellIncome || 0), 0);
  const recentBenefitBaseTotal = recentSavingTotal + recentSellTotal;
  const savingRatioOfBenefit = recentBenefitBaseTotal > 0 ? recentSavingTotal / recentBenefitBaseTotal : 1;
  const sellRatioOfBenefit   = recentBenefitBaseTotal > 0 ? recentSellTotal   / recentBenefitBaseTotal : 0;

  // [Phase 5] What-Ifスライダー：電気料金±%・FIT単価変更を将来予測に反映する。
  // 過去の実績（cumulData・avgMonthlyBenefit等）は一切変更せず、将来予測の積み上げ
  // （monthlyForecastFn・futureMaintenanceCost等）にのみ係数として効かせる。
  // electricPriceAdj: 電気料金の変動率（%）。節電効果（買電を減らした分の節約額）に連動するため、
  //   節電効果分にのみ (1 + electricPriceAdj/100) を掛ける。売電収入には影響しない
  //   （FIT単価は固定価格買取制度の契約単価であり、電気料金の市場変動とは独立しているため）。
  // fitRateAdj: 将来のFIT単価（円/kWh）。現在のsettings.fitRateとの比率を売電収入分に掛ける。
  //   nullの場合は現在の単価をそのまま将来も使う（What-If未適用＝既存動作と同一）。
  const [electricPriceAdj, setElectricPriceAdj] = useState(0); // -30 ~ +30 (%)
  const [fitRateAdj, setFitRateAdj] = useState(fitRate); // 円/kWh

  // [Phase 5] モンテカルロシミュレーション用state。
  // montecarloStdDevPct：月次予測値に乗せるばらつきの大きさ（標準偏差、基準値に対する%）。
  // 既定15%・5〜30%の範囲でユーザー調整可能（運用注意：ユーザーとの合意事項）。
  // オフが既定（1000試行×将来月数分のループはオンの時だけ計算し、不要な負荷を避ける）。
  const [montecarloEnabled, setMontecarloEnabled] = useState(false);
  const [montecarloStdDevPct, setMontecarloStdDevPct] = useState(15); // 5 ~ 30 (%)

  const whatIfActive = electricPriceAdj !== 0 || fitRateAdj !== fitRate;
  const fitRateRatio = fitRate > 0 ? fitRateAdj / fitRate : 1;

  // What-Ifパラメータを反映した将来予測値を返すラッパー。
  // savingEst相当分（savingRatioOfBenefit）には電気料金変動率、
  // sellIncome相当分（sellRatioOfBenefit）にはFIT単価比率を掛けて合成する。
  const applyWhatIf = (baseBenefit) => {
    const savingPart = baseBenefit * savingRatioOfBenefit * (1 + electricPriceAdj / 100);
    const sellPart   = baseBenefit * sellRatioOfBenefit * fitRateRatio;
    return savingPart + sellPart;
  };


  // [Phase 5] 季節調整の構成比を実績全体から算出
  const seasonal = calcSeasonalForecast(monthlyBenefits, 12);
  // 実際に使用する予測モード。季節性が判断できるデータ量（実績4ヶ月以上）に
  // 達していない場合は、ユーザーが季節調整を選んでいても自動的に保守的推定に
  // フォールバックする（データ不足での過信を避けるため）。
  const effectiveForecastMode = (forecastMode === "seasonal" && seasonal.seasonalityAvailable)
    ? "seasonal" : "conservative";
  // 与えられた「今から何ヶ月後か」(1始まり)に対する、その将来月の予測メリット額を返す関数。
  // 保守的推定：直近12ヶ月平均を常に返す（既存方式）。
  // 季節調整：年間合計の見積り(annualAvg×12を月構成比で配分)から該当カレンダー月の値を返す。
  const monthlyForecastFn = (monthsFromNow) => {
    if (effectiveForecastMode === "conservative") return avgMonthlyBenefit;
    const d = new Date();
    d.setMonth(d.getMonth() + monthsFromNow);
    const calMonth = d.getMonth() + 1;
    // 年間合計の見積りは「直近12ヶ月平均×12」を使う（実績全体の平均より直近の実態を反映するため）。
    // 季節調整はあくまで「年間の中でどう配分するか」を担い、量の基準は既存の直近12ヶ月平均と揃える。
    const annualEstimate = avgMonthlyBenefit * 12;
    return annualEstimate * (seasonal.ratio[calMonth] ?? 1 / 12);
  };
  // [Phase 5] 「今からmonthsFromNowヶ月後」が暦上どの"YYYY-MM"になるかを返すヘルパー。
  // 将来の機器交換イベントが、積み上げループの何回目で発生するかを判定するために使う
  // （monthlyForecastFn内のカレンダー月算出と同じ方法で揃えている）。
  const futureMonthKey = (monthsFromNow) => {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsFromNow);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  // [Phase 5] 将来予測の積み上げループ（recoveryMonthsLeft算出・futureData生成の両方）で、
  // 「今からmonthsFromNowヶ月後」にちょうど機器交換イベントが発生する場合の費用合計を返す。
  // 残り回収期間の算出にもグラフ描画にも同じ将来イベントを反映させるため、共通で使う。
  const futureMaintenanceCost = (monthsFromNow) =>
    calcMaintenanceDeduction(maintenanceEvents, futureMonthKey(monthsFromNow));

  // 回収済み・残額
  const totalBenefit = cumulative;
  const recovered    = Math.min(totalBenefit, netCost);
  const remaining    = Math.max(0, netCost - totalBenefit);
  const recoveryPct  = netCost > 0 ? Math.min(100, (totalBenefit / netCost) * 100) : 0;

  // ── 回収完了予測 ──
  // 「導入月」から「回収完了月」までの総月数で年数を算出する
  const installedDate = (() => {
    const parts = (installedAt ?? "2024-01").split("-").map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, 1);
  })();

  // 現時点で既に経過した月数（導入月→現在）
  const now = new Date();
  const elapsedMonths =
    (now.getFullYear() - installedDate.getFullYear()) * 12 +
    (now.getMonth() - installedDate.getMonth());

  // 残り月数 = remaining を月次予測メリットで積み上げて消化するまでの月数。
  // 保守的推定（固定値）の場合は単純な割り算と等価だが、季節調整（月により変動）の場合は
  // 「多い月・少ない月」が混在するため、1ヶ月ずつ積み上げて消化しきる時点を探す必要がある。
  // MAX_FORECAST_MONTHS は無限ループ防止の上限（50年）。月次メリットが恒常的に0以下の
  // 場合などにここで打ち切り、recoveryMonthsLeftはnull（予測不能）として扱う。
  // [Phase 5] 将来の機器交換イベント（パワコン交換等）が発生する月は、その費用を
  // 積み上げから一括減算する。これにより「交換費用が発生する分、回収完了が遅れる」
  // という実態がrecoveryDate（回収予定日）にも正しく反映される。
  const MAX_FORECAST_MONTHS = 600;
  const recoveryMonthsLeft = (() => {
    if (remaining <= 0) return 0;
    let cum = 0;
    for (let i = 1; i <= MAX_FORECAST_MONTHS; i++) {
      cum += applyWhatIf(monthlyForecastFn(i)); // [Phase 5] What-If（電気料金±%・FIT単価）を反映
      cum -= futureMaintenanceCost(i);
      if (cum >= remaining) return i;
    }
    return null; // 50年以内に回収できない（メリットがほぼ無い等）
  })();

  // 回収完了予定年月（現在から残り月数後）
  const recoveryDate = (() => {
    if (!recoveryMonthsLeft) return null;
    const d = new Date(now.getFullYear(), now.getMonth() + recoveryMonthsLeft, 1);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  })();

  // 導入月から回収完了月までの総月数 = 経過月数 + 残り月数
  const totalMonthsToRecovery = recoveryMonthsLeft != null
    ? elapsedMonths + recoveryMonthsLeft
    : null;

  const recoveryYearsLabel = (() => {
    if (totalMonthsToRecovery == null) return null;
    const years  = Math.floor(totalMonthsToRecovery / 12);
    const months = totalMonthsToRecovery % 12;
    if (years === 0) return `約${months}ヶ月`;
    if (months === 0) return `約${years}年`;
    return `約${years}年${months}ヶ月`;
  })();
  const recoveryYearNumber = totalMonthsToRecovery != null ? totalMonthsToRecovery / 12 : null;

  // 「残り期間」表示用：現時点から回収完了までの残り月数のみを年月表記に変換
  // （recoveryYearsLabelは「導入から完了まで」の全期間なので、用途が異なる）
  const remainingPeriodLabel = (() => {
    if (recoveryMonthsLeft == null) return null;
    const years  = Math.floor(recoveryMonthsLeft / 12);
    const months = recoveryMonthsLeft % 12;
    if (years === 0) return `約${months}ヶ月`;
    if (months === 0) return `約${years}年`;
    return `約${years}年${months}ヶ月`;
  })();

  // 将来予測（回収完了が見込まれる月まで動的に延長する。
  // 固定2年では実際の回収期間（10年超）に対してグラフ上に交差点が映らないため、
  // 「実際に交差するまで」を予測期間として確保する）
  const FUTURE_MONTHS = recoveryMonthsLeft != null
    ? Math.max(24, recoveryMonthsLeft + 12) // 交差点の少し先まで表示
    : 24;
  const futureData = [...cumulData];
  let lastCum = cumulative;
  let breakEvenIndex = null; // 損益分岐点（交差）に達したインデックス
  for (let i = 1; i <= FUTURE_MONTHS; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const label = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    const rawMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; // "YYYY-MM"形式
    const prevCum = lastCum;
    lastCum += applyWhatIf(monthlyForecastFn(i)); // [Phase 5] 季節調整/保守的推定 + What-If（電気料金±%・FIT単価）を反映
    // [Phase 5] 同月に機器交換イベントがあれば、その費用を一括減算する
    // （グラフ上で「その月だけガクッと下がる」段差として表現される）。
    // 損益分岐点の判定は、加算・減算を両方適用した後の最終値で行う
    // （イベント減算で一時的に再びnetCostを下回るケースも正しく扱うため）。
    lastCum -= futureMaintenanceCost(i);
    if (breakEvenIndex == null && prevCum < netCost && lastCum >= netCost) {
      breakEvenIndex = cumulData.length + i - 1;
    }
    futureData.push({
      month: label,
      rawMonth,
      累積メリット: null,
      予測累積:     Math.round(lastCum),
      実質負担額:   Math.round(netCost),
      isBreakEven:  false,
    });
  }
  // 実績分にも予測列をnullで
  const chartData = futureData.map((d, i) => ({
    ...d,
    予測累積: i < cumulData.length ? null : d.予測累積,
    isBreakEven: i === breakEvenIndex,
  }));

  // [Phase 5] モンテカルロシミュレーション：オンの時のみ実行する（1000試行×将来月数分の
  // ループはオフ時には不要な負荷になるため）。既存の決定論的予測（monthlyForecastFn・
  // applyWhatIf・futureMaintenanceCost）をそのまま使い、ノイズだけを追加で乗せる。
  // 結果（P10/P50/P90の月次累積値）はchartDataの将来分（末尾FUTURE_MONTHS件）にマージする。
  const montecarloResults = montecarloEnabled
    ? runMonteCarloForecast({
        monthsCount: FUTURE_MONTHS,
        monthlyForecastFn,
        applyWhatIf,
        futureMaintenanceCost,
        startCumulative: cumulative,
        stdDevRatio: montecarloStdDevPct / 100,
        trials: 1000,
      })
    : null;
  if (montecarloResults) {
    const futureStartIdx = chartData.length - FUTURE_MONTHS;
    montecarloResults.forEach((r, i) => {
      const row = chartData[futureStartIdx + i];
      row.予測下限 = Math.round(r.p10);
      // Areaで帯（P10〜P90）を描くため、Rechartsの積み上げ表現に合わせて
      // 「帯の高さ（P90-P10）」をP10の上に積む形で持たせる
      row.予測帯幅 = Math.round(r.p90 - r.p10);
      row.予測中央 = Math.round(r.p50);
    });
  }

  // 損益分岐点のグラフ上のラベル（年表示を間引くため、何年何ヶ月後かを算出）
  const breakEvenLabel = breakEvenIndex != null ? chartData[breakEvenIndex]?.month : null;

  // FIT終了後シナリオ
  const currentYear = new Date().getFullYear();
  const yearsToFitEnd = fitEndYear - currentYear;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <span className="page-title-icon" style={{ background: C.green }}><TabIcon name="target" color="#fff" size={20} /></span>
          回収
        </div>
        <div className="page-subtitle">導入費用の回収進捗と損益分岐点の見通し</div>
      </div>

      {/* 累積メリットグラフ */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">
              累積メリット推移（実績 + {breakEvenLabel ? "損益分岐点まで" : "2年予測"}）
            </span>
          </div>
          <ResponsiveContainer width="100%" height={chartData.length > 8 ? 396 : 340}>
            <ComposedChart data={chartData} margin={{ top: 36, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fill: C.textMuted, fontSize: 9 }}
                axisLine={false} tickLine={false}
                angle={-40} textAnchor="end" height={50}
                interval={Math.floor(chartData.length / 8)} />
              <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `¥${(v / 10000).toFixed(0)}万`} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rawMonth = payload[0]?.payload?.rawMonth;
                const elapsed = rawMonth ? fmt.elapsedSince(installedAt, rawMonth) : null;
                return (
                  <div style={{
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 8, padding: "10px 14px", fontSize: 12
                  }}>
                    <div style={{ color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>
                      {label}
                      {elapsed && <span style={{ marginLeft: 6, fontSize: 10 }}>（導入から{elapsed}）</span>}
                    </div>
                    {payload.filter(p => p.value != null && p.name !== "_予測下限ベース（非表示）").map(p => (
                      <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
                        {p.name}：<span style={{ fontFamily: "JetBrains Mono" }}>{fmt.yen(p.value)}</span>
                      </div>
                    ))}
                  </div>
                );
              }} />
              <Legend wrapperStyle={{ fontSize: 12, color: C.textSecondary }} />
              {/* [Phase 5] モンテカルロのファンチャート（P10〜P90帯）。オンの時のみ表示。
                  Rechartsで「下限から上限までの帯」を描くには、(1) 透明な土台としてP10までを積み、
                  (2) その上にP90-P10の高さを積む、という2段のstacked Areaにするのが定番の方法。
                  土台のAreaはtooltip/legendに出さない（凡例が無意味な数値になるため）。 */}
              {montecarloEnabled && (
                <Area type="monotone" dataKey="予測下限" stackId="mc"
                  stroke="none" fill="transparent" name="_予測下限ベース（非表示）"
                  legendType="none" tooltipType="none" isAnimationActive={false} />
              )}
              {montecarloEnabled && (
                <Area type="monotone" dataKey="予測帯幅" stackId="mc"
                  stroke="none" fill={C.sun} fillOpacity={0.18}
                  name="予測の不確実性（P10〜P90）" isAnimationActive={false} />
              )}
              {montecarloEnabled && (
                <Line type="monotone" dataKey="予測中央"
                  stroke={C.sun} strokeWidth={1.5} strokeOpacity={0.6} strokeDasharray="2 2"
                  dot={false} name="予測中央値（P50）" isAnimationActive={false} />
              )}
              {/* 損益分岐線 */}
              <Line type="monotone" dataKey="実質負担額"
                stroke={C.red} strokeWidth={1.5} strokeDasharray="6 3"
                dot={false} name="実質負担額（目標）" />
              <Line type="monotone" dataKey="累積メリット"
                stroke={C.green} strokeWidth={2.5} dot={false} name="累積メリット（実績）" />
              <Line type="monotone" dataKey="予測累積"
                stroke={C.sun} strokeWidth={2} strokeDasharray="4 4"
                dot={false} name="予測累積メリット" />
              {breakEvenLabel && (
                <ReferenceLine x={breakEvenLabel} stroke={C.green} strokeWidth={1.5}
                  label={(props) => {
                    const { viewBox } = props;
                    const x = viewBox?.x ?? 0;
                    const y = (viewBox?.y ?? 0) + 2;
                    const text = "損益分岐点";
                    const boxWidth = text.length * 11 + 14;
                    // ラベルがグラフ右端を超えないよう、左寄せ/右寄せを自動調整
                    const chartWidth = viewBox?.width ?? 0;
                    const goLeft = x + boxWidth > chartWidth;
                    const rectX = goLeft ? x - boxWidth - 4 : x + 4;
                    return (
                      <g>
                        <rect x={rectX} y={y} width={boxWidth} height={20} rx={4}
                          fill={C.greenDim} stroke={C.green} strokeWidth={1} />
                        <text x={rectX + boxWidth / 2} y={y + 14} textAnchor="middle"
                          fill={C.green} fontSize={11} fontWeight={700}>
                          {text}
                        </text>
                      </g>
                    );
                  }} />
              )}
              {/* [Phase 4] 設計書の「ピンチでグラフ拡大」をRechartsのBrushで実現。
                  Rechartsは複数指のピンチジェスチャーを検出できないため、設計書自体が
                  代替手段として指示しているBrush（下部のドラッグ可能な範囲選択バー）を採用する。
                  指1本のドラッグで範囲を絞り込めるため、iPadのタッチ操作でも問題なく使える。
                  データ点が少ない場合はズームする意味が薄く、UIが余計に縦長になるだけなので
                  9ヶ月以上ある場合のみ表示する。 */}
              {chartData.length > 8 && (
                <Brush dataKey="month" height={28} stroke={C.sun} fill={C.panel}
                  travellerWidth={10}
                  tickFormatter={() => ""} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 4 }}>
            {breakEvenLabel
              ? `緑の縦線（${breakEvenLabel}頃）が、累積メリットが導入費用に到達する損益分岐点です`
              : "赤破線（実質負担額）と緑線（累積メリット）が交差した時点が損益分岐点（回収完了）"}
            {chartData.length > 8 && "　／　グラフ下部のバーをドラッグすると期間を絞り込めます"}
          </div>
        </div>
      )}

      {/* 月別／年別メリット内訳 */}
      {monthlyBenefits.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">
              {benefitBreakdownGranularity === "yearly" ? "年別メリット内訳" : "月別メリット内訳"}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className={`btn btn-sm ${benefitBreakdownGranularity === "monthly" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setBenefitBreakdownGranularity("monthly")}
              >月別</button>
              <button
                className={`btn btn-sm ${benefitBreakdownGranularity === "yearly" ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setBenefitBreakdownGranularity("yearly")}
              >年別</button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={
              benefitBreakdownGranularity === "yearly"
                ? yearlyBenefits.map(y => ({
                    label: `${y.year}年`,
                    売電収入: Math.round(y.sellIncome),
                    節電効果: Math.round(y.savingEst),
                  }))
                : monthlyBenefits.map(m => ({
                    label: fmt.monthAxis(m.month),
                    売電収入: Math.round(m.sellIncome),
                    節電効果: Math.round(m.savingEst),
                  }))
            }>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} axisLine={false} tickLine={false}
                angle={benefitBreakdownGranularity === "yearly" ? 0 : -40}
                textAnchor={benefitBreakdownGranularity === "yearly" ? "middle" : "end"}
                height={50} interval="preserveStartEnd" />
              <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => `¥${(v/1000).toFixed(0)}k`} />
              <Tooltip content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
                return (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
                    <div style={{ color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
                    {payload.map(p => (
                      <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
                        {p.name}：<span style={{ fontFamily: "JetBrains Mono" }}>{fmt.yen(p.value)}</span>
                      </div>
                    ))}
                    <div style={{ color: C.textPrimary, marginTop: 4, fontWeight: 600 }}>
                      合計：<span style={{ fontFamily: "JetBrains Mono" }}>{fmt.yen(total)}</span>
                    </div>
                  </div>
                );
              }} />
              <Legend wrapperStyle={{ fontSize: 12, color: C.textSecondary }} />
              <Bar dataKey="売電収入" stackId="a" fill={C.sun}   radius={[0,0,0,0]} name="売電収入" />
              <Bar dataKey="節電効果" stackId="a" fill={C.green} radius={[4,4,0,0]} name="節約効果" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 4 }}>
            売電収入＋節約効果の合計は、各月の月次メリットと一致します
          </div>
        </div>
      )}

      {/* KPIカード */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">回収進捗</div>
          <div className="kpi-value" style={{ color: C.green }}>{recoveryPct.toFixed(1)}<span className="kpi-unit">%</span></div>
          <div className="progress-track">
            <div className="progress-fill"
              style={{ width: `${recoveryPct}%`, background: C.green }} />
          </div>
          <div className="kpi-sub">{fmt.yen(Math.round(recovered))} 回収済み</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">残り回収額</div>
          <div className="kpi-value"
            style={{ fontSize: remaining > 999999 ? 20 : 22 }}>
            {Math.round(remaining / 10000)}<span className="kpi-unit">万円</span>
          </div>
          <div className="kpi-sub">実質負担額 {fmt.yen(netCost)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">月平均メリット（直近）</div>
          <div className="kpi-value">{Math.round(avgMonthlyBenefit / 100) * 100 === 0
            ? "—" : Math.round(avgMonthlyBenefit).toLocaleString()}
            <span className="kpi-unit">円</span>
          </div>
          <div className="kpi-sub">直近{recentMonths.length}ヶ月の平均</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">
            回収完了見込み
            {whatIfActive && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.sun,
                background: "rgba(255,159,10,0.15)", borderRadius: 4, padding: "1px 6px"
              }}>What-If</span>
            )}
          </div>
          <div className="kpi-value" style={{ fontSize: 18, paddingTop: 4 }}>
            {recoveryDate ?? (monthlyBenefits.length === 0 ? "実績待ち" : "計算中")}
          </div>
          {recoveryMonthsLeft && (
            <div className="kpi-sub">あと約 {recoveryMonthsLeft} ヶ月</div>
          )}
        </div>
      </div>

      {/* [Phase 5] 予測モード切替：季節調整 ⇄ 保守的推定（直近12ヶ月単純平均）。
          季節性を判断できるデータ量（実績4ヶ月未満）の場合は季節調整ボタンを無効化し、
          理由をヒントとして表示する。 */}
      <div className="card" style={{ marginBottom: 16, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 12, color: C.textMuted, fontWeight: 600 }}>将来予測の方式</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              className={`btn btn-sm ${forecastMode === "seasonal" ? "btn-primary" : "btn-secondary"}`}
              disabled={!seasonal.seasonalityAvailable}
              onClick={() => setForecastMode("seasonal")}
              title={!seasonal.seasonalityAvailable ? "季節性を判断するには実績が最低4ヶ月分必要です" : undefined}
            >季節調整</button>
            <button
              className={`btn btn-sm ${forecastMode === "conservative" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setForecastMode("conservative")}
            >保守的推定</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
          {effectiveForecastMode === "seasonal"
            ? "夏は発電が多く冬は少ない、といった季節パターンを実績から算出し将来予測に反映しています。"
            : "直近12ヶ月の月平均メリットを将来も一定として延伸する、従来方式の予測です。"}
          {forecastMode === "seasonal" && !seasonal.seasonalityAvailable &&
            "（実績が4ヶ月未満のため、自動的に保守的推定で表示しています）"}
        </div>
      </div>

      {/* [Phase 5] What-Ifシミュレーション：電気料金変動率・将来のFIT単価を仮に変えてみて、
          回収予測グラフがどう変わるかを見るスライダー。過去の実績は変更せず、
          将来予測部分（このグラフ・残り回収期間・回収予定日）にのみ反映される。 */}
      <Disclosure title="What-Ifシミュレーション（電気料金・FIT単価を仮に変えてみる）" icon="🎛" defaultOpen={whatIfActive}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 600 }}>電気料金の変動</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: electricPriceAdj === 0 ? C.textMuted : (electricPriceAdj > 0 ? C.red : C.green) }}>
                {electricPriceAdj > 0 ? `+${electricPriceAdj}%` : `${electricPriceAdj}%`}
              </span>
            </div>
            <input
              type="range" min={-30} max={30} step={1}
              value={electricPriceAdj}
              onChange={e => setElectricPriceAdj(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              節電効果（自家消費による節約分）に反映されます。値上げなら節約効果も大きくなります。
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 600 }}>将来のFIT/卒FIT単価（円/kWh）</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: fitRateAdj === fitRate ? C.textMuted : (fitRateAdj > fitRate ? C.green : C.red) }}>
                {fitRateAdj}円
              </span>
            </div>
            <input
              type="range" min={0} max={Math.max(20, fitRate * 2)} step={0.5}
              value={fitRateAdj}
              onChange={e => setFitRateAdj(parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              現在の単価: {fitRate}円/kWh。売電収入に反映されます（FIT終了後の卒FIT買取単価の見積りにも使えます）。
            </div>
          </div>

          {whatIfActive && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }}
              onClick={() => { setElectricPriceAdj(0); setFitRateAdj(fitRate); }}>
              リセット（実績どおりの予測に戻す）
            </button>
          )}
        </div>
      </Disclosure>

      {/* [Phase 5] モンテカルロシミュレーション：将来予測に確率的なばらつき（正規分布ノイズ）を
          1000試行加えて、P10〜P90の幅をグラフ上に帯（ファンチャート）として表示する。
          What-If・季節調整/保守的推定・機器交換イベントの効果は全て適用済みの値にノイズを乗せる
          ため、これらと独立した別モードではなく、既存予測に「不確実性の幅」を追加可視化する位置づけ。 */}
      <Disclosure title="モンテカルロシミュレーション（予測の不確実性を幅で見る）" icon="🎲" defaultOpen={montecarloEnabled}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 600 }}>
              ファンチャート表示（P10〜P90の幅）
            </span>
            <button
              className={`btn btn-sm ${montecarloEnabled ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setMontecarloEnabled(v => !v)}
            >{montecarloEnabled ? "オン" : "オフ"}</button>
          </div>

          {montecarloEnabled && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: C.textSecondary, fontWeight: 600 }}>ばらつきの大きさ（標準偏差）</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.textMuted }}>±{montecarloStdDevPct}%</span>
              </div>
              <input
                type="range" min={5} max={30} step={1}
                value={montecarloStdDevPct}
                onChange={e => setMontecarloStdDevPct(parseInt(e.target.value, 10))}
                style={{ width: "100%" }}
              />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
                月次予測値に対し、この比率を標準偏差とする正規分布のばらつきを1,000回試行し、
                各月のP10（下位10%）〜P90（上位10%）の幅をグラフに帯で表示します。
                What-If・季節調整・機器交換イベントの設定は、ばらつきを乗せる前の基準値として
                そのまま反映されます。
              </div>
            </div>
          )}
        </div>
      </Disclosure>

      {/* 投資情報カード（仕様書：回収管理画面） */}
      <div className="list-group" style={{ marginBottom: 16 }}>
        <div className="list-cell no-tap">
          <span className="list-cell-title">初期投資額</span>
          <span className="list-cell-value">{fmt.yen(settings.installCost)}</span>
        </div>
        <div className="list-cell no-tap">
          <span className="list-cell-title">投資開始日</span>
          <span className="list-cell-value">{fmt.month(installedAt)}</span>
        </div>
        <div className="list-cell no-tap">
          <span className="list-cell-title">導入からの経過期間</span>
          <span className="list-cell-value">{fmt.elapsedSince(installedAt) ?? "—"}</span>
        </div>
        <div className="list-cell no-tap">
          <span className="list-cell-title">
            回収予定日
            {whatIfActive && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.sun,
                background: "rgba(255,159,10,0.15)", borderRadius: 4, padding: "1px 6px"
              }}>What-If反映中</span>
            )}
          </span>
          <span className="list-cell-value">{recoveryDate ?? "—"}</span>
        </div>
        <div className="list-cell no-tap">
          <span className="list-cell-title">回収率</span>
          <span className="list-cell-value" style={{ color: C.green }}>{recoveryPct.toFixed(1)}%</span>
        </div>
        <div className="list-cell no-tap">
          <span className="list-cell-title">残り回収額</span>
          <span className="list-cell-value">{fmt.yen(remaining)}</span>
        </div>
        <div className="list-cell no-tap">
          <span className="list-cell-title">残り期間</span>
          <span className="list-cell-value">{remainingPeriodLabel ?? "—"}</span>
        </div>
      </div>

      {/* FIT終了後シナリオ */}
      <Disclosure title={`FIT終了後のシナリオ（終了予定: ${fitEndYear}年・あと約${yearsToFitEnd}年）`} icon="🔋">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            {
              title: "シナリオA: 自家消費シフト",
              color: C.green,
              desc: "FIT終了後は蓄電池を活用して昼間発電分をすべて自家消費。売電収入はなくなるが、買電量が減少することで月2,000〜4,000円程度の節約継続を見込む。",
            },
            {
              title: "シナリオB: 卒FIT買取活用",
              color: C.blue,
              desc: "卒FIT後も新電力等の余剰買取（8〜11円/kWh程度）に切り替えて売電継続。売電単価は下がるが収入はゼロにならない。",
            },
            {
              title: "シナリオC: EV活用",
              color: C.sun,
              desc: "EVを導入し、余剰電力を充電（V2H）。実質的な燃料費削減として経済メリットを継続。EVの導入タイミングと組み合わせると効果的。",
            },
          ].map(s => (
            <div key={s.title} style={{
              background: C.surface, borderRadius: 10, padding: 14,
              borderLeft: `3px solid ${s.color}`
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: s.color, marginBottom: 6 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.7 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Disclosure>

      {records.length === 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">実績データを入力するとグラフが表示されます</div>
            <div className="empty-desc">「実績」タブから月次データを入力してください</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Step 5: 経済効果シミュレーション画面
// ─────────────────────────────────────────────

// 月次比較計算ロジック（単価履歴対応・月ごとに適切な単価を自動選択）
// ─────────────────────────────────────────────
// 月次比較計算ロジック
//
// 3種類の「電気代」を並べて導入効果を多角的に見せる：
//
//   A) 現在の実電気代（実績値優先）
//      = 実際に支払った電気代（出光でんきの検針票の金額）
//      ※ electricBill があればそれを使う
//
//   B) 太陽光・蓄電池なし＆北陸電力継続だった場合の推定電気代（導入効果の本質）
//      = 総消費量をすべて買電していた場合の電気代
//      = 基本料金(2,255円) + 総消費量 × 夜間単価 × (大半が夜間という実績に基づく仮定)
//      ※ 導入しなかった場合と比べることで「年間いくら得しているか」が明確になる
//
//   C) 実質コスト（現在の実電気代 - 売電収入）
//      = 売電で相殺した後の実質的な支出
//
//   月次メリット = B(導入なし推定) - C(実質コスト)
//              = （導入なし電気代）-（現電気代）+（売電収入）
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 月次比較計算ロジック
//
//   A) 現在の実電気代（実績値優先）= 実際に支払った電気代
//
//   B) 太陽光・蓄電池なし＆北陸電力継続だった場合の推定電気代
//      = 基本料金 + 総消費量を「夜間比率」で昼夜に分配し、それぞれの単価を適用
//      ※ 夜間比率は実測CSV（2025年1〜6月）から判明した月別の値を使用。
//        蓄電池がない場合は夜間の安い時間帯にまとめて使う生活パターン自体が成立しないため、
//        実際の夜間比率をそのまま使うのは厳密には保守的（やや高めに出る）が、
//        生活パターン自体は変わらない前提として、実測比率を採用する。
//      ※ CSV分析（calcCompareePlanFromCSV）がある月は、そちらの精密値を優先採用する（呼び出し側で統合）。
//
//   C) 実質コスト = 現在の実電気代 - 売電収入（0未満にはならない）
//
//   月次メリット = B(導入なし推定) - C(実質コスト)
// ─────────────────────────────────────────────
// [Phase 5] 季節調整付き予測（設計書 seasonalForecast.ts 相当）。
// アルゴリズム：
//   1) 実績の月次メリット(benefit)を「カレンダー月（1〜12）」ごとにグルーピングし、月平均を算出する。
//      （例：すべての「8月」の実績を集めて平均する。年をまたいでも同じ月として扱う）
//   2) その月平均12個を合計した「年間合計の推定値」を求め、各カレンダー月が年間のうち
//      何%を占めるか（構成比 ratio[m]）を算出する。
//   3) 将来の各月について、「年間合計の見積り（年間平均×12、あるいは直近12ヶ月合計）」に
//      その月の構成比を掛けることで、季節性を反映した予測値にする。
// 既存の「直近12ヶ月単純平均を将来全部に同じ値で延伸する」方式に対し、こちらは
// 「夏は発電が多く冬は少ない」といった季節パターンをそのまま将来へ引き継げる。
//
// データが少ない（実測のあるカレンダー月が限られる）場合の扱い：
// 12ヶ月分のデータが揃っていない場合、構成比が算出できないカレンダー月が生じる。
// その場合は「実績がある月の平均構成比」で代用する（極端な値で予測が破綻しないようにする）。
function calcSeasonalForecast(monthlyBenefits, futureMonthCount) {
  // 1) カレンダー月ごとに実績benefitを集める
  const byCalMonth = new Map(); // 1..12 → [benefit, benefit, ...]
  monthlyBenefits.forEach(m => {
    const calMonth = parseInt(m.month.split("-")[1], 10);
    if (!byCalMonth.has(calMonth)) byCalMonth.set(calMonth, []);
    byCalMonth.get(calMonth).push(m.benefit);
  });

  const monthAvg = {}; // 1..12 → 平均benefit（実績があるカレンダー月のみ）
  for (const [calMonth, arr] of byCalMonth) {
    monthAvg[calMonth] = arr.reduce((s, x) => s + x, 0) / arr.length;
  }

  const monthsWithData = Object.keys(monthAvg).length;
  if (monthsWithData === 0) {
    // 実績が全くない場合は構成比を計算できないため、全月フラットな予測を返す
    return { ratio: {}, monthAvg: {}, seasonalityAvailable: false, annualAvg: 0 };
  }

  // 2) 年間合計の見積り（実績がある月の平均値を、データがないカレンダー月にも適用して12ヶ月分を補完する）
  const fallbackAvg = Object.values(monthAvg).reduce((s, x) => s + x, 0) / monthsWithData;
  let annualTotal = 0;
  const ratio = {};
  for (let calMonth = 1; calMonth <= 12; calMonth++) {
    annualTotal += monthAvg[calMonth] ?? fallbackAvg;
  }
  for (let calMonth = 1; calMonth <= 12; calMonth++) {
    const v = monthAvg[calMonth] ?? fallbackAvg;
    ratio[calMonth] = annualTotal > 0 ? v / annualTotal : 1 / 12;
  }

  // 季節性が判断できるのは、最低でも数カレンダー月の実績がある場合のみ
  // （1〜2ヶ月分のデータで「これが年間パターンだ」と判断するのは過信になるため、
  //   4ヶ月未満の場合は季節調整を採用せず、呼び出し側でフラットな予測にフォールバックさせる）
  const seasonalityAvailable = monthsWithData >= 4;

  return { ratio, monthAvg, seasonalityAvailable, annualAvg: annualTotal / 12 };
}

// [Phase 5] 機器交換イベント（パワコン交換・将来の蓄電池交換等）による、
// 「ちょうどその月に発生する」費用合計を算出する。
// 設計：機器種別を問わない汎用イベント形式（settings.maintenanceEvents配列）とし、
// 各イベントは { id, label, month("YYYY-MM"), cost } を持つ。
// 呼び出し側（実績側のcumulDataループ・将来予測側のfutureDataループ）は、
// 月を1つずつ進めるたびにこの関数を呼び、累積メリットから返り値を引くだけでよい。
// 同じ月に複数件登録されていた場合は合計して一括減算する。
function calcMaintenanceDeduction(events, targetMonth) {
  if (!events || events.length === 0) return 0;
  return events
    .filter(e => e.month === targetMonth)
    .reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
}

// [Phase 5] モンテカルロシミュレーション：将来予測の月次メリットに正規分布のノイズを
// 加えて複数試行（既定1000回）し、各月のP10/P50/P90を返す。
//
// 設計：
// - ノイズを加える対象は monthlyForecastFn(i) が返す「その月の基準予測値（季節調整/保守的推定）」
//   そのもの。その後に applyWhatIf（What-Ifスライダー）・futureMaintenanceCost（機器交換イベント）
//   を既存のロジックと完全に同じ順序・同じ関数で適用する。これにより、モンテカルロは
//   「既存の決定論的予測に確率的なばらつきを追加で乗せる」という位置づけになり、
//   What-If・季節調整・保守的推定・機器交換イベントのロジックを一切複製・改変しない。
// - ノイズは Box-Muller法で生成した標準正規分布の乱数 × (baseValue × stdDevRatio) を
//   baseValue に加算する形（加算的・乗算的の中間：標準偏差が予測値に比例して大きくなる）。
//   月によって基準値の大小が異なる（季節調整時など）ため、絶対額固定ではなく比率指定とする。
// - 累積値（各月までの積み上げ合計）に対してP10/P50/P90を取る。単月ごとの増分ではなく
//   「その月時点での累積メリット」のばらつきを見るほうが、回収進捗の不確実性として直感的。
function boxMullerRandom() {
  // 標準正規分布 N(0, 1) の乱数を1つ生成する
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function runMonteCarloForecast({
  monthsCount,        // 将来何ヶ月分シミュレーションするか
  monthlyForecastFn,  // (monthsFromNow) => 基準予測値（季節調整/保守的推定、ノイズ加算前）
  applyWhatIf,         // (baseBenefit) => What-Ifスライダー適用後の値
  futureMaintenanceCost, // (monthsFromNow) => その月の機器交換費用
  startCumulative,     // シミュレーション開始時点（現在）の累積メリット
  stdDevRatio,         // 標準偏差の比率（例：0.15 = 基準値の±15%相当を1σとする）
  trials = 1000,
}) {
  // 月ごとの累積値を全試行分集めるための配列（[monthIndex][trialIndex]）
  const cumulativesByMonth = Array.from({ length: monthsCount }, () => new Array(trials));

  for (let t = 0; t < trials; t++) {
    let cum = startCumulative;
    for (let i = 1; i <= monthsCount; i++) {
      const base = monthlyForecastFn(i);
      // 基準値にノイズを乗せた「その月のブレ込み予測値」を作り、既存のWhat-If適用関数に通す。
      // base が0または負の場合（メリットがほぼ無い月）は標準偏差も0に近くなり、不自然な
      // 大きなブレが出ないようにする（比率ベースなので自動的にそうなる）。
      const noisy = base + boxMullerRandom() * Math.abs(base) * stdDevRatio;
      cum += applyWhatIf(noisy);
      cum -= futureMaintenanceCost(i);
      cumulativesByMonth[i - 1][t] = cum;
    }
  }

  // 各月ごとにソートしてP10/P50/P90を取り出す
  const percentile = (sortedArr, p) => {
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(p * sortedArr.length)));
    return sortedArr[idx];
  };

  return cumulativesByMonth.map(monthValues => {
    const sorted = [...monthValues].sort((a, b) => a - b);
    return {
      p10: percentile(sorted, 0.10),
      p50: percentile(sorted, 0.50),
      p90: percentile(sorted, 0.90),
    };
  });
}

function calcMonthlyComparison(records, tariffCurrentHistory, tariffCompareHistory, settings, addonHistory, csvAnalysis) {
  const fitRate    = settings.fitRate ?? 8;
  const evDiscount = settings.evDiscount ?? 200;

  // CSV分析結果から月→精密値のマップを作成（CSVがある場合のみ）
  const csvComparePlan = csvAnalysis ? calcCompareePlanFromCSV(csvAnalysis, tariffCompareHistory, records, addonHistory) : [];
  const csvByMonth = {};
  csvComparePlan.forEach(c => { csvByMonth[c.month] = c; });

  return [...records].sort((a, b) => a.month.localeCompare(b.month)).map(r => {
    const tariffCurrentBase = findApplicableTariff(tariffCurrentHistory, r.month) ?? tariffCurrentHistory[0];
    const tariffCompareBase = findApplicableTariff(tariffCompareHistory, r.month) ?? tariffCompareHistory[0];
    const tariffCurrent = tariffCurrentBase.linkedToCompare
      ? deriveCurrentTariffFromCompare(tariffCompareBase, evDiscount)
      : tariffCurrentBase;

    // 月別の燃料調整費・再エネ賦課金を実績値で取得
    const addon    = findApplicableAddon(addonHistory, r.month);
    const addOnVal = (addon.levy ?? 0) + (addon.fuel ?? 0);

    const nightRateCur = tariffCurrent.tiers.find(t => t.label.includes("夜間"))?.rate ?? 26.98;
    const effRateCur    = nightRateCur + addOnVal; // 実効夜間単価（現契約・燃料調整・賦課金込み）

    const consumed = r.consumed ?? 0;
    const selfUse   = Math.max(0, (r.generated ?? 0) - (r.sold ?? 0));
    const { value: sellIncome, isActual: sellIsActual } = getSellIncome(r, fitRate);

    // A) 現在の実電気代
    let actualBill;
    if (r.electricBill != null) {
      actualBill = r.electricBill;
    } else if (r.boughtKwh != null) {
      actualBill = tariffCurrent.basicFee + r.boughtKwh * effRateCur;
    } else {
      actualBill = tariffCurrent.basicFee + Math.max(0, consumed - selfUse) * effRateCur;
    }

    // B) 太陽光・蓄電池なし＆北陸電力継続だった場合
    //    CSV実測データがある月はそちらを精密値として優先採用し、なければ
    //    総消費量を「夏季昼間／その他季昼間／ウィークエンド／夜間」の4区分比率で分配した簡易推定を使う
    //    （北陸電力の正式な時間帯定義に基づく）
    const csvC = csvByMonth[r.month];
    const findRate = (keyword) => tariffCompareBase.tiers.find(t => t.label.includes(keyword))?.rate;
    const rateSummerComp  = (findRate("夏季") ?? 39.87) + addOnVal;
    const rateOtherComp   = (findRate("その他季") ?? 39.87) + addOnVal;
    const rateWeekendComp = (findRate("ウィークエンド") ?? 33.80) + addOnVal;
    const rateNightComp   = (findRate("夜間") ?? 26.98) + addOnVal;

    const ratio = getSeasonalUsageRatio(r.month);
    const summerKwh  = consumed * ratio.summer;
    const otherKwh   = consumed * ratio.other;
    const weekendKwh = consumed * ratio.weekend;
    const nightKwh   = consumed * ratio.night;

    const noSolarBillEstimated = tariffCompareBase.basicFee
      + summerKwh  * rateSummerComp
      + otherKwh   * rateOtherComp
      + weekendKwh * rateWeekendComp
      + nightKwh   * rateNightComp;

    const noSolarBill = csvC ? csvC.billTotal : noSolarBillEstimated;
    const csvBased = !!csvC;

    // C) 実質コスト = 現電気代 - 売電収入
    //    売電収入が電気代を上回る場合はマイナス（＝その月は電気代を払うどころか手元に現金が残る）になり得る。
    //    これを0円で打ち切ると、その分のメリットが計算から消えてしまうため、マイナスのまま扱う。
    const netBill = Math.max(0, actualBill) - sellIncome;

    // 月次メリット = 導入なし推定 - 実質コスト
    //   実質コストがマイナスの月は、そのマイナス分がそのまま月次メリットに加算される
    const monthlyBenefit = noSolarBill - netBill;

    // 節電効果の内訳（自家消費した分だけ買電しなかった、現契約の実効単価ベース）
    const savingEst = selfUse * Math.max(0, effRateCur);

    return {
      month:              r.month,
      label:              fmt.monthAxis(r.month),
      現在の電気代:       Math.round(Math.max(0, actualBill)),
      導入なし推定電気代: Math.round(Math.max(0, noSolarBill)),
      実質コスト:         Math.round(netBill),
      売電収入:           Math.round(sellIncome),
      売電収入実績:       sellIsActual,
      節電効果:           Math.round(savingEst),
      月次メリット:       Math.round(monthlyBenefit),
      発電量:             r.generated ?? 0,
      自家消費:           selfUse,
      総消費:             consumed,
      買電量精密:         r.boughtKwh != null,
      csvBased,
      夜間比率:           ratio.night,
      // 「導入なし推定」の内訳（タップ詳細表示用）
      // CSV精密値がある月は4区分の実測ベース内訳(noSolarBreakdown4)を、ない月は簡易推定内訳(noSolarBreakdown)を持つ
      noSolarBreakdown: csvC ? null : {
        basicFee:    tariffCompareBase.basicFee,
        summerKwh:   Math.round(summerKwh  * 10) / 10,
        otherKwh:    Math.round(otherKwh   * 10) / 10,
        weekendKwh:  Math.round(weekendKwh * 10) / 10,
        nightKwh:    Math.round(nightKwh   * 10) / 10,
        summerRate:  Math.round(rateSummerComp  * 100) / 100,
        otherRate:   Math.round(rateOtherComp   * 100) / 100,
        weekendRate: Math.round(rateWeekendComp * 100) / 100,
        nightRate:   Math.round(rateNightComp   * 100) / 100,
        summerCost:  Math.round(summerKwh  * rateSummerComp),
        otherCost:   Math.round(otherKwh   * rateOtherComp),
        weekendCost: Math.round(weekendKwh * rateWeekendComp),
        nightCost:   Math.round(nightKwh   * rateNightComp),
        ratioPct: {
          summer:  Math.round(ratio.summer  * 1000) / 10,
          other:   Math.round(ratio.other   * 1000) / 10,
          weekend: Math.round(ratio.weekend * 1000) / 10,
          night:   Math.round(ratio.night   * 1000) / 10,
        },
      },
      noSolarBreakdown4: csvC ? csvC.breakdown4 : null,
      effRate: effRateCur,
    };
  });
}

// (PIE_COLORSは分析タブ再構成により未使用のため削除)

function SimulationScreen({ records, tariffCurrentHistory, tariffCompareHistory, settings, csvAnalysis, setCsvAnalysis, addonHistory, monthlyComparison }) {
  const [analysisTab, setAnalysisTab] = useState("efficiency"); // efficiency | seasonal | yearly
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState(null);
  const [breakdownMonth, setBreakdownMonth] = useState(null); // タップで内訳表示する月
  const [monthDetailOpen, setMonthDetailOpen] = useState(false); // 月次リストの展開状態
  const [showBreakdownModal, setShowBreakdownModal] = useState(false); // 時間帯別内訳モーダルの表示
  const fileInputRef = useRef(null);

  // 経済メリットの計算は App から渡される monthlyComparison（calcMonthlyComparisonの結果）を使う。
  // CSV分析結果もApp側のcalcMonthlyComparison呼び出し時に統合済みなので、ここで再計算はしない。
  // ダッシュボード・回収管理と完全に同じ値を使うことで、画面間の不一致を防ぐ。
  const monthly = monthlyComparison;
  const monthlyMerged = monthly; // 互換性のため別名を維持（テーブル・グラフ表示で使用）

  // CSVアップロード済みの月数（案内表示用）
  const csvAnalyzedMonthCount = monthlyMerged.filter(m => m.csvBased).length;

  const totalSellIncome   = monthlyMerged.reduce((s, m) => s + m.売電収入, 0);
  const totalBenefit      = monthlyMerged.reduce((s, m) => s + m.月次メリット, 0);
  const totalNoSolarBill  = monthlyMerged.reduce((s, m) => s + m.導入なし推定電気代, 0);
  const totalNetCost      = monthlyMerged.reduce((s, m) => s + m.実質コスト, 0);

  // [分析タブ再構成] 自家消費率・自給率の月次トレンド。
  // 自家消費率 = 自家消費量 ÷ 発電量　…発電したうちどれだけ自分で使ったか（売電 vs 自家消費の選択傾向）
  // 自給率　　 = 自家消費量 ÷ 総消費量　…消費した電力のうちどれだけを自前（太陽光）で賄えたか
  //            （蓄電池・EVを含めた電力自給の実態を表す指標。100%に近いほど買電依存が低い）
  const efficiencyTrend = monthlyMerged.map(m => ({
    label: m.label,
    month: m.month,
    自家消費率: m.発電量 > 0 ? Math.round((m.自家消費 / m.発電量) * 1000) / 10 : 0,
    自給率:     m.総消費 > 0 ? Math.round((m.自家消費 / m.総消費) * 1000) / 10 : 0,
  }));
  const avgSelfConsumptionRate = efficiencyTrend.length > 0
    ? efficiencyTrend.reduce((s, m) => s + m.自家消費率, 0) / efficiencyTrend.length
    : 0;
  const avgSelfSufficiencyRate = efficiencyTrend.length > 0
    ? efficiencyTrend.reduce((s, m) => s + m.自給率, 0) / efficiencyTrend.length
    : 0;

  // [分析タブ再構成] 年次サマリー（発電量・消費量・メリット額を年単位で集計）。
  // 経年での性能変化・使用量変化を一覧できるようにする。
  const annualSummary = (() => {
    const byYear = {};
    monthlyMerged.forEach(m => {
      const year = m.month.slice(0, 4);
      if (!byYear[year]) byYear[year] = {
        year, 発電量: 0, 総消費: 0, 自家消費: 0,
        売電収入: 0, 節電効果: 0, 月次メリット: 0, months: 0
      };
      byYear[year].発電量    += m.発電量;
      byYear[year].総消費    += m.総消費;
      byYear[year].自家消費  += m.自家消費;
      byYear[year].売電収入  += m.売電収入;
      byYear[year].節電効果  += m.節電効果;
      byYear[year].月次メリット += m.月次メリット;
      byYear[year].months++;
    });
    return Object.values(byYear).sort((a, b) => a.year.localeCompare(b.year));
  })();

  // [分析タブ再構成] 発電量・消費量の月次パターン（季節性の可視化）。
  // calcSeasonalForecastが使っているのと同じ「カレンダー月（1〜12月）ごとの平均」の考え方を
  // 発電量・総消費量にも適用し、季節パターンを折れ線で見られるようにする。
  const seasonalPattern = (() => {
    const byCalMonth = {}; // "01"〜"12" → { genSum, consSum, count }
    monthlyMerged.forEach(m => {
      const calMonth = m.month.slice(5, 7);
      if (!byCalMonth[calMonth]) byCalMonth[calMonth] = { genSum: 0, consSum: 0, count: 0 };
      byCalMonth[calMonth].genSum  += m.発電量;
      byCalMonth[calMonth].consSum += m.総消費;
      byCalMonth[calMonth].count++;
    });
    return Array.from({ length: 12 }, (_, i) => {
      const calMonth = String(i + 1).padStart(2, "0");
      const entry = byCalMonth[calMonth];
      return {
        label: `${i + 1}月`,
        発電量平均: entry ? Math.round((entry.genSum  / entry.count) * 10) / 10 : null,
        消費量平均: entry ? Math.round((entry.consSum / entry.count) * 10) / 10 : null,
      };
    }).filter(d => d.発電量平均 !== null || d.消費量平均 !== null);
  })();

  // ── CSVアップロード処理 ──
  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvUploading(true);
    setCsvError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        // Shift-JIS/CP932で書かれていることが多いため、まずUTF-8として軽く検証し、
        // 文字化けが疑われる場合はShift-JISとして再デコードする
        const buffer = ev.target.result;
        let text;
        try {
          const decoderUtf8 = new TextDecoder("utf-8", { fatal: true });
          text = decoderUtf8.decode(buffer);
        } catch {
          text = null;
        }
        if (!text || !text.includes("年月日")) {
          const decoderSjis = new TextDecoder("shift-jis");
          text = decoderSjis.decode(buffer);
        }
        const result = parseHokurikuCSV(text);
        result.fileName = file.name;
        setCsvAnalysis(result);
        toast(`CSVを解析しました（${result.totalDays}日分・${result.months.length}ヶ月）`, "success");
      } catch (err) {
        setCsvError(err.message || "CSVの解析に失敗しました");
        toast("CSVの解析に失敗しました", "error");
      } finally {
        setCsvUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      setCsvError("ファイルの読み込みに失敗しました");
      setCsvUploading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  // [Phase 4] 確認モーダル→Undo Snackbar方式に統一。
  const handleClearCsv = () => {
    const prevCsvAnalysis = csvAnalysis;
    if (!prevCsvAnalysis) return;
    setCsvAnalysis(null);
    undoToast("CSV分析データを削除しました", () => setCsvAnalysis(prevCsvAnalysis));
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <span className="page-title-icon" style={{ background: "#AF52DE" }}><TabIcon name="chart.bar" color="#fff" size={20} /></span>
          分析
        </div>
        <div className="page-subtitle">累積メリット推移と導入効果を分析します</div>
      </div>


      {/* サマリーKPI */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">累計 経済メリット</div>
          <div className="kpi-value" style={{ color: C.green, fontSize: totalBenefit > 999999 ? 20 : 22 }}>
            {Math.round(totalBenefit / 10000)}<span className="kpi-unit">万円</span>
          </div>
          <div className="kpi-sub">導入なし場合との差額（売電＋節電）</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">累計 売電収入</div>
          <div className="kpi-value" style={{ color: C.sun }}>{Math.round(totalSellIncome / 10000)}<span className="kpi-unit">万円</span></div>
          <div className="kpi-sub">実績振込額を優先集計</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">累計 実質コスト</div>
          <div className="kpi-value">{Math.round(totalNetCost / 10000)}<span className="kpi-unit">万円</span></div>
          <div className="kpi-sub">電気代合計 - 売電収入</div>
        </div>
      </div>

      {/* [分析タブ再構成] システムの稼働効率・季節パターンに焦点を当てた分析グラフ。
          投資回収の進捗（金額ベース）は「回収」タブが担うため、ここでは
          「太陽光・蓄電池・EVがどれだけ効率的に使われているか」を中心に見せる。 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ flexWrap: "wrap", gap: 8 }}>
          <span className="card-title">システム効率分析</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[
              ["efficiency", "自家消費率・自給率"],
              ["seasonal",   "季節パターン"],
              ["yearly",     "年次サマリー"],
            ].map(([k, label]) => (
              <button key={k}
                className={`btn btn-sm ${analysisTab === k ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setAnalysisTab(k)}>{label}</button>
            ))}
          </div>
        </div>

        {/* ① 自家消費率・自給率の月次トレンド */}
        {analysisTab === "efficiency" && efficiencyTrend.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 16, marginBottom: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 11, color: C.textMuted }}>
                平均自家消費率：<strong style={{ color: C.sun, fontFamily: "JetBrains Mono" }}>{avgSelfConsumptionRate.toFixed(1)}%</strong>
              </div>
              <div style={{ fontSize: 11, color: C.textMuted }}>
                平均自給率：<strong style={{ color: C.green, fontFamily: "JetBrains Mono" }}>{avgSelfSufficiencyRate.toFixed(1)}%</strong>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={efficiencyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 9 }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" height={50} interval="preserveStartEnd" />
                <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false}
                  unit="%" domain={[0, 100]} />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
                      {payload.map(p => (
                        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
                          {p.name}：<span style={{ fontFamily: "JetBrains Mono" }}>{p.value.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 12, color: C.textSecondary }} />
                <Line type="monotone" dataKey="自家消費率" stroke={C.sun}   strokeWidth={2} dot={{ r: 2 }} name="自家消費率（発電量のうち自家消費した割合）" />
                <Line type="monotone" dataKey="自給率"     stroke={C.green} strokeWidth={2} dot={{ r: 2 }} name="自給率（総消費量のうち太陽光で賄った割合）" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 4 }}>
              自家消費率が高いほど発電を売電せず自分で使っている、自給率が高いほど買電への依存が低いことを示します
            </div>
          </>
        )}
        {analysisTab === "efficiency" && efficiencyTrend.length === 0 && (
          <div className="empty-state" style={{ padding: "30px 0" }}>
            <div className="empty-desc">実績データがまだありません</div>
          </div>
        )}

        {/* ② 発電量・消費量の季節パターン（カレンダー月ごとの平均） */}
        {analysisTab === "seasonal" && seasonalPattern.length >= 3 && (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={seasonalPattern}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: C.textMuted, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} unit=" kWh" />
                <Tooltip content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
                      <div style={{ color: C.textMuted, marginBottom: 6, fontWeight: 600 }}>{label}</div>
                      {payload.map(p => (
                        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
                          {p.name}：<span style={{ fontFamily: "JetBrains Mono" }}>{p.value?.toFixed(1)} kWh</span>
                        </div>
                      ))}
                    </div>
                  );
                }} />
                <Legend wrapperStyle={{ fontSize: 12, color: C.textSecondary }} />
                <Line type="monotone" dataKey="発電量平均" stroke={C.sun}  strokeWidth={2} dot={{ r: 3 }} name="発電量（月平均）" connectNulls />
                <Line type="monotone" dataKey="消費量平均" stroke={C.blue} strokeWidth={2} dot={{ r: 3 }} name="総消費量（月平均）" connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 11, color: C.textMuted, textAlign: "center", marginTop: 4 }}>
              実績が複数年ある月は平均値です。発電と消費のギャップが大きい月ほど、売電または買電の量が増えます
            </div>
          </>
        )}
        {analysisTab === "seasonal" && seasonalPattern.length < 3 && (
          <div className="empty-state" style={{ padding: "30px 0" }}>
            <div className="empty-desc">季節パターンの表示には3ヶ月以上の実績データが必要です</div>
          </div>
        )}

        {/* ③ 年次サマリー（発電量・消費量・メリット額を年単位で一覧） */}
        {analysisTab === "yearly" && annualSummary.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>年</th>
                  <th style={{ textAlign: "right" }}>発電量</th>
                  <th style={{ textAlign: "right" }}>総消費量</th>
                  <th style={{ textAlign: "right" }}>自家消費率</th>
                  <th style={{ textAlign: "right" }}>月次メリット合計</th>
                </tr>
              </thead>
              <tbody>
                {annualSummary.map(y => (
                  <tr key={y.year}>
                    <td style={{ color: C.textPrimary, fontWeight: 600 }}>{y.year}年（{y.months}ヶ月分）</td>
                    <td className="num">{y.発電量.toFixed(0)} kWh</td>
                    <td className="num">{y.総消費.toFixed(0)} kWh</td>
                    <td className="num">{y.発電量 > 0 ? ((y.自家消費 / y.発電量) * 100).toFixed(1) : "—"}%</td>
                    <td className="num" style={{ color: C.green, fontWeight: 600 }}>{fmt.yen(y.月次メリット)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {analysisTab === "yearly" && annualSummary.length === 0 && (
          <div className="empty-state" style={{ padding: "30px 0" }}>
            <div className="empty-desc">実績データがまだありません</div>
          </div>
        )}
      </div>

      {/* 計算方法の説明 */}
      <div style={{ marginBottom: 10 }}>
        <Disclosure title="計算方法" icon="📐">
          「導入なし推定」= 太陽光・蓄電池がなかった場合に総消費量を全て買電していた想定の電気代。北陸電力「くつろぎナイト12」の4つの時間帯区分（夏季昼間=7/1〜9/30の平日8-20時／その他季昼間=10/1〜翌6/30の平日8-20時／ウィークエンド=土日祝等の8-20時／夜間=20-翌8時）の使用比率を月別に推定し、それぞれの単価＋燃料調整費＋再エネ賦課金を適用（タップで内訳表示）。<br /><br />
          「実質コスト」= 実際の電気代 − 売電収入（売電収入が電気代を上回る月はマイナス＝その分も含めて月次メリットに反映）。<br /><br />
          「月次メリット」= 導入なし推定 − 実質コスト。
        </Disclosure>
      </div>

      {/* 月次比較詳細（リスト形式） */}
      {monthlyMerged.length > 0 && (
        <>
          <div className="section-label">月次比較詳細</div>

          {/* 合計カード */}
          <div className="card" style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>合計（{monthlyMerged.length}ヶ月）</div>
            <div className="grid-2" style={{ gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted }}>月次メリット合計</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
                  {fmt.yen(monthlyMerged.reduce((s, m) => s + m.月次メリット, 0))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.textMuted }}>導入なし推定合計</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.red }}>
                  {fmt.yen(monthlyMerged.reduce((s, m) => s + m.導入なし推定電気代, 0))}
                </div>
              </div>
            </div>
          </div>

          {/* 年ごとにグループ化してタップ展開（実績が増えるほど一覧が長くなるため） */}
          {(() => {
            const byYear = {};
            [...monthlyMerged].reverse().forEach(m => {
              const year = m.month.slice(0, 4);
              if (!byYear[year]) byYear[year] = [];
              byYear[year].push(m);
            });
            const years = Object.keys(byYear).sort().reverse(); // 新しい年が上
            const latestYear = years[0];
            return years.map(year => (
              <Disclosure key={year} title={`${year}年（${byYear[year].length}ヶ月）`} defaultOpen={year === latestYear}>
                <div className="list-group">
                  {byYear[year].map(m => {
              const isOpen = breakdownMonth?.month === m.month && monthDetailOpen;
              return (
                <div key={m.month}>
                  <div className="list-cell" onClick={() => {
                    if (monthDetailOpen && breakdownMonth?.month === m.month) {
                      setMonthDetailOpen(false);
                    } else {
                      setBreakdownMonth(m);
                      setMonthDetailOpen(true);
                    }
                  }}>
                    <div className="list-cell-main">
                      <span className="list-cell-title">{fmt.month(m.month)}</span>
                      <span className="list-cell-subtitle">
                        導入なし推定 {fmt.yen(m.導入なし推定電気代)}
                        {m.csvBased && <span style={{ color: C.green }}> ・CSV精密</span>}
                      </span>
                    </div>
                    <span className="list-cell-value" style={{ color: C.green }}>
                      {fmt.yen(m.月次メリット)}
                    </span>
                    <span className={`list-cell-chevron${isOpen ? " expanded" : ""}`}>▸</span>
                  </div>
                  {isOpen && (
                    <div className="list-cell-detail">
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>導入なし推定</span>
                        <span style={{ fontWeight: 600, color: C.red, cursor: (m.noSolarBreakdown || m.noSolarBreakdown4) ? "pointer" : "default" }}
                          onClick={() => (m.noSolarBreakdown || m.noSolarBreakdown4) && setShowBreakdownModal(true)}>
                          {fmt.yen(m.導入なし推定電気代)} {(m.noSolarBreakdown || m.noSolarBreakdown4) && "🔍"}
                        </span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>現在の電気代</span>
                        <span style={{ fontWeight: 600 }}>{fmt.yen(m.現在の電気代)}</span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>
                          売電収入{m.売電収入実績 ? "（実績）" : "（推定）"}
                        </span>
                        <span style={{ fontWeight: 600, color: C.sun }}>{fmt.yen(m.売電収入)}</span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>実質コスト</span>
                        <span style={{ fontWeight: 600, color: m.実質コスト < 0 ? C.green : C.textPrimary }}>
                          {m.実質コスト < 0 ? `+${fmt.yen(Math.abs(m.実質コスト))}（売電が上回り得）` : fmt.yen(m.実質コスト)}
                        </span>
                      </div>
                      <div className="list-cell-detail-row">
                        <span style={{ color: C.textMuted }}>節電効果</span>
                        <span style={{ fontWeight: 600, color: C.green }}>{fmt.yen(m.節電効果)}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
                  })}
                </div>
              </Disclosure>
            ));
          })()}
        </>
      )}

      {/* 「導入なし推定」の内訳モーダル */}
      {showBreakdownModal && breakdownMonth && (breakdownMonth.noSolarBreakdown || breakdownMonth.noSolarBreakdown4) && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9997,
          background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          /* [Phase 3] inline styleのモーダルにもSafe Area対応を適用 */
          padding: "max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
        }} onClick={() => setShowBreakdownModal(false)}>
          <div style={{
            background: C.surface, borderRadius: 16,
            padding: 22, maxWidth: 380, width: "100%", boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
            maxHeight: "85vh", overflowY: "auto",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.red }}>
                {fmt.month(breakdownMonth.month)}の導入なし推定 内訳
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBreakdownModal(false)}>✕</button>
            </div>

            {breakdownMonth.noSolarBreakdown4 ? (
              // CSV精密版：4区分（夏季昼間・その他季昼間・ウィークエンド・夜間）の内訳
              (() => {
                const b = breakdownMonth.noSolarBreakdown4;
                const rows = [
                  ["夏季昼間",       b.summerKwh,  b.summerRate,  b.summerCost, b.csvRatioSummer,  "7/1〜9/30の平日 8:00-20:00"],
                  ["その他季昼間",   b.otherKwh,   b.otherRate,   b.otherCost,  b.csvRatioOther,   "10/1〜翌6/30の平日 8:00-20:00"],
                  ["ウィークエンド", b.weekendKwh, b.weekendRate, b.weekendCost, b.csvRatioWeekend, "土・日・祝日等 8:00-20:00（季節共通）"],
                  ["夜間",           b.nightKwh,   b.nightRate,   b.nightCost,  b.csvRatioNight,   "20:00〜翌8:00（年間共通12時間）"],
                ];
                return (
                  <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.8 }}>
                    <div style={{
                      background: C.greenDim, borderRadius: 8, padding: 12, marginBottom: 12,
                      fontSize: 12, color: C.green, lineHeight: 1.7
                    }}>
                      ✓ アップロードしたCSVから「時間帯別の使用比率」を算出し、その月の実際の総消費量に当てはめて計算しています（CSVの絶対量は太陽光導入後の買電分のみのため、比率の参考にのみ使用）。
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>時間帯</th>
                          <th style={{ textAlign: "right" }}>配分量</th>
                          <th style={{ textAlign: "right" }}>単価</th>
                          <th style={{ textAlign: "right" }}>小計</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={3} style={{ color: C.textMuted }}>基本料金</td>
                          <td className="num">{fmt.yen(b.basicFee)}</td>
                        </tr>
                        {rows.map(([label, kwh, rate, cost, ratio, timeDef]) => (
                          <tr key={label}>
                            <td style={{ color: C.textMuted }}>
                              {label}<span style={{fontSize:9, marginLeft:4, color:C.textMuted}}>({ratio}%)</span>
                              <div style={{ fontSize: 9, color: C.textMuted, opacity: 0.7 }}>{timeDef}</div>
                            </td>
                            <td className="num">{kwh} kWh</td>
                            <td className="num">{rate} 円</td>
                            <td className="num">{fmt.yen(cost)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} style={{ color: C.red, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>合計</td>
                          <td className="num" style={{ color: C.red, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                            {fmt.yen(breakdownMonth.導入なし推定電気代)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()
            ) : (
              // 簡易推定版：4区分（夏季昼間・その他季昼間・ウィークエンド・夜間）の内訳
              (() => {
                const b = breakdownMonth.noSolarBreakdown;
                const pct = b.ratioPct;
                const rows = [
                  ["夏季昼間",       b.summerKwh,  b.summerRate,  b.summerCost,  pct.summer,  "7/1〜9/30の平日 8:00-20:00"],
                  ["その他季昼間",   b.otherKwh,   b.otherRate,   b.otherCost,   pct.other,   "10/1〜翌6/30の平日 8:00-20:00"],
                  ["ウィークエンド", b.weekendKwh, b.weekendRate, b.weekendCost, pct.weekend, "土・日・祝日等 8:00-20:00（季節共通）"],
                  ["夜間",           b.nightKwh,   b.nightRate,   b.nightCost,   pct.night,   "20:00〜翌8:00（年間共通12時間）"],
                ];
                return (
                  <div style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.8 }}>
                    <div style={{
                      background: C.panel, borderRadius: 8, padding: 12, marginBottom: 12,
                      fontSize: 12, color: C.textMuted, lineHeight: 1.7
                    }}>
                      総消費量を、北陸電力「くつろぎナイト12」の4つの時間帯区分の比率で分配して計算しています（実測CSVデータに基づく月別の生活パターン）。CSVをアップロードすると、この月も実測の時間帯別データで精密計算できます。
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>時間帯</th>
                          <th style={{ textAlign: "right" }}>配分量</th>
                          <th style={{ textAlign: "right" }}>単価</th>
                          <th style={{ textAlign: "right" }}>小計</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={3} style={{ color: C.textMuted }}>基本料金</td>
                          <td className="num">{fmt.yen(b.basicFee)}</td>
                        </tr>
                        {rows.map(([label, kwh, rate, cost, ratioPct, timeDef]) => (
                          <tr key={label}>
                            <td style={{ color: C.textMuted }}>
                              {label}<span style={{fontSize:9, marginLeft:4, color:C.textMuted}}>({ratioPct}%)</span>
                              <div style={{ fontSize: 9, color: C.textMuted, opacity: 0.7 }}>{timeDef}</div>
                            </td>
                            <td className="num">{kwh} kWh</td>
                            <td className="num">{rate} 円</td>
                            <td className="num">{fmt.yen(cost)}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3} style={{ color: C.red, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>合計</td>
                          <td className="num" style={{ color: C.red, fontWeight: 700, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                            {fmt.yen(breakdownMonth.導入なし推定電気代)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* ── CSVアップロード ── */}
      <div style={{ marginBottom: 16 }}>
        <Disclosure title="時間帯別利用実績CSVによる精密分析" icon="🔬">
          電力会社からダウンロードした30分値の利用実績CSV（北陸電力フォーマット：年月日 + 時間帯別使用量 + 夏季昼間/その他季昼間/ウィークエンド/夜間の区分）をアップロードすると、
          「くつろぎナイト12」を継続していた場合の電気代を、実際の利用時間帯まで考慮して精密に計算します。
        </Disclosure>
        <div className="card" style={{ marginTop: 8 }}>
          {!csvAnalysis ? (
            <div>
              <input type="file" accept=".csv" ref={fileInputRef}
                onChange={handleCsvUpload} style={{ display: "none" }} id="csv-upload-input" />
              <button className="btn btn-primary" disabled={csvUploading}
                onClick={() => fileInputRef.current?.click()}>
                {csvUploading ? "解析中…" : "📁 CSVファイルを選択"}
              </button>
              {csvError && (
                <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>⚠ {csvError}</div>
              )}
            </div>
          ) : (
            <div>
              <div style={{
                background: C.panel, borderRadius: 8, padding: 12,
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10
              }}>
                <div style={{ fontSize: 12, color: C.textSecondary }}>
                  <span className="status-dot green" />
                  <strong style={{ color: C.textPrimary }}>{csvAnalysis.fileName ?? "CSVデータ"}</strong>　
                  期間: {csvAnalysis.dateRange?.from} 〜 {csvAnalysis.dateRange?.to}　
                  ({csvAnalysis.totalDays}日 / {csvAnalysis.months.length}ヶ月分)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
                    再アップロード
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={handleClearCsv}>削除</button>
                </div>
              </div>
              <input type="file" accept=".csv" ref={fileInputRef}
                onChange={handleCsvUpload} style={{ display: "none" }} />
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                ✓ {csvAnalyzedMonthCount}ヶ月分の月次比較に、CSVベースの精密な「くつろぎナイト12」料金を反映済み
              </div>
            </div>
          )}
        </div>
      </div>

      {records.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <div className="empty-title">実績データを入力するとシミュレーションが表示されます</div>
            <div className="empty-desc">「実績管理」タブから月次データを入力してください</div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 設定 ---
function SettingsScreen({
  settings, setSettings, onSave, setRecords, onFullReset, onImportExcel, onExportData, onImportData, themeMode, setThemeMode,
  cloudConfig, cloudStatus, cloudLastSyncedAt, onConnectCloud, onDisconnectCloud, onManualSync, onManualPull,
}) {
  const [form, setForm] = useState({ ...settings });
  const backupFileInputRef = useRef(null);
  const [cloudForm, setCloudForm] = useState({ binId: "", masterKey: "" });

  useEffect(() => { setForm({ ...settings }); }, [settings]);

  const handleChange = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = () => {
    const parsed = {
      ...form,
      installCost:      parseFloat(form.installCost) || 0,
      subsidy:          parseFloat(form.subsidy)     || 0,
      fitRate:          parseFloat(form.fitRate)      || 0,
      fitEndYear:       parseInt(form.fitEndYear)     || 2033,
      systemCapacity:   parseFloat(form.systemCapacity) || 0,
      batteryCapacity:  parseFloat(form.batteryCapacity) || 0,
      co2Factor:        parseFloat(form.co2Factor)    || 0.439,
      evDiscount:       parseFloat(form.evDiscount)   || 0,
    };
    setSettings(parsed);
    onSave(parsed);
    toast("設定を保存しました", "success");
  };

  const fields = [
    { key:"installCost",     label:"導入費用（円）",           hint:"太陽光 + 蓄電池の総設置費用（補助金込みの実質負担額）" },
    { key:"subsidy",         label:"補助金（円）",             hint:"受領済みの国・自治体補助金（導入費用に含まれている場合は0）" },
    { key:"fitRate",         label:"FIT売電単価（円/kWh）",    hint:"固定価格買取制度の単価（実績: 8円/kWh）" },
    { key:"fitEndYear",      label:"FIT終了年",                hint:"FIT契約の満了年（例: 2033）" },
    { key:"systemCapacity",  label:"太陽光パネル容量（kW）",   hint:"公称最大出力（例: 8.010）" },
    { key:"batteryCapacity", label:"蓄電池容量（kWh）",        hint:"蓄電池の定格容量（例: 15）" },
    { key:"co2Factor",       label:"CO₂排出係数（kg/kWh）",   hint:"電力会社の係数（北陸電力: 0.439）" },
    { key:"evDiscount",      label:"EV割引額（円/月）",        hint:"出光でんきの基本料金から割引される金額（200円）" },
  ];

  // [Phase 5] 機器交換イベント（パワコン交換・将来の蓄電池交換等）の管理。
  // 他の設定項目（installCost等）は「保存する」ボタンを押すまでローカルのform stateに
  // 留まるが、このセクションだけは即時保存方式とする（ユーザー確認済みの方針）。
  // settingsの実体を直接書き換え、setSettings + onSave（永続化）を即座に呼ぶ。
  const maintenanceEvents = settings.maintenanceEvents ?? [];

  const commitMaintenanceEvents = (nextEvents) => {
    const next = { ...settings, maintenanceEvents: nextEvents };
    setSettings(next);
    onSave(next);
  };

  const addMaintenanceEvent = () => {
    const newEvent = {
      id: `me_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: "パワコン交換",
      month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      cost: 0,
    };
    commitMaintenanceEvents([...maintenanceEvents, newEvent]);
    fireHaptic("light");
  };

  const updateMaintenanceEvent = (id, key, val) => {
    commitMaintenanceEvents(
      maintenanceEvents.map(e => (e.id === id ? { ...e, [key]: val } : e))
    );
  };

  const deleteMaintenanceEvent = (id) => {
    const target = maintenanceEvents.find(e => e.id === id);
    if (!target) return;
    const nextEvents = maintenanceEvents.filter(e => e.id !== id);
    commitMaintenanceEvents(nextEvents);
    fireHaptic("light");
    // [Phase 4方針を継続] 即削除＋4秒間取り消し可能。確認モーダルは使わない
    // （1件削除はUndoで救える規模の操作のため、Phase 4のUndo Snackbar方針と統一）。
    undoToast(`「${target.label}」を削除しました`, () => {
      commitMaintenanceEvents([...nextEvents, target]);
    });
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <span className="page-title-icon" style={{ background: "#8E8E93" }}><TabIcon name="gear" color="#fff" size={20} /></span>
          設定
        </div>
        <div className="page-subtitle">導入情報と基本パラメータ</div>
      </div>

      {/* [Phase 1] 表示モード（ライト/ダーク/自動） */}
      <div className="section-label">表示</div>
      <div className="list-group" style={{ marginBottom: 16 }}>
        <div className="settings-row">
          <div>
            <div className="settings-row-label">外観モード</div>
            <div className="settings-row-hint">「自動」はiPhone/iPadの設定に追従します</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["auto",  "自動"],
              ["light", "ライト"],
              ["dark",  "ダーク"],
            ].map(([value, label]) => (
              <button key={value}
                className={`btn btn-sm ${themeMode === value ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setThemeMode(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-label">基本設定</div>
      <div className="list-group" style={{ marginBottom: 16 }}>
        {/* 導入年月だけ専用のmonth inputで表示 */}
        <div className="settings-row">
          <div>
            <div className="settings-row-label">導入年月</div>
            <div className="settings-row-hint">太陽光システムの運転開始月</div>
          </div>
          <input
            type="month"
            className="form-input"
            style={{width:160}}
            value={form.installedAt ?? ""}
            onChange={e => setForm(p => ({ ...p, installedAt: e.target.value }))}
          />
        </div>

        {fields.map(f => (
          <div key={f.key} className="settings-row">
            <div>
              <div className="settings-row-label">{f.label}</div>
              <div className="settings-row-hint">{f.hint}</div>
            </div>
            <input
              className="form-input"
              style={{width:140, textAlign:"right"}}
              value={form[f.key] ?? ""}
              onChange={e => handleChange(f.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {/* [Phase 5] 機器交換イベント（パワコン交換・将来の蓄電池交換等）。
          他の設定項目とは異なり、追加・削除した瞬間に即時保存される（ユーザー確認済みの方針）。
          回収グラフ上では、登録した年月に費用が一括減算され「段差」として表示される。 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 4 }}>
        <div className="section-label" style={{ margin: 0 }}>機器交換イベント</div>
        <button className="btn btn-secondary btn-sm" onClick={addMaintenanceEvent}>+ 追加</button>
      </div>
      <div className="settings-row-hint" style={{ marginBottom: 10 }}>
        パワコン交換・蓄電池交換など、将来発生する想定の費用を登録すると、回収グラフ上でその年月に一括減算され段差として表示されます。
      </div>
      {maintenanceEvents.length === 0 ? (
        <div className="list-group" style={{ marginBottom: 16 }}>
          <div className="list-cell no-tap">
            <span className="settings-row-hint">登録されている機器交換イベントはありません</span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {maintenanceEvents.map(ev => (
            <div key={ev.id} style={{
              display: "grid", gridTemplateColumns: "1fr 130px 110px 36px",
              gap: 8, marginBottom: 8, alignItems: "center"
            }}>
              <input className="form-input" placeholder="例：パワコン交換"
                value={ev.label}
                onChange={e => updateMaintenanceEvent(ev.id, "label", e.target.value)} />
              <input type="month" className="form-input"
                value={ev.month ?? ""}
                onChange={e => updateMaintenanceEvent(ev.id, "month", e.target.value)} />
              <input type="number" className="form-input" style={{ textAlign: "right" }}
                placeholder="費用（円）"
                value={ev.cost}
                onChange={e => updateMaintenanceEvent(ev.id, "cost", parseFloat(e.target.value) || 0)} />
              <button className="btn btn-danger btn-sm" style={{ padding: "5px 8px" }}
                onClick={() => deleteMaintenanceEvent(ev.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginBottom: 24 }} onClick={handleSave}>
        保存する
      </button>

      <div className="section-label">データ管理</div>

      {/* [クラウド同期] jsonbin.io（無料のクラウドJSON保存サービス）に本体データを保存し、
          Safariの自動データ削除やホーム画面追加時の保存領域の違いによるデータ消失を防ぐ。
          Bin ID・X-Master-Keyはこの端末のlocalStorageにのみ保存し、ソースコードには含めない
          （このリポジトリはGitHub Pagesで公開されるPublicリポジトリのため）。 */}
      <Disclosure title="クラウド同期（jsonbin.io）" icon="☁️" defaultOpen>
        <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          データをjsonbin.ioにも自動保存し、端末やSafariの状態に左右されにくくします。通信できない場合は
          自動でローカル保存のみに切り替わり、入力・閲覧は継続できます。
        </div>

        {!cloudConfig ? (
          <>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Bin ID</label>
              <input type="text" className="form-input" autoCapitalize="off" autoCorrect="off"
                value={cloudForm.binId}
                onChange={e => setCloudForm(p => ({ ...p, binId: e.target.value }))}
                placeholder="jsonbin.ioで作成したBinのID"
              />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">X-Master-Key</label>
              <input type="password" className="form-input" autoCapitalize="off" autoCorrect="off"
                value={cloudForm.masterKey}
                onChange={e => setCloudForm(p => ({ ...p, masterKey: e.target.value }))}
                placeholder="jsonbin.io アカウント設定 → API Keys"
              />
            </div>
            <div style={{ fontSize: 11.5, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
              「接続」を押すと、この端末の現在のデータをクラウドへ送信して同期を開始します（Bin内の既存の内容は上書きされます）。
            </div>
            <button className="btn btn-primary btn-sm"
              onClick={() => onConnectCloud?.(cloudForm.binId.trim(), cloudForm.masterKey.trim())}
            >
              ☁️ 接続して同期を開始
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{
                display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                background: cloudStatus === "error" ? C.red : cloudStatus === "syncing" ? C.sun : C.green
              }} />
              <span style={{ fontSize: 12.5, color: C.textSecondary }}>
                {cloudStatus === "syncing" && "同期中…"}
                {cloudStatus === "synced" && `同期済み（最終: ${cloudLastSyncedAt ? new Date(cloudLastSyncedAt).toLocaleString("ja-JP") : "-"}）`}
                {cloudStatus === "error" && "同期エラー（ローカル保存のみで継続中）"}
                {(!cloudStatus || cloudStatus === "idle") && "待機中"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-secondary btn-sm" onClick={onManualSync}>🔄 今すぐ送信</button>
              <button className="btn btn-secondary btn-sm" onClick={onManualPull}>⬇️ クラウドから読込</button>
              <button className="btn btn-danger btn-sm" onClick={async () => {
                const ok = await askConfirm("クラウド同期を解除します。クラウド上のデータはそのまま残り、この端末はローカル保存のみに戻ります。よろしいですか？", { confirmLabel: "解除する" });
                if (!ok) return;
                onDisconnectCloud?.();
              }}>
                同期を解除
              </button>
            </div>
          </>
        )}
      </Disclosure>

      {/* [バックアップ機能] iPadのホーム画面に追加したアプリと、claude.aiのチャット内プレビューで
          公開URLが異なる場合や、コード更新で新しいアーティファクトとして再生成された場合、
          localStorageは引き継がれない。そのため、データをファイルとして書き出し・読み込みできる
          ようにし、機種変更やコード更新の前後でユーザー自身がデータを引き継げるようにする。 */}
      {(onExportData || onImportData) && (
        <Disclosure title="データのバックアップ・復元" icon="💾" defaultOpen>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
            iPadのホーム画面に追加したり、ダッシュボードを更新したりすると、保存先が変わりデータが
            引き継がれないことがあります。定期的にバックアップを取り、必要なときに復元してください。
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {onExportData && (
              <button className="btn btn-secondary btn-sm" onClick={onExportData}>
                ⬇️ バックアップをダウンロード
              </button>
            )}
            {onImportData && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => backupFileInputRef.current?.click()}>
                  ⬆️ バックアップから復元
                </button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ""; // 同じファイルを連続で選び直せるようにリセット
                    if (file) await onImportData(file);
                  }}
                />
              </>
            )}
          </div>
        </Disclosure>
      )}

      <Disclosure title="実績Excelの再取り込み・初期化" icon="🗂">
        {onImportExcel && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 10, lineHeight: 1.6 }}>
              実績Excel（太陽光記録）のデータで実績・単価・燃料調整費を上書きします。
            </div>
            <button className="btn btn-secondary btn-sm" onClick={async () => {
              const ok = await askConfirm("実績Excelのデータで現在の実績・単価設定を上書きします。\nよろしいですか？", { confirmLabel: "取り込む" });
              if (!ok) return;
              await onImportExcel(true);
            }}>
              📥 実績Excelを再取り込み（上書き）
            </button>
          </div>
        )}
        <div style={{display:"flex", gap:10, flexWrap:"wrap"}}>
          <button className="btn btn-secondary btn-sm" onClick={async () => {
            const ok = await askConfirm("すべての実績データを削除します。\nよろしいですか？", { danger: true, confirmLabel: "削除する" });
            if (!ok) return;
            await storageSet("monthly-records", []);
            setRecords([]);
            toast("実績データをリセットしました", "info");
          }}>
            🗑 実績データをリセット
          </button>
          <button className="btn btn-danger btn-sm" onClick={async () => {
            const ok = await askConfirm("設定・実績・単価データをすべて初期化します。\nこの操作は取り消せません。よろしいですか？", { danger: true, confirmLabel: "初期化する" });
            if (!ok) return;
            const keys = ["settings","monthly-records","tariff-current","tariff-compare","tariff-current-history","tariff-compare-history","addon-history","csv-analysis","excel-import-done"];
            for (const k of keys) await storageDelete(k).catch(()=>{});
            onFullReset?.();
            toast("全データを初期化しました", "info");
          }}>
            ⚠ 全データを初期化
          </button>
        </div>
      </Disclosure>
    </div>
  );
}


// ─────────────────────────────────────────────
// メインアプリ
// ─────────────────────────────────────────────
export default function App() {
  const [activeTab,     setActiveTab]     = useState("dashboard");
  const [loading,       setLoading]       = useState(true);
  const [settings,      setSettings]      = useState(DEFAULT_SETTINGS);
  const [records,       setRecords]       = useState([]);

  // [Phase 1] ダークモード対応：OSの配色設定（prefers-color-scheme）を検知し、
  // Cオブジェクトの中身を書き換えてから再レンダリングする。
  // themeMode: "auto"（OS設定に追従） | "light"（固定） | "dark"（固定）
  const [themeMode, setThemeMode] = useState("auto");
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const isPad = useMediaQuery("(min-width: 1024px)");
  const resolvedDark = themeMode === "auto" ? prefersDark : themeMode === "dark";
  // [Phase 3] Top barのsticky縮小アニメ：スクロール検知用sentinelとフック。
  // iPadサイドバー構成（isPad）ではトップバー自体が存在しないため、この値は
  // 非iPad構成（topbar表示時）のみJSX側で参照する。
  const topbarSentinelRef = useRef(null);
  const scrolled = useScrolled(topbarSentinelRef);

  // [Phase 4] 左右スワイプでタブ移動。
  // TABS配列上の前後のタブへ移動する。iPadサイドバー構成（isPad）では
  // 設計書の指示通り無効化する（ペイン構成のため、横スワイプは別の意味を持つ可能性がある）。
  const goToAdjacentTab = useCallback((delta) => {
    const idx = TABS.findIndex(t => t.id === activeTab);
    if (idx === -1) return;
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= TABS.length) return; // 端では何もしない（ループしない）
    setActiveTab(TABS[nextIdx].id);
    fireHaptic("light");
  }, [activeTab]);
  const swipeHandlers = useSwipeNav(
    () => goToAdjacentTab(1),   // 左スワイプ＝次のタブ
    () => goToAdjacentTab(-1),  // 右スワイプ＝前のタブ
    !isPad
  );

  // [Phase 4] タブのタップ時にも軽いハプティクスを鳴らす（同じタブの再タップでは鳴らさない）。
  const handleTabClick = useCallback((id) => {
    if (id !== activeTab) fireHaptic("light");
    setActiveTab(id);
  }, [activeTab]);
  // レンダー前にCの中身を確定させる（useLayoutEffectではなくレンダー中に同期実行することで、
  // 初回フレームでの一瞬のテーマ不一致を防ぐ）
  applyTheme(resolvedDark ? "dark" : "light");

  const [tariffCurrent, setTariffCurrent] = useState(DEFAULT_TARIFF_CURRENT);
  const [tariffCompare, setTariffCompare] = useState(DEFAULT_TARIFF_COMPARE);
  // 単価履歴（月ごとに異なる単価を適用するため）
  const [tariffCurrentHistory, setTariffCurrentHistory] = useState([
    DEFAULT_TARIFF_CURRENT_BEFORE_SWITCH,
    DEFAULT_TARIFF_CURRENT,
  ]);
  const [tariffCompareHistory, setTariffCompareHistory] = useState([DEFAULT_TARIFF_COMPARE]);
  // 月別の燃料調整費・再エネ賦課金（実績に基づく細かい変動を管理）
  const [addonHistory, setAddonHistory] = useState({ ...DEFAULT_ADDON_HISTORY });
  // CSV分析結果のキャッシュ
  const [csvAnalysis, setCsvAnalysis] = useState(null);
  // 初回のみ表示するインポート案内（既にインポート済み/データがある場合は出さない）
  const [showImportBanner, setShowImportBanner] = useState(false);

  // 実績フォームの状態をここで保持（タブ切替で消えないようにする）
  const [recordForm,     setRecordForm]     = useState({ ...EMPTY_RECORD_FORM });
  const [recordEditId,   setRecordEditId]   = useState(null);
  const [recordShowForm, setRecordShowForm] = useState(false);

  // ── クラウド同期（jsonbin.io） ──
  // Bin ID/Keyはソースコードに含めず、この端末のlocalStorageから読む（詳細は cloudFetch/cloudPush 参照）。
  const [cloudConfigState, setCloudConfigState] = useState(() => getCloudConfig());
  const [cloudStatus, setCloudStatus] = useState("idle"); // idle | syncing | synced | error
  const [cloudLastSyncedAt, setCloudLastSyncedAt] = useState(null);
  const initialLoadDoneRef = useRef(false); // 初期ロード中の状態反映を自動送信の対象から除外するため
  const cloudPushTimerRef = useRef(null);

  // ── 初期ロード ──
  // ローカル(localStorage)を先に読み込み、クラウド同期が設定済みならクラウド側の値で
  // 上書きする（クラウドを「本体」、ローカルを「オフラインキャッシュ」として扱う）。
  // クラウドへの通信が失敗した場合（未接続・ネットワークブロック等）は、
  // 読み込んだローカルの値のままフォールバックして継続する。
  useEffect(() => {
    (async () => {
      const [s, r, tch, tcomph, ah, csv, imported] = await Promise.all([
        storageGet("settings"),
        storageGet("monthly-records"),
        storageGet("tariff-current-history"),
        storageGet("tariff-compare-history"),
        storageGet("addon-history"),
        storageGet("csv-analysis"),
        storageGet("excel-import-done"),
      ]);

      let finalSettings = s, finalRecords = r, finalTch = tch, finalTcomph = tcomph, finalAh = ah, finalCsv = csv;

      const cfg = getCloudConfig();
      if (cfg) {
        setCloudStatus("syncing");
        const cloudRecord = await cloudFetch(cfg);
        if (cloudRecord && typeof cloudRecord === "object") {
          if (cloudRecord.settings) finalSettings = cloudRecord.settings;
          if (Array.isArray(cloudRecord.records)) finalRecords = cloudRecord.records;
          if (Array.isArray(cloudRecord.tariffCurrentHistory) && cloudRecord.tariffCurrentHistory.length) finalTch = cloudRecord.tariffCurrentHistory;
          if (Array.isArray(cloudRecord.tariffCompareHistory) && cloudRecord.tariffCompareHistory.length) finalTcomph = cloudRecord.tariffCompareHistory;
          if (cloudRecord.addonHistory) finalAh = cloudRecord.addonHistory;
          if ("csvAnalysis" in cloudRecord) finalCsv = cloudRecord.csvAnalysis;

          // 次回オフライン起動時のフォールバック用に、ローカルキャッシュにも反映しておく
          await Promise.all([
            storageSet("settings", finalSettings),
            storageSet("monthly-records", finalRecords),
            storageSet("tariff-current-history", finalTch),
            storageSet("tariff-compare-history", finalTcomph),
            storageSet("addon-history", finalAh),
            storageSet("csv-analysis", finalCsv),
          ]);
          setCloudStatus("synced");
          setCloudLastSyncedAt(new Date().toISOString());
        } else {
          // 通信失敗・未認証等。ローカルの値のまま継続する。
          setCloudStatus("error");
        }
      }

      if (finalSettings) setSettings(finalSettings);
      if (finalRecords) setRecords(finalRecords);
      if (finalTch && finalTch.length) {
        setTariffCurrentHistory(finalTch);
        setTariffCurrent(finalTch[finalTch.length - 1]);
      } else {
        // 旧バージョンからの移行: 単一tariffがあれば履歴の先頭に
        const legacy = await storageGet("tariff-current");
        if (legacy) {
          const hist = [{ ...legacy, effectiveFrom: legacy.effectiveFrom ?? "2024-01" }];
          setTariffCurrentHistory(hist);
          setTariffCurrent(legacy);
        }
      }
      if (finalTcomph && finalTcomph.length) {
        setTariffCompareHistory(finalTcomph);
        setTariffCompare(finalTcomph[finalTcomph.length - 1]);
      } else {
        const legacy = await storageGet("tariff-compare");
        if (legacy) {
          const hist = [{ ...legacy, effectiveFrom: legacy.effectiveFrom ?? "2024-01" }];
          setTariffCompareHistory(hist);
          setTariffCompare(legacy);
        }
      }
      if (finalAh) setAddonHistory(finalAh);
      if (finalCsv) setCsvAnalysis(finalCsv);
      // 実績データが空で、まだExcelインポートを実行していない場合のみ案内バナーを表示
      if ((!finalRecords || finalRecords.length === 0) && !imported) {
        setShowImportBanner(true);
      }
      setLoading(false);
      initialLoadDoneRef.current = true; // これ以降の変更だけをクラウドへの自動送信対象にする
    })();
  }, []);

  // ── 保存ヘルパー ──
  const saveSettings   = useCallback((v) => storageSet("settings", v), []);
  const saveRecords    = useCallback((v) => storageSet("monthly-records", v), []);
  const saveTariffCurrentHistory = useCallback((v) => storageSet("tariff-current-history", v), []);
  const saveTariffCompareHistory = useCallback((v) => storageSet("tariff-compare-history", v), []);
  const saveCsvAnalysis = useCallback((v) => storageSet("csv-analysis", v), []);
  const saveAddonHistory = useCallback((v) => storageSet("addon-history", v), []);

  // ── クラウド同期: 自動送信（デバウンス） ──
  const buildCloudPayload = useCallback(() => ({
    settings, records, tariffCurrentHistory, tariffCompareHistory, addonHistory, csvAnalysis,
    syncedAt: new Date().toISOString(),
  }), [settings, records, tariffCurrentHistory, tariffCompareHistory, addonHistory, csvAnalysis]);

  const flushCloudPush = useCallback(async (keepalive) => {
    if (!cloudConfigState) return;
    if (cloudPushTimerRef.current) { clearTimeout(cloudPushTimerRef.current); cloudPushTimerRef.current = null; }
    setCloudStatus("syncing");
    const ok = await cloudPush(cloudConfigState, buildCloudPayload(), keepalive);
    if (ok) {
      setCloudStatus("synced");
      setCloudLastSyncedAt(new Date().toISOString());
    } else {
      setCloudStatus("error");
    }
  }, [cloudConfigState, buildCloudPayload]);

  // データが変化するたびに、少し待ってからまとめてクラウドへ送信する（連打・連続入力の負荷軽減）
  useEffect(() => {
    if (!initialLoadDoneRef.current) return; // 初期ロード中の反映では送信しない
    if (!cloudConfigState) return;
    if (cloudPushTimerRef.current) clearTimeout(cloudPushTimerRef.current);
    cloudPushTimerRef.current = setTimeout(() => { flushCloudPush(false); }, CLOUD_DEBOUNCE_MS);
    return () => { if (cloudPushTimerRef.current) clearTimeout(cloudPushTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, records, tariffCurrentHistory, tariffCompareHistory, addonHistory, csvAnalysis, cloudConfigState]);

  // タブが隠れる瞬間（ホーム画面に戻る・アプリ切替等）に、送信待ちの変更があれば即座に送信する
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden" && cloudPushTimerRef.current) {
        flushCloudPush(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("pagehide", handler);
    };
  }, [flushCloudPush]);

  // ── クラウド同期: 接続・解除・手動操作 ──
  const handleConnectCloud = async (binId, masterKey) => {
    if (!binId || !masterKey) { toast("Bin IDとX-Master-Keyの両方を入力してください", "error"); return; }
    const cfg = { binId, masterKey };
    setCloudStatus("syncing");
    // 接続時は「この端末の現在のデータ」をクラウドへ送信する（プル方向ではない）。
    // 診断用に作成しただけのBinや、他端末の古いデータで上書きされてしまうのを防ぐため。
    const payload = {
      settings, records, tariffCurrentHistory, tariffCompareHistory, addonHistory, csvAnalysis,
      syncedAt: new Date().toISOString(),
    };
    const ok = await cloudPush(cfg, payload);
    if (ok) {
      setCloudConfig(cfg);
      setCloudConfigState(cfg);
      setCloudStatus("synced");
      setCloudLastSyncedAt(new Date().toISOString());
      toast("クラウド同期を開始しました", "success");
    } else {
      setCloudStatus("error");
      toast("接続に失敗しました。Bin ID・Keyを確認するか、通信環境をご確認ください", "error");
    }
  };

  const handleDisconnectCloud = () => {
    setCloudConfig(null);
    setCloudConfigState(null);
    setCloudStatus("idle");
    setCloudLastSyncedAt(null);
    toast("クラウド同期を解除しました（ローカル保存のみで継続します）", "info");
  };

  const handleManualSync = () => flushCloudPush(false);

  const handleManualPull = async () => {
    if (!cloudConfigState) return;
    setCloudStatus("syncing");
    const cloudRecord = await cloudFetch(cloudConfigState);
    if (!cloudRecord) {
      setCloudStatus("error");
      toast("クラウドからの読込に失敗しました", "error");
      return;
    }
    if (cloudRecord.settings) { setSettings(cloudRecord.settings); saveSettings(cloudRecord.settings); }
    if (Array.isArray(cloudRecord.records)) { setRecords(cloudRecord.records); saveRecords(cloudRecord.records); }
    if (Array.isArray(cloudRecord.tariffCurrentHistory) && cloudRecord.tariffCurrentHistory.length) {
      setTariffCurrentHistory(cloudRecord.tariffCurrentHistory);
      setTariffCurrent(cloudRecord.tariffCurrentHistory[cloudRecord.tariffCurrentHistory.length - 1]);
      saveTariffCurrentHistory(cloudRecord.tariffCurrentHistory);
    }
    if (Array.isArray(cloudRecord.tariffCompareHistory) && cloudRecord.tariffCompareHistory.length) {
      setTariffCompareHistory(cloudRecord.tariffCompareHistory);
      setTariffCompare(cloudRecord.tariffCompareHistory[cloudRecord.tariffCompareHistory.length - 1]);
      saveTariffCompareHistory(cloudRecord.tariffCompareHistory);
    }
    if (cloudRecord.addonHistory) { setAddonHistory(cloudRecord.addonHistory); saveAddonHistory(cloudRecord.addonHistory); }
    if ("csvAnalysis" in cloudRecord) { setCsvAnalysis(cloudRecord.csvAnalysis); saveCsvAnalysis(cloudRecord.csvAnalysis); }
    setCloudStatus("synced");
    setCloudLastSyncedAt(new Date().toISOString());
    toast("クラウドから読み込みました", "success");
  };

  // 単価履歴に新しいエントリを追加/更新するヘルパー（最新を末尾、effectiveFromでソート）
  const updateTariffHistory = (which, newTariff) => {
    const isCurrent = which === "current";
    const history = isCurrent ? tariffCurrentHistory : tariffCompareHistory;
    const existingIdx = history.findIndex(h => h.effectiveFrom === newTariff.effectiveFrom);
    let next;
    if (existingIdx >= 0) {
      next = history.map((h, i) => i === existingIdx ? newTariff : h);
    } else {
      next = [...history, newTariff];
    }
    next.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    if (isCurrent) {
      setTariffCurrentHistory(next);
      saveTariffCurrentHistory(next);
      setTariffCurrent(next[next.length - 1]);
    } else {
      setTariffCompareHistory(next);
      saveTariffCompareHistory(next);
      setTariffCompare(next[next.length - 1]);
    }
  };

  const deleteTariffHistoryEntry = (which, effectiveFrom) => {
    const isCurrent = which === "current";
    const history = isCurrent ? tariffCurrentHistory : tariffCompareHistory;
    const next = history.filter(h => h.effectiveFrom !== effectiveFrom);
    if (next.length === 0) return; // 最低1件は残す
    if (isCurrent) {
      setTariffCurrentHistory(next);
      saveTariffCurrentHistory(next);
      setTariffCurrent(next[next.length - 1]);
    } else {
      setTariffCompareHistory(next);
      saveTariffCompareHistory(next);
      setTariffCompare(next[next.length - 1]);
    }
  };

  // Excel実績データを取り込む（既存データとマージ。同じ月は実績Excel側で上書き）
  const handleImportExcelData = async (overwrite) => {
    let nextRecords;
    if (overwrite) {
      nextRecords = IMPORTED_RECORDS.map(r => ({ ...r, id: `rec-${r.month}` }));
    } else {
      const existingMonths = new Set(records.map(r => r.month));
      const toAdd = IMPORTED_RECORDS
        .filter(r => !existingMonths.has(r.month))
        .map(r => ({ ...r, id: `rec-${r.month}` }));
      nextRecords = [...records, ...toAdd];
    }
    nextRecords.sort((a, b) => a.month.localeCompare(b.month));
    setRecords(nextRecords);
    saveRecords(nextRecords);

    // 比較プラン（北陸電力「くつろぎナイト12」）: 全期間 基本料金2,255円固定（EV割なし）
    const newCompareHistory = [{ ...DEFAULT_TARIFF_COMPARE, effectiveFrom: "2025-01" }];
    setTariffCompareHistory(newCompareHistory);
    saveTariffCompareHistory(newCompareHistory);
    setTariffCompare(newCompareHistory[newCompareHistory.length - 1]);

    // 現契約: 2025-01〜06は北陸電力直接契約(2,255円)、2025-07以降は出光でんき(EV割適用1,945円)
    const newCurrentHistory = [
      { ...DEFAULT_TARIFF_CURRENT_BEFORE_SWITCH },
      { ...DEFAULT_TARIFF_CURRENT },
    ];
    setTariffCurrentHistory(newCurrentHistory);
    saveTariffCurrentHistory(newCurrentHistory);
    setTariffCurrent(newCurrentHistory[newCurrentHistory.length - 1]);

    setAddonHistory({ ...DEFAULT_ADDON_HISTORY });
    saveAddonHistory({ ...DEFAULT_ADDON_HISTORY });

    const newSettings = { ...settings, ...DEFAULT_SETTINGS };
    setSettings(newSettings);
    saveSettings(newSettings);

    await storageSet("excel-import-done", true);
    setShowImportBanner(false);
    toast(`実績Excelから${IMPORTED_RECORDS.length}ヶ月分のデータを取り込みました`, "success");
  };

  const dismissImportBanner = async () => {
    await storageSet("excel-import-done", true);
    setShowImportBanner(false);
  };

  const handleFullReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setRecords([]);
    setTariffCurrentHistory([DEFAULT_TARIFF_CURRENT_BEFORE_SWITCH, DEFAULT_TARIFF_CURRENT]);
    setTariffCompareHistory([DEFAULT_TARIFF_COMPARE]);
    setTariffCurrent(DEFAULT_TARIFF_CURRENT);
    setTariffCompare(DEFAULT_TARIFF_COMPARE);
    setAddonHistory({ ...DEFAULT_ADDON_HISTORY });
    setCsvAnalysis(null);
  };

  // [バックアップ機能] iPadのホーム画面に追加したアーティファクトと、claude.aiのチャット内
  // プレビューとでオリジン（公開URL）が異なる場合、localStorageは共有されない。
  // また、コード更新で新しいアーティファクトとして再生成されると、その時点でlocalStorageは
  // 空の状態から始まる。そのため、全データを1つのJSONファイルとして書き出し・読み込みできる
  // バックアップ機能を用意し、コード更新時や機種変更時にユーザー自身でデータを引き継げるようにする。
  const BACKUP_VERSION = 1;
  const handleExportData = () => {
    const payload = {
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
      records,
      tariffCurrentHistory,
      tariffCompareHistory,
      addonHistory,
      csvAnalysis,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `solar-dashboard-backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("バックアップファイルをダウンロードしました", "success");
  };

  const handleImportData = async (file) => {
    let payload;
    try {
      const text = await file.text();
      payload = JSON.parse(text);
    } catch {
      toast("バックアップファイルを読み込めませんでした（JSON形式ではありません）", "error");
      return;
    }
    // 最低限の妥当性チェック：エクスポート時に必ず付与しているキーが揃っているか確認する。
    // 無関係なJSONファイルを誤って読み込んでデータが壊れることを防ぐ。
    const hasExpectedShape = payload && typeof payload === "object"
      && ("settings" in payload) && ("records" in payload) && ("addonHistory" in payload);
    if (!hasExpectedShape) {
      toast("このダッシュボードのバックアップファイルではないようです", "error");
      return;
    }
    const exportedAtLabel = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString("ja-JP") : "不明な日時";
    const ok = await askConfirm(
      `${exportedAtLabel}時点のバックアップを読み込みます。\n現在表示中のデータは上書きされます。\nよろしいですか？`,
      { danger: true, confirmLabel: "復元する" }
    );
    if (!ok) return;

    const nextSettings = payload.settings ?? DEFAULT_SETTINGS;
    const nextRecords = Array.isArray(payload.records) ? payload.records : [];
    const nextTariffCurrentHistory = Array.isArray(payload.tariffCurrentHistory) && payload.tariffCurrentHistory.length
      ? payload.tariffCurrentHistory
      : [DEFAULT_TARIFF_CURRENT_BEFORE_SWITCH, DEFAULT_TARIFF_CURRENT];
    const nextTariffCompareHistory = Array.isArray(payload.tariffCompareHistory) && payload.tariffCompareHistory.length
      ? payload.tariffCompareHistory
      : [DEFAULT_TARIFF_COMPARE];
    const nextAddonHistory = payload.addonHistory ?? { ...DEFAULT_ADDON_HISTORY };
    const nextCsvAnalysis = payload.csvAnalysis ?? null;

    setSettings(nextSettings);
    setRecords(nextRecords);
    setTariffCurrentHistory(nextTariffCurrentHistory);
    setTariffCompareHistory(nextTariffCompareHistory);
    setTariffCurrent(nextTariffCurrentHistory[nextTariffCurrentHistory.length - 1]);
    setTariffCompare(nextTariffCompareHistory[nextTariffCompareHistory.length - 1]);
    setAddonHistory(nextAddonHistory);
    setCsvAnalysis(nextCsvAnalysis);

    // 画面のstateだけでなく、永続ストレージ（localStorage）側にも反映しておく。
    // これを行わないと、復元直後にアプリを再読み込みした際に元のデータへ戻ってしまう。
    await Promise.all([
      saveSettings(nextSettings),
      saveRecords(nextRecords),
      saveTariffCurrentHistory(nextTariffCurrentHistory),
      saveTariffCompareHistory(nextTariffCompareHistory),
      saveAddonHistory(nextAddonHistory),
      saveCsvAnalysis(nextCsvAnalysis),
    ]);

    toast("バックアップからデータを復元しました", "success");
  };

  if (loading) {
    return (
      <div style={{
        minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
        background: C.bg, color: C.textSecondary, fontFamily:"'Inter',sans-serif",
        flexDirection:"column", gap:16
      }}>
        <div className="sun-icon" style={{fontSize:40}}>☀</div>
        <div>データを読み込んでいます…</div>
      </div>
    );
  }

  // すべてのタブを常時マウントし、display:noneで切り替える
  // → タブ切替でコンポーネントがアンマウントされず、入力中の値が消えない

  // 経済メリットの計算は calcMonthlyComparison を「唯一の正」として一度だけ実行し、
  // ダッシュボード・シミュレーション・回収管理の3画面で同じ結果を共有する。
  // CSV分析結果（csvAnalysis）も一緒に渡し、CSVがある月は精密値が自動的に使われるようにする。
  // （以前は各画面が独自の簡易計算式を持っていたり、CSV精密化がSimulationScreen内だけで
  //   行われていたりしたため、画面間で表示金額が矛盾していた）
  const monthlyComparison = calcMonthlyComparison(
    records, tariffCurrentHistory, tariffCompareHistory, settings, addonHistory, csvAnalysis
  );

  const screens = [
    { id: "dashboard", node: (
      <div>
        {showImportBanner && (
          <ImportBanner onImport={handleImportExcelData} onDismiss={dismissImportBanner} />
        )}
        <DashboardScreen records={records} settings={settings} monthlyComparison={monthlyComparison} />
      </div>
    )},
    { id: "records", node: (
      <RecordsScreen
        records={records}
        setRecords={(v) => { setRecords(v); saveRecords(v); }}
        settings={settings}
        tariffCurrentHistory={tariffCurrentHistory}
        form={recordForm} setForm={setRecordForm}
        editId={recordEditId} setEditId={setRecordEditId}
        showForm={recordShowForm} setShowForm={setRecordShowForm}
        addonHistory={addonHistory}
        setAddonHistory={(v) => { setAddonHistory(v); saveAddonHistory(v); }}
      />
    )},
    { id: "tariff", node: (
      <TariffScreen
        tariffCurrentHistory={tariffCurrentHistory}
        tariffCompareHistory={tariffCompareHistory}
        updateTariffHistory={updateTariffHistory}
        deleteTariffHistoryEntry={deleteTariffHistoryEntry}
        addonHistory={addonHistory}
        setAddonHistory={(v) => { setAddonHistory(v); saveAddonHistory(v); }}
        settings={settings}
      />
    )},
    { id: "simulation", node: (
      <SimulationScreen
        records={records}
        tariffCurrentHistory={tariffCurrentHistory}
        tariffCompareHistory={tariffCompareHistory}
        settings={settings}
        csvAnalysis={csvAnalysis}
        setCsvAnalysis={(v) => { setCsvAnalysis(v); saveCsvAnalysis(v); }}
        addonHistory={addonHistory}
        monthlyComparison={monthlyComparison}
      />
    )},
    { id: "recovery", node: (
      <RecoveryScreen records={records} settings={settings} addonHistory={addonHistory} monthlyComparison={monthlyComparison} />
    )},
    { id: "settings", node: (
      <SettingsScreen
        settings={settings}
        setSettings={setSettings}
        onSave={saveSettings}
        setRecords={(v) => { setRecords(v); saveRecords(v); }}
        onFullReset={handleFullReset}
        onImportExcel={handleImportExcelData}
        onExportData={handleExportData}
        onImportData={handleImportData}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        cloudConfig={cloudConfigState}
        cloudStatus={cloudStatus}
        cloudLastSyncedAt={cloudLastSyncedAt}
        onConnectCloud={handleConnectCloud}
        onDisconnectCloud={handleDisconnectCloud}
        onManualSync={handleManualSync}
        onManualPull={handleManualPull}
      />
    )},
  ];

  return (
    <>
      <style>{getStyles()}</style>

      {isPad ? (
        /* ── [Phase 3] 1024px以上：左サイドバー構成 ──
            isPad（useMediaQueryによるJS側の幅判定）でレイアウトそのものを切り替える。
            CSSのメディアクエリだけで両方を常時レンダリングすると、フォーム入力中のstateを
            持つ子コンポーネント（RecordsScreen等）が2つ同時に存在してしまい、画面回転や
            Split Viewのリサイズ時に入力内容が失われる事故につながるため、
            ナビゲーションの構造自体はJSで一本化し、コンテンツは常に1箇所だけにレンダリングする。 */
        <div className="app-shell-with-sidebar">
          <aside className="sidebar">
            <div className="sidebar-logo">
              <div>
                <div className="topbar-logo-text">SolarManager</div>
                <div className="topbar-logo-sub">太陽光・蓄電池 投資回収管理</div>
              </div>
            </div>
            <nav className="sidebar-nav">
              {TABS.map(t => (
                <button
                  key={t.id}
                  className={`sidebar-tab${activeTab === t.id ? " active" : ""}`}
                  onClick={() => handleTabClick(t.id)}
                >
                  <span className="sidebar-tab-icon"><TabIcon name={t.icon} active={activeTab === t.id} /></span>
                  {t.label}
                </button>
              ))}
            </nav>
            <div className="sidebar-status">
              <span className="status-dot green" />
              {records.length}件の実績
            </div>
          </aside>

          <main className="content-with-sidebar">
            {screens.map(s => (
              <div key={s.id} className={`tab-panel ${activeTab === s.id ? "tab-panel-active" : "tab-panel-inactive"}`} aria-hidden={activeTab !== s.id}>
                {s.node}
              </div>
            ))}
          </main>
        </div>
      ) : (
        /* ── 1023px以下：従来のトップバー＋ボトムナビ構成 ── */
        <div className="app-shell">

          {/* [Phase 3] Top barのsticky縮小アニメ用sentinel。
              この1px要素が画面外に出た（=ページが少しでもスクロールされた）タイミングで
              IntersectionObserver経由でscrolled=trueになり、トップバーが縮む。 */}
          <div ref={topbarSentinelRef} style={{ height: 1 }} aria-hidden="true" />

          {/* ── トップバー ── */}
          <header className={`topbar${scrolled ? " scrolled" : ""}`}>
            <div className="topbar-logo">
              <div>
                <div className="topbar-logo-text">SolarManager</div>
                <div className="topbar-logo-sub">太陽光・蓄電池 投資回収管理</div>
              </div>
            </div>

            {/* デスクトップ: 上部タブ */}
            <div className="topbar-divider" />
            <nav className="nav-tabs-top">
              {TABS.map(t => (
                <button
                  key={t.id}
                  className={`nav-tab-top${activeTab === t.id ? " active" : ""}`}
                  onClick={() => handleTabClick(t.id)}
                >
                  <TabIcon name={t.icon} active={activeTab === t.id} />
                  {t.label}
                </button>
              ))}
            </nav>

            {/* ステータス */}
            <div className="topbar-status" style={{display:"flex", alignItems:"center", gap:8, flexShrink:0}}>
              <span className="status-dot green" />
              <span style={{fontSize:12, color:C.textMuted}}>
                {records.length}件の実績
              </span>
            </div>
          </header>

          {/* ── コンテンツ（全タブ常時マウント） ── */}
          <main className="main-content" onTouchStart={swipeHandlers.onTouchStart} onTouchEnd={swipeHandlers.onTouchEnd}>
            {screens.map(s => (
              <div key={s.id} className={`tab-panel ${activeTab === s.id ? "tab-panel-active" : "tab-panel-inactive"}`} aria-hidden={activeTab !== s.id}>
                {s.node}
              </div>
            ))}
          </main>

          {/* ── モバイル: ボトムナビゲーション（iOS純正TabBar） ── */}
          <nav className="bottom-nav">
            <div className="bottom-nav-inner">
              {TABS.map(t => (
                <button
                  key={t.id}
                  className={`bottom-nav-tab${activeTab === t.id ? " active" : ""}`}
                  onClick={() => handleTabClick(t.id)}
                >
                  <span className="bottom-nav-icon"><TabIcon name={t.icon} active={activeTab === t.id} /></span>
                  <span className="bottom-nav-label">{t.label}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}

      <ToastContainer />
      <ConfirmDialog />
    </>
  );
}
