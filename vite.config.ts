import { defineConfig } from 'vite'

export default defineConfig({
  base: '/AyayaJpType/',
  // 句子数据单独成一个 ~1.6 MB 的 chunk，切到句子模式才加载，不用为它报警
  build: { chunkSizeWarningLimit: 2000 },
})
