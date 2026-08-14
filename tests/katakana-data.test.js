import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const vocabulary = JSON.parse(await readFile(
  new URL("../data/jlpt-n5-vocabulary.json", import.meta.url),
  "utf8"
));

const katakanaWords = vocabulary.filter(({ term }) => /^[ァ-ヶー]+$/u.test(term));
const terms = new Set(katakanaWords.map(({ term }) => term));
const smallKatakana = new Set(["ァ", "ィ", "ゥ", "ェ", "ォ", "ャ", "ュ", "ョ", "ヮ"]);

function segmentKatakana(value) {
  const parts = [];

  for (const character of value) {
    if (smallKatakana.has(character) && parts.length > 0 && parts.at(-1) !== "ッ") {
      parts[parts.length - 1] += character;
    } else {
      parts.push(character);
    }
  }

  return parts;
}

test("Katakana vocabulary covers the normalized former JLPT Level 4 subset", () => {
  const formerLevel4Terms = [
    "アパート", "エレベーター", "カップ", "カメラ", "カレー", "カレンダー",
    "ギター", "キロ", "クラス", "グラス", "コート", "コーヒー", "コップ",
    "コピー", "シャツ", "シャワー", "スカート", "ストーブ", "スプーン",
    "スポーツ", "ズボン", "スリッパ", "セーター", "ゼロ", "タクシー",
    "テープ", "テーブル", "テープレコーダー", "テスト", "デパート", "テレビ",
    "ドア", "トイレ", "ナイフ", "ニュース", "ネクタイ", "ノート", "パーティー",
    "バス", "バター", "パン", "ハンカチ", "フィルム", "プール", "フォーク",
    "ページ", "ベッド", "ペット", "ペン", "ボールペン", "ポケット", "ポスト",
    "ボタン", "ホテル", "マッチ", "メートル", "ラジオ", "ラジカセ", "レコード",
    "レストラン", "ワイシャツ"
  ];

  assert.deepEqual(
    formerLevel4Terms.filter((term) => !terms.has(term)),
    []
  );
});

test("Katakana pool has practical breadth and all natural basic characters", () => {
  const basicKatakana = [
    ..."アイウエオカキクケコサシスセソタチツテトナニヌネノ",
    ..."ハヒフヘホマミムメモヤユヨラリルレロワヲン"
  ];
  const inventory = new Set(katakanaWords.flatMap(({ term }) => segmentKatakana(term)));

  assert.equal(katakanaWords.length, 120);
  assert.equal(terms.size, 119);
  assert.deepEqual(
    basicKatakana.filter((kana) => !inventory.has(kana)),
    ["ヲ"]
  );

  for (const item of [
    "キャ", "キュ", "シャ", "シュ", "ショ", "チャ", "チョ", "ニュ",
    "リュ", "ジャ", "ジュ", "ジョ", "ファ", "フィ", "フェ", "フォ", "ティ",
    "ッ", "ー"
  ]) {
    assert.ok(inventory.has(item), `Missing Katakana learning item ${item}`);
  }
});

test("curated Katakana entries have normalized readings and stable IDs", () => {
  const curated = vocabulary.filter(({ source }) => {
    return source === "curated-katakana-curriculum";
  });

  assert.equal(curated.length, 37);

  for (const entry of curated) {
    const expectedId = createHash("sha256")
      .update(`${entry.term}\0${entry.reading}`)
      .digest("hex")
      .slice(0, 12);

    assert.match(entry.term, /^[ァ-ヶー]+$/u);
    assert.match(entry.reading, /^[ぁ-ゖー]+$/u);
    assert.equal(entry.id, `vocab-${expectedId}`);
    assert.equal(entry.scope, "supplemental");
    assert.ok(entry.topic);
  }
});
