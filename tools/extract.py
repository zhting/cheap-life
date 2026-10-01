#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""extract.py —— 把 book/ 的原书 Markdown 解析成 data/cards.json。

规则（技术方案「书中内容如何变成游戏」）：
1. 读 book/ 的 34 个章节文件，按 `### n. 标题` 切条，读 `<!-- 成本标签: ... -->`
   注释和 成本/说人话/证据等级 条目。
2. 所有条目进入卡池，不做任何筛选。
3. 卡面文字取「说人话」的完整句子，最长约 150 字，只在句号处截断，不改写。
4. 按 content/tag-rules.json 给每条打 0-3 个主题标签；人工覆盖在 content/tag-overrides.json。
5. 输出 data/cards.json，含 meta 供校验与规则版本比对。
"""
import io
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOOK = os.path.join(ROOT, "book")
CONTENT = os.path.join(ROOT, "content")
OUT = os.path.join(ROOT, "data", "cards.json")

# 章节号 -> 建筑 id（方案「建筑与章的对应」表，除"家"外 10 栋建筑按章分完全部 640+ 条）
CHAPTER_BUILDING = {
    1: "hospital", 2: "hospital", 16: "hospital", 24: "hospital", 28: "hospital", 34: "hospital",
    13: "rescue",
    5: "bank",
    6: "market",
    7: "hr", 19: "hr", 23: "hr",
    8: "police", 9: "police", 11: "police", 14: "police", 21: "police",
    3: "school", 4: "school", 30: "school", 31: "school", 32: "school",
    10: "community", 15: "community", 17: "community", 18: "community", 20: "community",
    25: "community", 27: "community", 29: "community", 33: "community",
    22: "park",
    12: "incubator", 26: "incubator",
}

MONEY = {"0": 0, "少": 1, "多": 6}        # 千元
TIME = {"少": 1, "中": 2, "多": 3}        # 行动点
WILL = {"否": 0, "些": 1, "是": 2}        # 毅力槽
DOMAIN = {"死亡率": "h", "金钱": "m", "自由": "f", "时间": "e"}

ENTRY_HEAD = re.compile(r"^### (\d+)\. (.+)$")
COST_COMMENT = re.compile(
    r"<!--\s*成本标签[:：]\s*钱=(\S+)\s+时间=(\S+)\s+毅力=(\S+)\s+收益=(\S+)\s+口径=(\S+?)\s*-->"
)


def cut_plain(text, limit=150):
    """取完整句子，最长约 150 字，只在句号处截断，不改写。"""
    if len(text) <= limit:
        return text
    idx = -1
    for m in re.finditer("。", text[: limit + 1]):
        idx = m.end()
    if idx <= 0:
        # 150 字内没有句号：退到第一个句号（说人话几乎必有，纯防御）
        first = text.find("。")
        idx = first + 1 if first >= 0 else limit
    return text[:idx]


def parse_file(path):
    name = os.path.basename(path)
    m = re.match(r"(\d+)-", name)
    if not m:
        return []
    chapter = int(m.group(1))
    text = io.open(path, encoding="utf-8").read()
    cards = []
    parts = re.split(r"\n(?=### \d+\. )", text)
    for part in parts:
        head = ENTRY_HEAD.match(part.split("\n", 1)[0].strip())
        if not head:
            continue
        num = int(head.group(1))
        title = head.group(2).strip()
        cm = COST_COMMENT.search(part)
        if not cm:
            raise SystemExit(f"{name} #{num} 缺少成本标签注释")
        money_raw, time_raw, will_raw, benefit_raw, domain_raw = cm.groups()

        plain_full = ""
        grade = ""
        for line in part.splitlines():
            line = line.strip()
            if line.startswith("- 说人话：") or line.startswith("- 说人话:"):
                plain_full = line[len("- 说人话："):].strip()
            elif line.startswith("- 证据等级：") or line.startswith("- 证据等级:"):
                grade = line[len("- 证据等级："):].strip()
        if not plain_full:
            raise SystemExit(f"{name} #{num} 缺少说人话")
        gm = re.match(r"([ABC])", grade)
        if not gm:
            raise SystemExit(f"{name} #{num} 证据等级无法识别: {grade!r}")

        cards.append({
            "id": f"{chapter}.{num}",
            "chapter": chapter,
            "title": title,
            "plain": cut_plain(plain_full),
            "cost": {
                "money": MONEY[money_raw],
                "time": TIME[time_raw],
                "will": WILL[will_raw],
            },
            "benefit": {"level": benefit_raw, "domain": DOMAIN[domain_raw]},
            "grade": gm.group(1),
        })
    return cards


def load_json(path):
    return json.load(io.open(path, encoding="utf-8"))


def assign_tags(cards, rules, overrides):
    tags = {t["id"]: t for t in rules["tags"]}
    max_per = rules.get("maxPerCard", 3)
    kw_w = rules.get("keywordWeight", 2)
    ch_w = rules.get("chapterWeight", 1)
    defaults = {int(k): v for k, v in rules["chapterDefaults"].items()}

    for card in cards:
        scored = {}
        hay = card["title"] + "\n" + card["plain"]
        for tid, t in tags.items():
            hits = sum(1 for kw in t.get("keywords", []) if kw in hay)
            if hits:
                scored[tid] = scored.get(tid, 0) + hits * kw_w
        for tid in defaults.get(card["chapter"], []):
            scored[tid] = scored.get(tid, 0) + ch_w
        ordered = sorted(scored.items(), key=lambda kv: (-kv[1], kv[0]))
        card["tags"] = [tid for tid, _ in ordered[:max_per]]

    for card in cards:
        ov = overrides.get(card["id"])
        if ov:
            card["tags"] = list(ov["tags"])

    # 校验项「每个标签至少 3 张卡」的前置保证：卡数不足 3 的标签没有匹配能力，直接裁掉并报告
    from collections import Counter
    counts = Counter(t for c in cards for t in c["tags"])
    dropped = sorted(t for t, n in counts.items() if n < 3)
    if dropped:
        print("裁掉卡数不足 3 的标签:", " ".join(dropped))
        for c in cards:
            c["tags"] = [t for t in c["tags"] if t not in dropped]


def main():
    files = sorted(
        f for f in (os.path.join(BOOK, n) for n in os.listdir(BOOK))
        if f.endswith(".md") and re.match(r"\d+-", os.path.basename(f))
    )
    if len(files) != 34:
        raise SystemExit(f"预期 34 个章节文件，实际 {len(files)}")

    cards = []
    for path in files:
        cards.extend(parse_file(path))

    ids = [c["id"] for c in cards]
    if len(set(ids)) != len(ids):
        dup = sorted({i for i in ids if ids.count(i) > 1})
        raise SystemExit(f"id 重复: {dup}")

    rules = load_json(os.path.join(CONTENT, "tag-rules.json"))
    overrides_path = os.path.join(CONTENT, "tag-overrides.json")
    overrides = load_json(overrides_path) if os.path.exists(overrides_path) else {}
    assign_tags(cards, rules, overrides)

    for c in cards:
        c["building"] = CHAPTER_BUILDING[c["chapter"]]

    out = {
        "meta": {
            "source": "eternity4719/HowToLiveBetter《高性价比人生指南》",
            "license": "CC BY 4.0",
            "extracted": date.today().isoformat(),
            "count": len(cards),
            "chapters": 34,
        },
        "cards": cards,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with io.open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    print(f"cards.json 写入完成：{len(cards)} 条")


if __name__ == "__main__":
    sys.exit(main())
