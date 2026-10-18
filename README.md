# AyayaJpType

日语单词盲打闯关：题目只给中文，凭记忆打出 N5 / N4 / N3 单词的罗马音。

线上：https://ayaya114514.github.io/AyayaJpType/

- 词表来自 [AyayaJp](https://github.com/ayaya114514/AyayaJp) 的规范词表（`〜円`、`お〜` 这类词缀除外），每个级别按固定顺序打乱后每关约 20 词。
- 不显示词形、假名和罗马音，打对的部分才显示出来；卡住按 `Tab`（手机点「不会」）看答案再照打。
- 打错过或看过答案的词算不会：全会 ★★★，不会 1 个 ★★，不会 2 个 ★ 并解锁下一关。进度存在浏览器 `localStorage`。
- 错题集：不会的词自动收进来（按 N5 / N4 / N3 筛选），每次练最近错的 20 个；闯关或练习里连续答对 2 次才移出。错题练习不计星、不影响解锁。
- 多读音的词任一读法都算对（日本 にほん / にっぽん、梅雨 つゆ / ばいう）；中文释义完全相同的词互相算对（幸福：幸福 / 幸せ）。
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
