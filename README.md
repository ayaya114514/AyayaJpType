# AyayaJpType

日语单词打字闯关：看 N5 / N4 / N3 单词，打罗马音过关。

线上：https://ayaya114514.github.io/AyayaJpType/

- 词表来自 [AyayaJp](https://github.com/ayaya114514/AyayaJp) 的规范词表（`〜円`、`お〜` 这类词缀除外），每个级别按固定顺序打乱后每关约 20 词。
- 准确率 ≥ 90% 过关并解锁下一关；★★ 需 95% 且 120 键/分，★★★ 需 98% 且 200 键/分。进度存在浏览器 `localStorage`。
- 按假名逐个判定，Hepburn / 訓令式（shi/si、tsu/tu、chi/ti、fu/hu、ji/zi）、`nn` / `n'`、促音双写或 `xtu`、长音 `-` 都可以；助词 は / へ / を 按词表 romaji 接受 wa / e / o。

## 开发

```sh
source ~/.nvm/nvm.sh && nvm use
npm install
npm run dev
npm test          # 判定器单测 + 全词表逐词回放
npm run build
```

AyayaJp 词表更新后：`npm run sync:words`（默认读 `../AyayaJp`），它会校验每个词的 romaji 都能按读音打出来，再生成 `src/words.json`。
